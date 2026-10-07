import { createHash } from 'node:crypto';
import { LIMITS, StudioError, summaryPrompt, validateSummary } from '../common/summary.mjs';
import { exportMarkdown, listRecords, readRecord, writeRecord } from './storage.mjs';

const unfinished = (record) => ['queued', 'running'].includes(record.status);
const sameDirectory = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const digest = (text) => createHash('md5').update(text).digest('hex');

export class SummaryJobs {
  #active = new Map();

  async start(directory, raw, generate) {
    const input = validateSummary(raw);
    const fingerprint = digest(JSON.stringify(input));
    try {
      const previous = await this.get(directory, input.id);
      if (previous.fingerprint !== fingerprint) throw new StudioError('JOB_CONFLICT', 'This job identifier belongs to another request.', 409);
      return previous;
    } catch (error) {
      if (error.code !== 'NOT_FOUND') throw error;
    }
    if ([...this.#active.values()].some((job) => sameDirectory(job.directory, directory))) {
      throw new StudioError('BUSY', 'Wait for or cancel this project\'s current summary.', 409);
    }
    const record = {
      version: 1, id: input.id, format: 'summary', status: 'queued',
      createdAt: new Date().toISOString(), ownerPid: process.pid, fingerprint,
      source: { path: input.source.path, characters: input.source.content.length, md5: digest(input.source.content) },
      instructions: input.instructions, model: input.model, markdown: null, savedPath: null, error: null,
    };
    const controller = new AbortController();
    const job = { directory, record, controller };
    this.#active.set(record.id, job);
    try {
      await writeRecord(directory, record, true);
    } catch (error) {
      this.#active.delete(record.id);
      throw error;
    }
    job.finished = this.#run(job, input, generate);
    return this.public(record);
  }

  async #run(job, input, generate) {
    const { directory, record, controller } = job;
    const timeout = AbortSignal.timeout(300_000);
    try {
      if (controller.signal.aborted) return;
      record.status = 'running';
      await writeRecord(directory, record);
      const { text } = await generate(summaryPrompt(input), input.model, AbortSignal.any([controller.signal, timeout]));
      if (controller.signal.aborted) return;
      if (typeof text !== 'string' || !text.trim()) throw new StudioError('EMPTY_RESULT', 'The model returned no summary.');
      if (text.length > LIMITS.output || JSON.stringify({ text }).length > 180_000) {
        throw new StudioError('OUTPUT_TOO_LARGE', 'The model response exceeds this build\'s output limit. It was not truncated.');
      }
      record.markdown = text.trim() + '\n';
      record.status = 'completed';
      record.completedAt = new Date().toISOString();
    } catch (error) {
      if (controller.signal.aborted) return;
      record.status = 'failed';
      // Provider errors can contain request bodies or credentials. Only our own messages leave the service.
      record.error = error instanceof StudioError ? { code: error.code, message: error.message } : {
        code: timeout.aborted ? 'MODEL_TIMEOUT' : 'MODEL_FAILED',
        message: timeout.aborted
          ? 'Generation timed out. The provider may have billed work already started.'
          : 'Generation failed. Check this model and its connection in OpenChamber, then retry explicitly.',
      };
    } finally {
      try { await writeRecord(directory, record); }
      catch {
        record.status = 'failed';
        record.error = { code: 'STORAGE_FAILED', message: 'Studio could not save this summary. Check that the project is writable.' };
        console.error('Studio could not persist a job update. Existing records were not deleted.');
      }
      this.#active.delete(record.id);
    }
  }

  async get(directory, id) {
    const active = this.#active.get(id);
    if (active && sameDirectory(active.directory, directory)) {
      // Do not advertise a completed artifact before its final record reaches disk.
      if (['completed', 'failed'].includes(active.record.status)) await active.finished;
      return structuredClone(active.record);
    }
    const record = await readRecord(directory, id);
    if (unfinished(record)) {
      let ownerAlive = false;
      if (Number.isInteger(record.ownerPid) && record.ownerPid > 0 && record.ownerPid !== process.pid) {
        try { process.kill(record.ownerPid, 0); ownerAlive = true; } catch (error) { ownerAlive = error.code === 'EPERM'; }
      }
      if (!ownerAlive) {
        record.status = 'interrupted';
        record.error = { code: 'INTERRUPTED', message: 'Studio stopped before this summary completed. Regenerate explicitly.' };
        await writeRecord(directory, record);
      }
    }
    return record;
  }

  public(record, includeMarkdown = true) {
    const { fingerprint, ownerPid, instructions, ...visible } = record;
    if (!includeMarkdown) delete visible.markdown;
    return { ...visible, canCancel: this.#active.has(record.id) && unfinished(record) };
  }

  async list(directory, offset = 0) {
    const records = await listRecords(directory);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = await Promise.all(records.slice(offset, offset + 25).map((record) => this.get(directory, record.id)));
    return { jobs: page.map((record) => this.public(record, false)), total: records.length, next: offset + 25 < records.length ? offset + 25 : null };
  }

  async cancel(directory, id) {
    const job = this.#active.get(id);
    if (!job || !sameDirectory(job.directory, directory) || !unfinished(job.record)) {
      throw new StudioError('NOT_RUNNING', 'This Studio process has no running job with that identifier.', 409);
    }
    job.record.status = 'cancelled';
    job.controller.abort();
    await writeRecord(directory, job.record);
    return this.public(job.record);
  }

  async save(directory, id, filename) {
    const record = await this.get(directory, id);
    if (record.status !== 'completed') throw new StudioError('NOT_READY', 'Only a completed summary can be exported.', 409);
    const savedPath = await exportMarkdown(directory, record, filename);
    record.savedPath = savedPath;
    await writeRecord(directory, record);
    return { savedPath };
  }

  async stop() {
    await Promise.all([...this.#active.values()].map(async (job) => {
      job.record.status = 'interrupted';
      job.record.error = { code: 'INTERRUPTED', message: 'Studio stopped before this summary completed.' };
      job.controller.abort();
      await writeRecord(job.directory, job.record);
    }));
  }
}
