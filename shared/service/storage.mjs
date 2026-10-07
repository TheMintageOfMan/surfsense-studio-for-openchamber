import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireJobId, StudioError } from '../common/core.mjs';
import { formatFor, IMPLEMENTED } from '../common/formats.mjs';

const pendingWrites = new Map();
// Structured artifacts can hold most of a 100,000-character reply twice (data and Markdown).
const RECORD_BYTES = 600_000;

export async function projectDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0')) {
    throw new StudioError('NO_DIRECTORY', 'Open a project in OpenChamber first.');
  }
  try {
    const canonical = await fs.realpath(directory);
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error();
    return canonical;
  } catch {
    throw new StudioError('NO_DIRECTORY', 'The selected project directory is unavailable.');
  }
}

async function folder(directory, name, create = false) {
  let current = await projectDirectory(directory);
  for (const segment of ['.studio', name]) {
    current = path.join(current, segment);
    let info = await fs.lstat(current).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!info && !create) return null;
    if (!info) {
      await fs.mkdir(current).catch((error) => { if (error.code !== 'EEXIST') throw error; });
      info = await fs.lstat(current);
    }
    // A source project must not redirect artifact writes through a symlink.
    if (info.isSymbolicLink() || !info.isDirectory()) throw new StudioError('BAD_STORAGE', 'Studio storage must be ordinary project directories.');
  }
  return current;
}

export async function writeRecord(directory, record, initial = false) {
  const root = await folder(directory, formatFor(record.format).folder, true);
  const target = path.join(root, `${requireJobId(record.id)}.json`);
  const content = JSON.stringify(record, null, 2) + '\n';
  // Cancellation and transport completion can arrive together. Windows does not
  // reliably allow two simultaneous renames over the same destination.
  const previous = pendingWrites.get(target) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (initial) return fs.writeFile(target, content, { flag: 'wx' });
    const temporary = path.join(root, `${record.id}.${randomUUID()}.tmp`);
    await fs.writeFile(temporary, content, { flag: 'wx' });
    // Atomic replacement keeps interrupted writes from corrupting saved history.
    await fs.rename(temporary, target);
  });
  pendingWrites.set(target, next);
  try { await next; }
  finally { if (pendingWrites.get(target) === next) pendingWrites.delete(target); }
}

async function readFrom(root, id, format) {
  const file = path.join(root, `${id}.json`);
  let info;
  try {
    info = await fs.lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    if (!info.isFile() || info.isSymbolicLink() || info.size > RECORD_BYTES) throw new Error('Invalid record');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record.id !== id || record.version !== 1 || record.format !== format) throw new Error('Invalid record');
    return record;
  } catch {
    throw new StudioError('BAD_HISTORY', 'A saved Studio record could not be read. No files were changed.');
  }
}

export async function readRecord(directory, id) {
  requireJobId(id);
  for (const format of IMPLEMENTED) {
    const root = await folder(directory, format.folder);
    const record = root ? await readFrom(root, id, format.key) : null;
    if (record) return record;
  }
  throw new StudioError('NOT_FOUND', 'Studio record not found in this project.', 404);
}

export async function listRecords(directory) {
  const records = [];
  for (const format of IMPLEMENTED) {
    const root = await folder(directory, format.folder);
    if (!root) continue;
    for (const name of await fs.readdir(root)) {
      const id = name.endsWith('.json') ? name.slice(0, -5) : '';
      try { requireJobId(id); } catch { continue; }
      const record = await readFrom(root, id, format.key);
      if (record) records.push(record);
    }
  }
  return records;
}

export async function exportFile(directory, content, filename, extension) {
  if (typeof filename !== 'string' || filename.length > 120 || !filename.toLowerCase().endsWith(`.${extension}`)
      || /[\\/:*?"<>|\x00-\x1f]/.test(filename) || filename.startsWith('.')) {
    throw new StudioError('BAD_FILENAME', `Use a new .${extension} filename without directory separators.`);
  }
  const root = await projectDirectory(directory);
  try {
    // Exclusive creation protects user files even if another process saves first.
    await fs.writeFile(path.join(root, filename), content, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new StudioError('FILE_EXISTS', 'That file already exists. Choose a different filename.', 409);
    throw error;
  }
  return filename;
}
