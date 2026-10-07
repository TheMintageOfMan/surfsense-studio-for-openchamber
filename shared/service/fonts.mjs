// Loads Studio's bundled font files. They ship beside the bundled service (service/fonts/) and
// live in shared/fonts/ for tests; the build defines __STUDIO_FONTS__ for the bundled location.
import fs from 'node:fs/promises';
import { FONT_FILES, fontFaceCss } from '../common/font.mjs';

const FONT_DIR = typeof __STUDIO_FONTS__ === 'undefined' ? new URL('../fonts/', import.meta.url) : new URL(__STUDIO_FONTS__, import.meta.url);
const cache = new Map();

export function readFont(name) {
  if (!cache.has(name)) cache.set(name, fs.readFile(new URL(name, FONT_DIR)));
  return cache.get(name);
}

export const regularTtf = () => readFont(FONT_FILES.regular.ttf);
export const boldTtf = () => readFont(FONT_FILES.bold.ttf);

let css;
export function embeddedFontCss() {
  css ??= (async () => fontFaceCss({
    regular: (await readFont(FONT_FILES.regular.woff2)).toString('base64'),
    bold: (await readFont(FONT_FILES.bold.woff2)).toString('base64'),
  }))();
  return css;
}
