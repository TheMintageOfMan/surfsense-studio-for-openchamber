// Deterministic file builders for the document formats. Node only: never bundled into the panel.
// Every builder takes the validated artifact plus record metadata and returns the file bytes;
// model text is only ever placed as text runs, never interpreted as markup or code.
import { buildDocx } from './docx.mjs';
import { buildPdf } from './pdf.mjs';
import { buildPptx } from './pptx.mjs';
import { buildXlsx } from './xlsx.mjs';

export { fileMeta } from './shared.mjs';

const BUILDERS = { docx: buildDocx, pptx: buildPptx, xlsx: buildXlsx, pdf: buildPdf };

// Returns { bytes, notes, pages } where notes disclose anything the file could not carry.
export async function buildFile(format, artifact, meta) {
  const build = BUILDERS[format];
  if (!build) throw new Error(`No file builder for ${format}.`);
  return build(artifact, meta);
}
