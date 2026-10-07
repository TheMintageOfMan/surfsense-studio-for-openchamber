import { mountButton } from '@openchamber/sdk/ui';
import { Markmap } from 'markmap-view';
import { escapeHtml } from '../../common/webpage.mjs';
import { el, slot } from './dom.js';

// Markmap renders node content as HTML, so every model label is escaped.
const toNode = (node) => ({ content: escapeHtml(node.label), children: node.children.map(toNode) });

export function renderMindmap(container, record) {
  const toolbar = el('div', 'actions');
  const canvas = el('div', 'mindmap');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mindmap-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Mind map: ${record.artifact.title}. Click a node's circle to collapse or expand it.`);
  canvas.append(svg);
  const outline = el('details', 'outline');
  outline.append(el('summary', '', 'Text outline'), el('pre', '', record.markdown));
  container.append(toolbar, canvas, outline);

  // Created after the SVG is in the document so Markmap can measure labels.
  const markmap = Markmap.create(svg, { duration: 250, initialExpandLevel: -1, zoom: true, pan: true }, {
    content: escapeHtml(record.artifact.title), children: record.artifact.nodes.map(toNode),
  });
  const fit = mountButton(slot(toolbar), { label: 'Fit to view', variant: 'secondary', size: 'sm', onClick: () => { void markmap.fit(); } });
  toolbar.append(el('span', 'muted small', 'Drag to pan, scroll to zoom, click a circle to collapse.'));
  return { dispose() { fit.dispose(); markmap.destroy(); } };
}
