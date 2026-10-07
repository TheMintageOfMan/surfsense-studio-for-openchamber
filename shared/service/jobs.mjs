import { createHash } from 'node:crypto';
import { LIMITS, modelKey, StudioError } from '../common/core.mjs';
import { formatFor, validateJob } from '../common/formats.mjs';
import { buildFile, fileMeta } from './builders/index.mjs';
import { exportFile, exportUnique, listRecords, readArtifactFile, readRecord, writeArtifactFile, writeRecord } from './storage.mjs';

// Generous for 12 sections or 15 slides of text; a larger file means something went wrong.
const FILE_BYTES = 20 * 1024 * 1024;
// Jobs that may run at once in one project, and the time one model call may take.
const PARALLEL = 3;
const ATTEMPT_MS = 240_000;
// Failures another try can plausibly fix. Configuration and storage problems are not retried.
const RETRYABLE = new Set(['BAD_OUTPUT', 'EMPTY_RESULT', 'OUTPUT_TOO_LARGE', 'MODEL_FAILED', 'MODEL_TIMEOUT', 'MODEL_CONFIGURATION_REJECTED', 'BUILD_FAILED']);

const unfinished = (record) => ['queued', 'running'].includes(record.status);
const sameDirectory = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const digest = (text) => createHash('md5').update(text).digest('hex');
const clearOutput = (record) => Object.assign(record, { title: null, markdown: null, artifact: null, notes: [], file: null });

export class StudioJobs {
  #active = new Map();
  #locks = new Map();

  // `fallback` is an optional known-good model used once if the chosen model keeps failing.
  async start(directory, raw, generate, { fallback = null } = {}) {
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
    if ([...this.#active.values()].filter((job) => sameDirectory(job.directory, directory)).length >= PARALLEL) {
      throw new StudioError('BUSY', `Studio is already making ${PARALLEL} things in this project. Wait for one to finish.`, 409);
    }
    const sources = input.sources.map((source) => ({ path: source.path, characters: source.content.length, md5: digest(source.content) }));
    const record = {
      version: 1, id: input.id, format: format.key, status: 'queued',
      createdAt: new Date().toISOString(), ownerPid: process.pid, fingerprint,
      source: sources.length === 1 ? sources[0] : { path: input.source.path, characters: input.source.content.length, md5: digest(input.source.content) },
      sources, instructions: input.instructions, choice: input.choice, model: input.model, requestedModel: input.model, attempts: [],
      title: null, markdown: null, artifact: null, notes: [], file: null, progress: null, savedPath: null, error: null,
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
    job.finished = this.#run(job, input, format, generate, fallback);
    return this.public(record);
  }

  // One model call, parsed and built. Throws a StudioError describing what went wrong.
  async #attempt(job, input, format, generate, model) {
    const { directory, record, controller } = job;
    const timeout = AbortSignal.timeout(ATTEMPT_MS);
    let text;
    try {
      ({ text } = await generate(format.prompt(input), model, AbortSignal.any([controller.signal, timeout])));
    } catch (error) {
      if (error instanceof StudioError) throw error;
      // Provider errors can contain request bodies or credentials. Only our own messages leave the service.
      throw timeout.aborted
        ? new StudioError('MODEL_TIMEOUT', 'Generation timed out. The provider may have billed work already started.')
        : new StudioError('MODEL_FAILED', 'Generation failed. Check this model and its connection in OpenChamber.');
    }
    if (controller.signal.aborted) return;
    if (typeof text !== 'string' || !text.trim()) {
      // Seen live with a reasoning-heavy variant through OpenCode's stateless route.
      throw new StudioError('EMPTY_RESULT', 'The model returned no text.');
    }
    if (text.length > LIMITS.output) throw new StudioError('OUTPUT_TOO_LARGE', 'The model response exceeds this build\'s output limit. It was not truncated.');
    const built = format.build(text, input);
    Object.assign(record, { title: built.title, markdown: built.markdown, artifact: built.artifact ?? null, notes: built.notes ?? [], model });
    if (JSON.stringify(this.public(record)).length > LIMITS.response) {
      throw new StudioError('OUTPUT_TOO_LARGE', 'This artifact is too large for the host bridge. It was not truncated.');
    }
    if (format.binary) await this.#storeFile(directory, record, format);
  }

  async #run(job, input, format, generate, fallback) {
    const { directory, record, controller } = job;
    // Recover quietly: the chosen model gets a second try, then a known-good model gets one.
    // At most three billable calls per request; every attempt is recorded for the details view.
    const plan = [input.model, input.model];
    if (fallback && modelKey(fallback) !== modelKey(input.model)) plan.push(fallback);
    let lastError = null;
    try {
      record.status = 'running';
      await writeRecord(directory, record);
      for (let index = 0; index < plan.length; index += 1) {
        if (controller.signal.aborted) return;
        // A model the host refuses outright will not do better on a second try.
        if (index === 1 && lastError?.code === 'MODEL_CONFIGURATION_REJECTED') continue;
        try {
          await this.#attempt(job, input, format, generate, plan[index]);
          if (controller.signal.aborted) return;
          record.attempts.push({ model: plan[index], outcome: 'completed' });
          lastError = null;
          break;
        } catch (error) {
          if (controller.signal.aborted) return;
          lastError = error instanceof StudioError ? error : new StudioError('STUDIO_FAILED', 'Studio could not finish this request.');
          clearOutput(record);
          record.attempts.push({ model: plan[index], outcome: lastError.code });
          if (!RETRYABLE.has(lastError.code)) break;
          await writeRecord(directory, record);
        }
      }
      if (lastError) {
        record.status = 'failed';
        record.error = { code: lastError.code, message: lastError.message };
      } else {
        record.status = 'completed';
        record.completedAt = new Date().toISOString();
      }
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

  // The file is built once from the validated artifact; export copies these exact bytes.
  async #storeFile(directory, record, format) {
    let built;
    try { built = await buildFile(format.key, record.artifact, fileMeta(record)); }
    catch (error) {
      console.error(`Studio could not build a ${format.label} file: ${error?.message}`);
      throw new StudioError('BUILD_FAILED', `Studio could not build the ${format.label} file from this reply. Nothing was saved; regenerate explicitly.`);
    }
    if (built.bytes.length > FILE_BYTES) throw new StudioError('OUTPUT_TOO_LARGE', `The ${format.label} file exceeds this build's size limit.`);
    record.notes = [...record.notes, ...built.notes];
    const name = await writeArtifactFile(directory, record, format.extension, built.bytes);
    record.file = { name, bytes: built.bytes.length, md5: digest(built.bytes), pages: built.pages };
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
    const { fingerprint, ownerPid, ...visible } = record;
    if (!detail) {
      for (const field of ['markdown', 'artifact', 'notes', 'progress', 'instructions']) delete visible[field];
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

  // filename null picks a friendly unused name from the title, such as "Solar system (2).docx".
  save(directory, id, filename = null) {
    return this.#update(directory, id, async (record, format) => {
      let content;
      if (format.binary) {
        // Binary bytes are copied service-side; they never travel through the panel bridge.
        content = await readArtifactFile(directory, record, FILE_BYTES);
        if (digest(content) !== record.file.md5) throw new StudioError('FILE_CHANGED', 'The stored file no longer matches this artifact. Regenerate explicitly.', 409);
      } else content = format.exportContent ? format.exportContent(record) : record.markdown;
      record.savedPath = filename === null
        ? await exportUnique(directory, content, record.title || format.label, format.extension)
        : await exportFile(directory, content, filename, format.extension);
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
