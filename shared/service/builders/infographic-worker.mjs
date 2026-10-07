// Runs AntV Infographic in its own thread. The library's server renderer installs a fake DOM
// (window, document) on globalThis; inside a worker those globals never reach the service,
// where the Office and PDF libraries would mistake them for a browser.
import { parentPort } from 'node:worker_threads';
import { setDefaultFont } from '@antv/infographic';
import { renderToString } from '@antv/infographic/ssr';
import { registerFont } from 'measury';
import { FONT_FAMILY } from '../../common/font.mjs';
import metrics from '../../fonts/Inter-metrics.json' with { type: 'json' };

// Without a browser, text is measured from glyph advances; register Inter's so wrapping matches.
for (const face of metrics) registerFont(face);
setDefaultFont(FONT_FAMILY);
// The library warns on every text node when a font has no measurement data; Inter now has it,
// and nothing else is useful on the service console.
console.warn = () => {};

parentPort.on('message', async ({ id, options }) => {
  try {
    parentPort.postMessage({ id, svg: await renderToString(options) });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message ?? error) });
  }
});
