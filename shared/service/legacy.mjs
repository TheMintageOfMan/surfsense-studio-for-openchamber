// Readers for the old binary Office formats (.doc, .xls, .ppt), with no extra library. All three
// are Compound File Binary containers (a small FAT file system in one file) holding binary
// streams. Only text and cell values are read; nothing is executed and macros are ignored.
// References: [MS-CFB], [MS-DOC], [MS-XLS], [MS-PPT] (Microsoft Open Specifications).
import { StudioError } from '../common/core.mjs';
import { excelDateText, isDateFormat } from './excel-dates.mjs';

const damaged = () => new StudioError('BAD_FILE', 'could not be opened; it may be damaged.');
const locked = () => new StudioError('LOCKED_FILE', 'is password-protected.');

// ---------- Compound File Binary ----------

const END_OF_CHAIN = 0xfffffffe;
const FREE = 0xffffffff;

export function readCompoundFile(bytes) {
  const data = Buffer.from(bytes);
  if (data.length < 512 || data.readUInt32LE(0) !== 0xe011cfd0 || data.readUInt32LE(4) !== 0xe11ab1a1) throw damaged();
  const sectorSize = 1 << data.readUInt16LE(0x1e);
  const miniSize = 1 << data.readUInt16LE(0x20);
  const cutoff = data.readUInt32LE(0x38);
  const sector = (id) => {
    const start = (id + 1) * sectorSize;
    if (start >= data.length) throw damaged();
    return data.subarray(start, Math.min(start + sectorSize, data.length));
  };
  // The FAT's own sectors are listed in the header (109) and then in a chain of DIFAT sectors.
  const fatSectors = [];
  for (let index = 0; index < 109; index += 1) {
    const id = data.readUInt32LE(0x4c + index * 4);
    if (id !== FREE) fatSectors.push(id);
  }
  for (let id = data.readUInt32LE(0x44), guard = 0; id !== END_OF_CHAIN && id !== FREE && guard < 10_000; guard += 1) {
    const block = sector(id);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) {
      const entry = block.readUInt32LE(offset);
      if (entry !== FREE) fatSectors.push(entry);
    }
    id = block.readUInt32LE(sectorSize - 4);
  }
  const fat = [];
  for (const id of fatSectors) {
    const block = sector(id);
    for (let offset = 0; offset < block.length; offset += 4) fat.push(block.readUInt32LE(offset));
  }
  const chain = (start, table) => {
    const ids = [];
    // A chain longer than its table can only be a loop in a damaged file.
    for (let id = start; id !== END_OF_CHAIN && id !== FREE; id = table[id]) {
      if (id >= table.length || ids.length > table.length) throw damaged();
      ids.push(id);
    }
    return ids;
  };
  const readChain = (start, size) => Buffer.concat(chain(start, fat).map(sector)).subarray(0, size);

  const directory = readChain(data.readUInt32LE(0x30), Infinity);
  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 0x40);
    const type = directory[offset + 0x42];
    if (!type || nameLength < 2 || nameLength > 64) continue;
    entries.push({
      name: directory.toString('utf16le', offset, offset + nameLength - 2), type,
      start: directory.readUInt32LE(offset + 0x74), size: directory.readUInt32LE(offset + 0x78),
    });
  }
  const root = entries.find((entry) => entry.type === 5);
  if (!root) throw damaged();
  // Small streams live in the "mini stream", itself stored in the root entry's chain.
  let mini = null;
  const miniStream = () => {
    if (mini) return mini;
    const miniFatBytes = readChain(data.readUInt32LE(0x3c), data.readUInt32LE(0x40) * sectorSize);
    const miniFat = [];
    for (let offset = 0; offset + 4 <= miniFatBytes.length; offset += 4) miniFat.push(miniFatBytes.readUInt32LE(offset));
    mini = { fat: miniFat, data: readChain(root.start, root.size) };
    return mini;
  };
  return {
    has: (name) => entries.some((entry) => entry.type === 2 && entry.name === name),
    stream(name) {
      const entry = entries.find((candidate) => candidate.type === 2 && candidate.name === name);
      if (!entry) return null;
      if (entry.size >= cutoff) return readChain(entry.start, entry.size);
      const { fat: miniFat, data: miniData } = miniStream();
      return Buffer.concat(chain(entry.start, miniFat).map((id) => miniData.subarray(id * miniSize, (id + 1) * miniSize))).subarray(0, entry.size);
    },
  };
}

const cp1252 = new TextDecoder('windows-1252');
const tidy = (text) => text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ---------- Word 97-2003 (.doc) ----------

export function docText(bytes) {
  const file = readCompoundFile(bytes);
  const word = file.stream('WordDocument');
  if (!word || word.length < 0x200 || word.readUInt16LE(0) !== 0xa5ec) throw damaged();
  const flags = word.readUInt16LE(0x0a);
  if (flags & 0x0100) throw locked();
  const table = file.stream(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw damaged();
  // The FIB is a run of variable-length arrays; fcClx/lcbClx is pair 33 of the FcLcb array.
  const csw = word.readUInt16LE(32);
  const cslw = word.readUInt16LE(34 + csw * 2);
  const lw = 36 + csw * 2;
  const ccpText = word.readInt32LE(lw + 12);
  const fcLcb = lw + cslw * 4 + 2;
  const fcClx = word.readUInt32LE(fcLcb + 33 * 8);
  const lcbClx = word.readUInt32LE(fcLcb + 33 * 8 + 4);
  if (!lcbClx || fcClx + lcbClx > table.length) throw damaged();
  // The Clx holds formatting runs (type 1) and then the piece table (type 2).
  let offset = fcClx;
  while (table[offset] === 0x01) offset += 3 + table.readInt16LE(offset + 1);
  if (table[offset] !== 0x02) throw damaged();
  const lcb = table.readUInt32LE(offset + 1);
  const plc = offset + 5;
  const pieces = (lcb - 4) / 12;
  let text = '';
  for (let index = 0; index < pieces && text.length < ccpText; index += 1) {
    const cpStart = table.readUInt32LE(plc + index * 4);
    const cpEnd = table.readUInt32LE(plc + (index + 1) * 4);
    const fc = table.readUInt32LE(plc + (pieces + 1) * 4 + index * 8 + 2);
    const count = cpEnd - cpStart;
    // Bit 30 marks 8-bit (Windows-1252) text, stored at half the given offset.
    text += fc & 0x40000000
      ? cp1252.decode(word.subarray((fc & ~0x40000000) / 2, (fc & ~0x40000000) / 2 + count))
      : word.toString('utf16le', fc, fc + count * 2);
  }
  text = text.slice(0, ccpText);
  // Field codes: keep what a field shows (after 0x14), drop its instructions (0x13..0x14).
  text = text.replace(/\x13[^\x13\x14\x15]*\x14([^\x13\x15]*)\x15/g, '$1').replace(/\x13[^\x13\x15]*\x15/g, '');
  return tidy(text
    .replace(/\x07\x07/g, '\n').replace(/\x07/g, '\t')
    .replace(/[\r\x0b\x0c]/g, '\n')
    .replace(/[\x00-\x08\x0e-\x1f]/g, ''));
}

// ---------- Excel 97-2003 (.xls, BIFF8) ----------

// BIFF strings: a length, a flags byte (bit 0: two bytes per character), the characters.
function biffString(buffer, offset, lengthBytes) {
  const count = lengthBytes === 1 ? buffer[offset] : buffer.readUInt16LE(offset);
  const flags = buffer[offset + lengthBytes];
  const start = offset + lengthBytes + 1;
  return flags & 1 ? buffer.toString('utf16le', start, start + count * 2) : buffer.toString('latin1', start, start + count);
}

// The shared-string table can span CONTINUE records. String headers never split across a
// record boundary; character data can, and then restarts with a fresh flags byte.
function sharedStrings(parts) {
  let part = 0;
  let offset = 8;
  const header = (bytes) => { if (offset + bytes > parts[part].length) { part += 1; offset = 0; } if (part >= parts.length) throw damaged(); };
  const u8 = () => { header(1); return parts[part][offset++]; };
  const u16 = () => { header(2); const value = parts[part].readUInt16LE(offset); offset += 2; return value; };
  const u32 = () => { header(4); const value = parts[part].readUInt32LE(offset); offset += 4; return value; };
  const skip = (bytes) => {
    for (let left = bytes; left > 0;) {
      if (offset >= parts[part].length) { part += 1; offset = 0; if (part >= parts.length) return; }
      const take = Math.min(left, parts[part].length - offset);
      offset += take;
      left -= take;
    }
  };
  const unique = parts[0].readUInt32LE(4);
  const strings = [];
  for (let index = 0; index < unique && part < parts.length; index += 1) {
    let count = u16();
    const flags = u8();
    let wide = flags & 1;
    const runs = flags & 0x08 ? u16() : 0;
    const extra = flags & 0x04 ? u32() : 0;
    let text = '';
    while (count > 0) {
      if (offset >= parts[part].length) {
        part += 1; offset = 0;
        if (part >= parts.length) break;
        wide = parts[part][offset++] & 1;
      }
      const fit = Math.min(count, Math.floor((parts[part].length - offset) / (wide ? 2 : 1)));
      text += wide ? parts[part].toString('utf16le', offset, offset + fit * 2) : parts[part].toString('latin1', offset, offset + fit);
      offset += fit * (wide ? 2 : 1);
      count -= fit;
    }
    skip(runs * 4 + extra);
    strings.push(text);
  }
  return strings;
}
// An RK value packs a 30-bit integer or the top of a double, optionally divided by 100.
function rk(value) {
  let number;
  if (value & 2) number = value >> 2;
  else { const bytes = Buffer.alloc(8); bytes.writeUInt32LE(value & 0xfffffffc, 4); number = bytes.readDoubleLE(0); }
  return value & 1 ? number / 100 : number;
}

export function xlsText(bytes) {
  const file = readCompoundFile(bytes);
  const book = file.stream('Workbook');
  if (!book) {
    if (file.has('Book')) throw new StudioError('OLD_FORMAT', 'is from a very old version of Excel that Studio cannot read.');
    throw damaged();
  }
  const records = [];
  for (let offset = 0; offset + 4 <= book.length;) {
    const type = book.readUInt16LE(offset);
    const length = book.readUInt16LE(offset + 2);
    records.push({ type, offset, data: book.subarray(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }
  // Workbook globals: sheet list, shared strings, number formats and cell styles.
  const sheets = [];
  const formats = new Map();
  const styles = [];
  let strings = [];
  let date1904 = false;
  for (let index = 0; index < records.length; index += 1) {
    const { type, data } = records[index];
    if (type === 0x002f) throw locked();
    if (type === 0x0085 && data[5] === 0) sheets.push({ start: data.readUInt32LE(0), name: biffString(data, 6, 1) });
    else if (type === 0x041e) formats.set(data.readUInt16LE(0), biffString(data, 2, 2));
    else if (type === 0x00e0) styles.push(data.readUInt16LE(2));
    else if (type === 0x0022) date1904 = data.readUInt16LE(0) === 1;
    else if (type === 0x00fc) {
      const parts = [data];
      while (records[index + 1]?.type === 0x003c) parts.push(records[++index].data);
      strings = sharedStrings(parts);
    } else if (type === 0x000a) break;
  }
  const number = (style, value) => {
    const formatId = styles[style];
    return isDateFormat(formatId, formats.get(formatId)) ? excelDateText(value, date1904, formats.get(formatId)) : String(value);
  };
  const out = [];
  for (const sheet of sheets) {
    const rows = new Map();
    const put = (row, col, value) => { if (!rows.has(row)) rows.set(row, []); rows.get(row)[col] = String(value).replace(/\s+/g, ' ').trim(); };
    let index = records.findIndex((record) => record.offset === sheet.start);
    if (index < 0) continue;
    for (index += 1; index < records.length && records[index].type !== 0x000a; index += 1) {
      const { type, data } = records[index];
      if (data.length < 6) continue;
      const row = data.readUInt16LE(0);
      const col = data.readUInt16LE(2);
      const style = data.readUInt16LE(4);
      if (type === 0x00fd) put(row, col, strings[data.readUInt32LE(6)] ?? '');
      else if (type === 0x0204) put(row, col, biffString(data, 6, 2));
      else if (type === 0x0203) put(row, col, number(style, data.readDoubleLE(6)));
      else if (type === 0x027e) put(row, col, number(style, rk(data.readUInt32LE(6))));
      else if (type === 0x00bd) {
        for (let at = 4, column = col; at + 6 <= data.length - 2; at += 6, column += 1) put(row, column, number(data.readUInt16LE(at), rk(data.readUInt32LE(at + 2))));
      } else if (type === 0x0205) put(row, col, data[7] ? '' : data[6] ? 'TRUE' : 'FALSE');
      else if (type === 0x0006) {
        // A formula keeps its last result: a number, or a marker saying what kind of result.
        if (data.readUInt16LE(12) !== 0xffff) put(row, col, number(style, data.readDoubleLE(6)));
        else if (data[6] === 1) put(row, col, data[8] ? 'TRUE' : 'FALSE');
        else if (data[6] === 0 && records[index + 1]?.type === 0x0207) put(row, col, biffString(records[index + 1].data, 0, 2));
      }
    }
    const lines = [...rows.keys()].sort((a, b) => a - b).map((key) => Array.from(rows.get(key), (value) => value ?? '').join('\t')).filter((line) => line.replace(/\t/g, ''));
    if (lines.length) out.push(`Sheet: ${sheet.name}`, ...lines, '');
  }
  return out.join('\n').trim();
}

// PowerPoint 97-2003 (.ppt) is read in legacy-ppt.mjs.
