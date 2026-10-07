import { createHash } from 'node:crypto';
import { LIMITS, StudioError } from '../common/core.mjs';
import { formatFor, validateJob } from '../common/formats.mjs';
import { exportFile, listRecords, readRecord, writeRecord } from './storage.mjs';

const unfinished = (record) => ['queued', 'running'].includes(record.status);
const sameDirectory = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const digest = (text) => createHash('md5').update(text).digest('hex');
const clearOutput = (record) => Object.assign(record, { title: null, markdown: null, artifact: null, notes: [] });

export class StudioJobs {
  #active = new Map();
  #locks = new Map();

  async start(directory, raw, generate) {
    const input = validateJob(raw);
    const format = formatFor(input.format);
    const fingerprint = digest(JSON.stringify(input));
    try {
      const previous = await this.get(directory, input.id);
      if (previous.fingerprint !== fingerprint) throw new StudioError('JOB_CONFLICT', 'This job identifier belongs to another request.', 409);
      return previous;
    } catch (error) {
      if (error.code !== 'NOT_FOUND') throw error;
    }
    if ([...this.#active.values()].some((job) => sameDirectory(job.directory, directory))) {
      throw new StudioError('BUSY', 'Wait for or cancel this project\'s current Studio job.', 409);
    }
    const record = {
      version: 1, id: input.id, format: format.key, status: 'queued',
      createdAt: new Date().toISOString(), ownerPid: process.pid, fingerprint,
      source: { path: input.source.path, characters: input.source.content.length, md5: digest(input.source.content) },
      instructions: input.instructions, model: input.model,
      title: null, markdown: null, artifact: null, notes: [], progress: null, savedPath: null, error: null,
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
    job.finished = this.#run(job, input, format, generate);
    return this.public(record);
  }

  async #run(job, input, format, generate) {
    const { directory, record, controller } = job;
    const timeout = AbortSignal.timeout(300_000);
    try {
      if (controller.signal.aborted) return;
      record.status = 'running';
      await writeRecord(directory, record);
      const { text } = await generate(format.prompt(input), input.model, AbortSignal.any([controller.signal, timeout]));
      if (controller.signal.aborted) return;
      if (typeof text !== 'string' || !text.trim()) {
        // Seen live with a reasoning-heavy variant through OpenCode's stateless route.
        throw new StudioError('EMPTY_RESULT', 'The model returned no text, so nothing was saved. If it uses a reasoning variant, try the model without a variant or choose another model, then regenerate explicitly.');
      }
      if (text.length > LIMITS.output) {
        throw new StudioError('OUTPUT_TOO_LARGE', 'The model response exceeds this build\'s output limit. It was not truncated.');
      }
      const built = format.build(text, input);
      Object.assign(record, { title: built.title, markdown: built.markdown, artifact: built.artifact ?? null, notes: built.notes ?? [] });
      if (JSON.stringify(this.public(record)).length > LIMITS.response) {
        throw new StudioError('OUTPUT_TOO_LARGE', 'This artifact is too large for the host bridge. It was not truncated.');
      }
      record.status = 'completed';
      record.completedAt = new Date().toISOString();
    } catch (error) {
      if (controller.signal.aborted) return;
      clearOutput(record);
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
        clearOutput(record);
        record.status = 'failed';
        record.error = { code: 'STORAGE_FAILED', message: 'Studio could not save this artifact. Check that the project is writable.' };
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
        record.error = { code: 'INTERRUPTED', message: 'Studio stopped before this job completed. Regenerate explicitly.' };
        await writeRecord(directory, record);
      }
    }
    return record;
  }

  public(record, detail = true) {
    const { fingerprint, ownerPid, instructions, ...visible } = record;
    if (!detail) {
      for (const field of ['markdown', 'artifact', 'notes', 'progress']) delete visible[field];
    }
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

  // Serializes read-modify-write updates of one saved record (export and progress).
  async #update(directory, id, change) {
    const previous = this.#locks.get(id) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
      const record = await this.get(directory, id);
      if (record.status !== 'completed') throw new StudioError('NOT_READY', 'Only a completed artifact can be changed or exported.', 409);
      const result = await change(record, formatFor(record.format));
      await writeRecord(directory, record);
      return result;
    });
    this.#locks.set(id, run);
    try { return await run; }
    finally { if (this.#locks.get(id) === run) this.#locks.delete(id); }
  }

  save(directory, id, filename) {
    return this.#update(directory, id, async (record, format) => {
      const content = format.exportContent ? format.exportContent(record) : record.markdown;
      record.savedPath = await exportFile(directory, content, filename, format.extension);
      return { savedPath: record.savedPath };
    });
  }

  saveProgress(directory, id, value) {
    return this.#update(directory, id, async (record, format) => {
      if (!format.validateProgress) throw new StudioError('NO_PROGRESS', `${format.label} has no study progress.`, 409);
      record.progress = format.validateProgress(record.artifact, value);
      record.progressUpdatedAt = new Date().toISOString();
      return { progress: record.progress };
    });
  }

  async stop() {
    await Promise.all([...this.#active.values()].map(async (job) => {
      job.record.status = 'interrupted';
      job.record.error = { code: 'INTERRUPTED', message: 'Studio stopped before this job completed.' };
      job.controller.abort();
      await writeRecord(job.directory, job.record);
    }));
  }
}
