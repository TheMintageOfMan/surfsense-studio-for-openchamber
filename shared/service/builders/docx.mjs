import { createHash } from 'node:crypto';
import { AlignmentType, Document, Footer, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FONT_FAMILY } from '../../common/font.mjs';
import { regularTtf } from '../fonts.mjs';
import { GENERATOR, normalizeZip, provenance } from './shared.mjs';

const tableOf = ({ columns, rows }) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: columns.map((column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column, bold: true })] })] })) }),
    ...rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [new Paragraph(value ?? '')] })) })),
  ],
});

// Word embeds fonts "obfuscated": the first 32 bytes are XORed with a key taken from the
// font's GUID, read back to front (ECMA-376 Part 1, 17.8.1). The docx library picks a random
// GUID, which would make every build differ, so the key is replaced with one derived from
// the font bytes and the font is re-obfuscated with it.
function obfuscate(font, guid) {
  const hex = guid.replace(/[{}-]/g, '');
  const key = Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(30 - index * 2, 32 - index * 2), 16));
  const out = Uint8Array.from(font);
  for (let index = 0; index < 32; index += 1) out[index] ^= key[index % 16];
  return out;
}

function stableFontKey(bytes, font) {
  const hex = createHash('md5').update(font).digest('hex').toUpperCase();
  const guid = `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`;
  const entries = unzipSync(bytes);
  const table = strFromU8(entries['word/fontTable.xml']);
  entries['word/fontTable.xml'] = strToU8(table.replace(/w:fontKey="\{[0-9A-Fa-f-]+\}"/g, `w:fontKey="${guid}"`));
  entries['word/fonts/font1.odttf'] = obfuscate(font, guid);
  return zipSync(entries);
}

export async function buildDocx(artifact, meta) {
  const font = await regularTtf();
  const children = [new Paragraph({ text: artifact.title, heading: HeadingLevel.TITLE })];
  if (artifact.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: artifact.subtitle, italics: true, size: 28 })] }));
  for (const section of artifact.sections) {
    if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const paragraph of section.paragraphs) children.push(new Paragraph(paragraph));
    for (const bullet of section.bullets) children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
    // An empty paragraph after a table keeps Word from merging it with the next one.
    if (section.table) children.push(tableOf(section.table), new Paragraph(''));
  }
  if (meta.notes.length) {
    children.push(new Paragraph({ text: 'Changes Studio made', heading: HeadingLevel.HEADING_2 }));
    for (const note of meta.notes) children.push(new Paragraph({ text: note, bullet: { level: 0 } }));
  }
  // Every built-in style (headings, title) inherits the document default font.
  const run = { font: FONT_FAMILY };
  const document = new Document({
    creator: GENERATOR, lastModifiedBy: GENERATOR, title: artifact.title, description: `Made from ${meta.source}.`,
    // Embedded so Word shows Inter even where it is not installed. Bold is drawn from the regular face.
    fonts: [{ name: FONT_FAMILY, data: font }],
    styles: {
      default: {
        document: { run: { ...run, size: 22 } },
        title: { run }, heading1: { run }, heading2: { run }, heading3: { run },
      },
    },
    sections: [{
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: provenance(meta), size: 16, color: '666666' })] })] }) },
      children,
    }],
  });
  const packed = stableFontKey(await Packer.toBuffer(document), font);
  return { bytes: normalizeZip(packed, meta.createdAt), notes: [], pages: null };
}
