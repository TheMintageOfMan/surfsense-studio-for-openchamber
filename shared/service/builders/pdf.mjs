import fs from 'node:fs/promises';
import PDFDocument from 'pdfkit';
import { GENERATOR, provenance } from './shared.mjs';
import { plural } from '../../common/core.mjs';

// Fonts ship as files beside the bundled service (service/fonts/) and in shared/fonts/ for tests.
// pdfkit's standard fonts load metric files from its own package folder, which does not exist
// once bundled, and cover only WinAnsi; DejaVu Sans covers the punctuation and symbols models use.
const FONT_DIR = typeof __STUDIO_FONTS__ === 'undefined' ? new URL('../../fonts/', import.meta.url) : new URL(__STUDIO_FONTS__, import.meta.url);
let fonts;
const loadFonts = async () => (fonts ??= Promise.all(['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map((name) => fs.readFile(new URL(name, FONT_DIR)))));

const MARGIN = 72;
const GREY = '#555555';

export async function buildPdf(artifact, meta) {
  const [regular, bold] = await loadFonts();
  const doc = new PDFDocument({
    // font: null skips pdfkit's default Helvetica, so no standard-font file is ever read.
    font: null, size: 'LETTER', margin: MARGIN, bufferPages: true, compress: true, lang: 'en-US', displayTitle: true,
    info: { Title: artifact.title, Author: GENERATOR, Creator: GENERATOR, Producer: GENERATOR, Subject: `Generated from ${meta.source} with ${meta.model}`, CreationDate: meta.createdAt },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  doc.registerFont('body', regular);
  doc.registerFont('bold', bold);

  // Characters the embedded font cannot draw become "?" and are disclosed, never dropped silently.
  const missing = new Set();
  const covers = {};
  const safe = (text, font) => {
    doc.font(font);
    const face = (covers[font] ??= doc._font.font);
    return Array.from(String(text), (character) => {
      if (/\s/.test(character) || face.hasGlyphForCodePoint(character.codePointAt(0))) return character;
      missing.add(character);
      return '?';
    }).join('');
  };
  const write = (text, font, size, options = {}) => doc.fillColor(options.color ?? 'black').font(font).fontSize(size).text(safe(text, font), options);

  write(artifact.title, 'bold', 24);
  if (artifact.subtitle) write(artifact.subtitle, 'body', 14, { color: GREY });
  doc.moveDown(0.8);
  for (const section of artifact.sections) {
    if (section.heading) {
      doc.moveDown(0.6);
      write(section.heading, 'bold', 15);
      doc.moveDown(0.3);
    }
    for (const paragraph of section.paragraphs) { write(paragraph, 'body', 11, { lineGap: 2, paragraphGap: 6 }); }
    for (const bullet of section.bullets) {
      write(`\u2022  ${bullet}`, 'body', 11, { lineGap: 2, paragraphGap: 3 });
    }
    if (section.table) {
      doc.moveDown(0.4);
      doc.font('body').fontSize(9);
      doc.table({
        defaultStyle: { padding: 4, border: 0.5, borderColor: '#999999' },
        data: [
          section.table.columns.map((column) => ({ text: safe(column, 'bold'), font: { src: 'bold' }, backgroundColor: '#eeeeee' })),
          ...section.table.rows.map((row) => row.map((value) => safe(value ?? '', 'body'))),
        ],
      });
      doc.font('body').fontSize(11).moveDown(0.6);
    }
  }
  if (meta.notes.length) {
    doc.moveDown(0.8);
    write('Generation notes', 'bold', 12);
    for (const note of meta.notes) write(`\u2022  ${note}`, 'body', 10, { color: GREY });
  }

  // Footers go in after layout, when the page count is known.
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    // Writing below the bottom margin would otherwise start a new page.
    doc.page.margins.bottom = 0;
    doc.fillColor('#777777').font('body').fontSize(7.5).text(safe(`${provenance(meta)}  Page ${index + 1} of ${range.count}.`, 'body'),
      MARGIN, doc.page.height - MARGIN + 24, { align: 'center', width: doc.page.width - MARGIN * 2 });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  await ended;
  const notes = missing.size ? [`The PDF font has no glyph for ${plural(missing.size, 'character')} (${[...missing].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}); each appears as "?".`] : [];
  return { bytes: Buffer.concat(chunks), notes, pages: range.count };
}
