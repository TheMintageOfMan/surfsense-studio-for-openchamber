// PowerPoint 97-2003 (.ppt): text of each slide and its notes, in slide order. Slide order and
// positions come from the persist directory that the "Current User" stream points to
// ([MS-PPT] 2.3); text lives in TextCharsAtom (UTF-16) and TextBytesAtom (8-bit) records.
import { StudioError } from '../common/core.mjs';
import { readCompoundFile } from './legacy.mjs';

const damaged = () => new StudioError('BAD_FILE', 'could not be opened; it may be damaged.');
const TEXT_CHARS = 0x0fa0;
const TEXT_BYTES = 0x0fa8;
const SLIDE = 0x03ee;
const SLIDE_ATOM = 0x03ef;
const NOTES = 0x03f0;
const SLIDE_LIST = 0x0ff0;
const SLIDE_PERSIST = 0x03f3;
const USER_EDIT = 0x0ff5;
const PERSIST_DIRECTORY = 0x1772;

const header = (doc, offset) => (offset + 8 <= doc.length
  ? { container: (doc.readUInt16LE(offset) & 0xf) === 0xf, instance: doc.readUInt16LE(offset) >> 4, type: doc.readUInt16LE(offset + 2), length: doc.readUInt32LE(offset + 4) }
  : null);

// Every record of the given types inside [start, end), depth first.
function collect(doc, start, end, types, out = [], depth = 0) {
  for (let offset = start; offset + 8 <= end && depth < 32;) {
    const record = header(doc, offset);
    if (!record || offset + 8 + record.length > end) break;
    if (types.has(record.type)) out.push({ ...record, offset });
    if (record.container) collect(doc, offset + 8, offset + 8 + record.length, types, out, depth + 1);
    offset += 8 + record.length;
  }
  return out;
}

const atomText = (doc, record) => {
  const start = record.offset + 8;
  const raw = record.type === TEXT_CHARS ? doc.toString('utf16le', start, start + record.length) : doc.toString('latin1', start, start + record.length);
  return raw.replace(/[\r\x0b]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '').trim();
};

function containerText(doc, offset) {
  const record = header(doc, offset);
  if (!record) return [];
  return collect(doc, offset + 8, offset + 8 + record.length, new Set([TEXT_CHARS, TEXT_BYTES])).map((atom) => atomText(doc, atom)).filter(Boolean);
}

// persistId -> stream offset, newest edit first (older edits never override newer ones).
function persistDirectory(doc, currentUser) {
  const map = new Map();
  if (!currentUser || currentUser.length < 20) return map;
  const seen = new Set();
  for (let edit = currentUser.readUInt32LE(16); edit && !seen.has(edit) && header(doc, edit)?.type === USER_EDIT; ) {
    seen.add(edit);
    const at = edit + 8;
    const directory = doc.readUInt32LE(at + 12);
    const record = header(doc, directory);
    if (record?.type === PERSIST_DIRECTORY) {
      for (let offset = directory + 8, end = directory + 8 + record.length; offset + 4 <= end;) {
        const entry = doc.readUInt32LE(offset);
        const first = entry & 0xfffff;
        const count = entry >>> 20;
        for (let index = 0; index < count && offset + 8 + index * 4 <= end; index += 1) {
          if (!map.has(first + index)) map.set(first + index, doc.readUInt32LE(offset + 4 + index * 4));
        }
        offset += 4 + count * 4;
      }
    }
    edit = doc.readUInt32LE(at + 8);
  }
  return map;
}

export function pptText(bytes) {
  const file = readCompoundFile(bytes);
  if (file.has('EncryptedSummary')) throw new StudioError('LOCKED_FILE', 'is password-protected.');
  const doc = file.stream('PowerPoint Document');
  if (!doc) throw damaged();
  const persist = persistDirectory(doc, file.stream('Current User'));
  // The slide list (instance 0) names each slide's persist id in presentation order.
  const slideList = collect(doc, 0, doc.length, new Set([SLIDE_LIST])).find((record) => record.instance === 0);
  let slides = slideList
    ? collect(doc, slideList.offset + 8, slideList.offset + 8 + slideList.length, new Set([SLIDE_PERSIST])).map((atom) => persist.get(doc.readUInt32LE(atom.offset + 8)))
      .filter((offset) => offset !== undefined && header(doc, offset)?.type === SLIDE)
    : [];
  // Notes are linked by notes id, which the notes list (instance 2) maps to a persist id.
  const notesList = collect(doc, 0, doc.length, new Set([SLIDE_LIST])).find((record) => record.instance === 2);
  const notesById = new Map(notesList ? collect(doc, notesList.offset + 8, notesList.offset + 8 + notesList.length, new Set([SLIDE_PERSIST]))
    .map((atom) => [doc.readUInt32LE(atom.offset + 8 + 12), persist.get(doc.readUInt32LE(atom.offset + 8))]) : []);
  // Without a usable directory, fall back to slides in file order.
  if (!slides.length) slides = collect(doc, 0, doc.length, new Set([SLIDE])).map((record) => record.offset);
  const out = [];
  slides.forEach((offset, index) => {
    const lines = containerText(doc, offset);
    const atom = collect(doc, offset + 8, offset + 8 + header(doc, offset).length, new Set([SLIDE_ATOM]))[0];
    // In notes, a bare number or "*" is the slide-number field, not text.
    const notesId = atom && atom.length >= 20 ? doc.readUInt32LE(atom.offset + 8 + 16) : 0;
    const notesOffset = notesId ? notesById.get(notesId) : undefined;
    const notes = notesOffset !== undefined && header(doc, notesOffset)?.type === NOTES ? containerText(doc, notesOffset).filter((line) => !/^(\d+|\*)$/.test(line)) : [];
    if (!lines.length && !notes.length) return;
    out.push(`Slide ${index + 1}`, ...lines, ...(notes.length ? ['Notes:', ...notes] : []), '');
  });
  return out.join('\n').trim();
}
