import { inlineFontCss } from '../fonts.js';
import { el } from './dom.js';

// The SVG is the exact drawing that was saved, minus the inlined font, which the panel adds.
// An empty sandbox gives the preview no scripts, forms or navigation.
export function renderInfographic(container, record) {
  const frame = document.createElement('iframe');
  frame.className = 'infographic-frame';
  frame.setAttribute('sandbox', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = `Infographic: ${record.artifact.title}`;
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>${inlineFontCss()}
html, body { margin: 0; background: #fff; overflow: hidden; } svg { display: block; width: 100%; height: auto; }</style>${record.artifact.svg}`;
  // Keep the drawing's own proportions.
  const { width, height } = svgSize(record.artifact.svg);
  frame.style.aspectRatio = `${width} / ${height}`;
  container.append(el('p', 'muted small', 'This is a preview. Tap Save to keep it as a picture.'), frame);
  return { dispose() {} };
}

// Draws the SVG onto a canvas at print-friendly size and returns PNG bytes as base64.
export async function pictureBase64(svg) {
  const open = svg.match(/<svg[^>]*>/)[0];
  const { width, height } = svgSize(svg);
  const full = svg.replace(open, `${open}<style>${inlineFontCss()}</style>`);
  // A data: URL, not a blob: URL: in an opaque-origin frame a blob image can taint the canvas.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(full)}`;
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The picture could not be drawn.')); image.src = url; });
  const scale = Math.max(2, 1600 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').split(',')[1];
}

function svgSize(svg) {
  const open = svg.match(/<svg[^>]*>/)?.[0] ?? '';
  return { width: Number(open.match(/\swidth="([\d.]+)"/)?.[1] ?? 800), height: Number(open.match(/\sheight="([\d.]+)"/)?.[1] ?? 600) };
}