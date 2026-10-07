// Helpers shared by the file builders.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { provenanceLine, sourceNamesOf } from '../../common/provenance.mjs';

export const GENERATOR = 'SurfSense Studio for OpenChamber v2';

// What the builders may print about a file's origin: plain source names and the date only.
export function fileMeta(record) {
  return { title: record.title, source: sourceNamesOf(record), createdAt: new Date(record.createdAt), notes: record.notes ?? [] };
}

// The Office libraries stamp the current time into docProps/core.xml and every ZIP entry.
// Rewriting both from the record's createdAt makes a rebuild of one artifact byte-identical.
// DOS ZIP times are local-time fields, so a fixed local date keeps them machine-independent.
const ZIP_TIME = new Date(2000, 0, 1);
export function normalizeZip(bytes, createdAt) {
  const stamp = createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const entries = unzipSync(bytes);
  const core = entries['docProps/core.xml'];
  if (core) {
    entries['docProps/core.xml'] = strToU8(strFromU8(core)
      .replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${stamp}$2`)
      .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${stamp}$2`));
  }
  const ordered = {};
  for (const [name, data] of Object.entries(entries)) ordered[name] = [data, { mtime: ZIP_TIME }];
  return Buffer.from(zipSync(ordered, { level: 6 }));
}

// One provenance line, the same in every file type.
export const provenance = (meta) => provenanceLine(meta.source, meta.createdAt);
