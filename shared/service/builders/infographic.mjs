// Draws an infographic artifact to SVG through the worker thread, then makes it self-contained:
// the library's links to its own web font are removed and Inter is embedded instead.
import { Worker } from 'node:worker_threads';
import { libraryOptions } from '../../common/infographic.mjs';
import { embeddedFontCss } from '../fonts.mjs';

// The bundled service ships the worker as service/infographic-worker.js; tests run the source.
const WORKER_URL = typeof __STUDIO_WORKER__ === 'undefined' ? new URL('./infographic-worker.mjs', import.meta.url) : new URL(__STUDIO_WORKER__, import.meta.url);
const RENDER_MS = 45_000;
let worker = null;
let next = 0;
const pending = new Map();

function failAll(message) {
  for (const { reject } of pending.values()) reject(new Error(message));
  pending.clear();
  worker = null;
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_URL);
  worker.on('message', ({ id, svg, error }) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (error) job.reject(new Error(error)); else job.resolve(svg);
  });
  worker.on('error', (error) => failAll(error.message));
  worker.on('exit', () => failAll('The infographic renderer stopped.'));
  // Unref after the listeners: adding a message listener refs the worker's port again.
  // An idle worker never keeps the service (or a test run) from exiting.
  worker.unref();
  return worker;
}

function render(options) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => {
      // A stuck render is not worth keeping; the next request starts a fresh worker.
      pending.delete(id);
      void worker?.terminate();
      reject(new Error('The infographic renderer timed out.'));
    }, RENDER_MS);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    ensureWorker().postMessage({ id, options });
  });
}

// Strips the XML prolog and font stylesheet links, which point at the library's CDN font.
const clean = (svg) => svg.replace(/^\s*<\?xml[^>]*\?>\s*/, '').replace(/<\?xml-stylesheet[^>]*\?>\s*/g, '').trim();

// Returns the saved file (Inter embedded, so it looks the same in any viewer) and a light
// preview without the font, small enough for the panel bridge; the panel supplies the font.
export async function buildInfographicFile(artifact) {
  const preview = clean(await render(libraryOptions(artifact)));
  if (!/^<svg[\s>]/.test(preview)) throw new Error('The renderer did not return an SVG.');
  const css = await embeddedFontCss();
  const file = preview.replace(/^<svg[^>]*>/, (open) => `${open}<style>${css}</style>`);
  return { bytes: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${file}\n`, 'utf8'), notes: [], pages: null, preview };
}