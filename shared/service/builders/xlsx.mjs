import writeExcelFile from 'write-excel-file/node';
import { FONT_FAMILY } from '../../common/font.mjs';
import { madeOn } from '../../common/provenance.mjs';
import { normalizeZip } from './shared.mjs';

// Width in characters from the longest value, within a readable range.
const widths = (columns, rows) => columns.map((column, index) => ({
  width: Math.min(60, Math.max(10, ...[column, ...rows.map((row) => row[index])].map((value) => String(value ?? '').length + 2))),
}));

export async function buildXlsx(artifact, meta) {
  const sheets = artifact.tables.map((table) => ({
    sheet: table.name,
    // Strings are written as text cells, never formulas, whatever characters they start with.
    data: [table.columns.map((value) => ({ value, fontWeight: 'bold' })), ...table.rows],
    columns: widths(table.columns, table.rows),
    stickyRowsCount: 1,
  }));
  const info = [
    ['Title', artifact.title], ['Made from', meta.source], ['Made on', madeOn(meta.createdAt)], ['Made with', 'SurfSense Studio'],
    ['Please note', 'Check it against the original before relying on it.'],
    [null, null],
    ...artifact.tables.map((table) => [`Sheet: ${table.name}`, table.description || null]),
    ...(meta.notes.length ? [[null, null], ...meta.notes.map((note) => ['Change made', note])] : []),
  ];
  sheets.push({
    sheet: 'Notes',
    data: info.map(([label, value]) => [label === null ? null : { value: label, fontWeight: 'bold' }, value === null ? null : { value, wrap: true }]),
    columns: [{ width: 24 }, { width: 100 }],
  });
  // Excel names the font but cannot embed it; Inter shows where installed.
  const bytes = await writeExcelFile(sheets, { fontFamily: FONT_FAMILY }).toBuffer();
  return { bytes: normalizeZip(bytes, meta.createdAt), notes: [], pages: sheets.length };
}
