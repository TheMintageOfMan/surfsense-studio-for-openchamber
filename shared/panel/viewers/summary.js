import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { el } from './dom.js';

export function renderSummary(container, record, { host, status }) {
  const article = el('article', 'markdown');
  // Model output remains untrusted even when it came from an authenticated provider.
  article.innerHTML = DOMPurify.sanitize(marked.parse(record.markdown), {
    FORBID_TAGS: ['img', 'svg', 'math', 'iframe', 'style', 'form', 'input', 'button'], FORBID_ATTR: ['style'],
  });
  article.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) void host.openUrl(href).catch((error) => status(error?.message || 'Could not open the link.', true));
    else status('Open files from the Files list in OpenChamber.');
  });
  container.append(article);
  return { dispose() {} };
}
