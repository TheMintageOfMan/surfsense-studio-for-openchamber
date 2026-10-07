import { buildWebPage, webpageMeta } from '../../common/webpage.mjs';
import { inlineFontCss } from '../fonts.js';
import { el } from './dom.js';

export function renderWebpage(container, record) {
  const frame = document.createElement('iframe');
  frame.className = 'webpage-frame';
  // An empty sandbox gives the preview no scripts, forms, navigation, or same-origin access.
  frame.setAttribute('sandbox', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = `Web page preview: ${record.artifact.title}`;
  // The preview is the exact document Export writes.
  frame.srcdoc = buildWebPage(record.artifact, webpageMeta(record), inlineFontCss());
  container.append(el('p', 'muted small', 'This is a preview. Tap Save to get the web page file.'), frame);
  return { dispose() {} };
}
