import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireJobId, StudioError } from '../common/summary.mjs';

const pendingWrites = new Map();

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

async function folder(directory, create = false) {
  let current = await projectDirectory(directory);
  for (const segment of ['.studio', 'summaries']) {
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
  const root = await folder(directory, true);
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

export async function readRecord(directory, id) {
  const root = await folder(directory);
  if (!root) throw new StudioError('NOT_FOUND', 'Summary not found in this project.', 404);
  try {
    const file = path.join(root, `${requireJobId(id)}.json`);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 250_000) throw new Error('Invalid record');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record.id !== id || record.version !== 1) throw new Error('Invalid record');
    return record;
  } catch (error) {
    if (error instanceof StudioError) throw error;
    if (error.code === 'ENOENT') throw new StudioError('NOT_FOUND', 'Summary not found in this project.', 404);
    throw new StudioError('BAD_HISTORY', 'A saved summary record could not be read. No files were changed.');
  }
}

export async function listRecords(directory) {
  const root = await folder(directory);
  if (!root) return [];
  const names = (await fs.readdir(root)).filter((name) => name.endsWith('.json'));
  return Promise.all(names.map((name) => readRecord(directory, name.slice(0, -5))));
}

export async function exportMarkdown(directory, record, filename) {
  if (typeof filename !== 'string' || filename.length > 120 || !/\.md$/i.test(filename)
      || /[\\/:*?"<>|\x00-\x1f]/.test(filename) || filename.startsWith('.')) {
    throw new StudioError('BAD_FILENAME', 'Use a new Markdown filename without directory separators.');
  }
  const root = await projectDirectory(directory);
  try {
    // Exclusive creation protects user files even if another process saves first.
    await fs.writeFile(path.join(root, filename), record.markdown, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new StudioError('FILE_EXISTS', 'That file already exists. Choose a different filename.', 409);
    throw error;
  }
  return filename;
}
