import PptxGenJS from 'pptxgenjs';
import { FONT_FAMILY as FONT } from '../../common/font.mjs';
import { GENERATOR, normalizeZip, provenance } from './shared.mjs';

// PowerPoint files name the font but this library cannot embed it; Inter shows where it is
// installed and PowerPoint substitutes elsewhere.

export async function buildPptx(artifact, meta) {
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.theme = { headFontFace: FONT, bodyFontFace: FONT };
  Object.assign(deck, { author: GENERATOR, company: '', title: artifact.title, subject: `Generated from ${meta.source}` });

  const cover = deck.addSlide();
  cover.addText(artifact.title, { x: 0.8, y: 2.2, w: 11.7, h: 1.5, fontFace: FONT, fontSize: 40, bold: true, fit: 'shrink' });
  if (artifact.subtitle) cover.addText(artifact.subtitle, { x: 0.8, y: 3.8, w: 11.7, h: 1, fontFace: FONT, fontSize: 22, color: '555555', fit: 'shrink' });
  cover.addText(provenance(meta), { x: 0.8, y: 6.5, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 11, color: '777777' });
  // Omission notes travel with the deck, where a presenter will see them.
  if (meta.notes.length) cover.addNotes(`Generation notes:\n${meta.notes.map((note) => `- ${note}`).join('\n')}`);

  artifact.slides.forEach((slide, index) => {
    const page = deck.addSlide();
    page.addText(slide.title, { x: 0.6, y: 0.4, w: 12.1, h: 1.1, fontFace: FONT, fontSize: 30, bold: true, fit: 'shrink', valign: 'top' });
    page.addText(slide.bullets.map((bullet) => ({ text: bullet, options: { bullet: true, breakLine: true } })), {
      x: 0.8, y: 1.7, w: 11.7, h: 5, fontFace: FONT, fontSize: 20, valign: 'top', paraSpaceAfter: 8, fit: 'shrink',
    });
    page.addText(`${index + 2}`, { x: 12.2, y: 6.9, w: 0.8, h: 0.4, fontFace: FONT, fontSize: 10, color: '888888', align: 'right' });
    if (slide.notes) page.addNotes(slide.notes);
  });
  return { bytes: normalizeZip(await deck.write({ outputType: 'nodebuffer' }), meta.createdAt), notes: [], pages: artifact.slides.length + 1 };
}
