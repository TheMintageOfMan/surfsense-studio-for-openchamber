// Studio's single typeface. Inter 4.1 (SIL Open Font License 1.1, shared/fonts/Inter-LICENSE.txt)
// is used by the panel, every generated file and every preview so they all look alike.
// Shared by the panel and the service: names only, no file access here.
export const FONT_FAMILY = 'Inter';
// CSS fallbacks for places that cannot carry the font file (only reached if loading fails).
export const FONT_STACK = `${FONT_FAMILY}, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif`;
export const FONT_FILES = Object.freeze({
  regular: { ttf: 'Inter-Regular.ttf', woff2: 'Inter-Regular.woff2', weight: 400 },
  bold: { ttf: 'Inter-Bold.ttf', woff2: 'Inter-Bold.woff2', weight: 700 },
});

// @font-face rules with the fonts inlined, so a saved web page or SVG shows Inter anywhere.
export function fontFaceCss(woff2Base64) {
  return Object.entries(FONT_FILES).map(([key, file]) => `@font-face { font-family: ${FONT_FAMILY}; font-style: normal; font-weight: ${file.weight}; font-display: swap; src: url(data:font/woff2;base64,${woff2Base64[key]}) format("woff2"); }`).join('\n');
}
