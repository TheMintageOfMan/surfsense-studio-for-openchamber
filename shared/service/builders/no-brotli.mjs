// Build-time stand-in for brotli/decompress.js, which fontkit uses only to read WOFF2 fonts.
// Studio embeds TrueType fonts, so WOFF2 support (and about 0.5 MB of bundle) is left out.
export default function decompress() {
  throw new Error('WOFF2 fonts are not supported in this build.');
}
