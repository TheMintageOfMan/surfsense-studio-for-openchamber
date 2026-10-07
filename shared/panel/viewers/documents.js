import { el } from './dom.js';

// Previews render the validated artifact the file was built from; the binary file itself
// stays in the service. Every model value is set as text, never as markup.
function table({ columns, rows }) {
  const wrap = el('div', 'doc-table');
  const node = el('table');
  const head = el('tr');
  head.append(...columns.map((column) => el('th', null, column)));
  node.append(el('thead'), el('tbody'));
  node.tHead.append(head);
  for (const row of rows) {
    const line = el('tr');
    line.append(...row.map((value) => el('td', value === null ? 'empty' : null, value === null ? '' : String(value))));
    node.tBodies[0].append(line);
  }
  wrap.append(node);
  return wrap;
}

function list(items) {
  const node = el('ul');
  node.append(...items.map((item) => el('li', null, item)));
  return node;
}

function documentPreview(artifact) {
  const page = el('article', 'doc-page');
  page.append(el('h1', null, artifact.title));
  if (artifact.subtitle) page.append(el('p', 'doc-subtitle', artifact.subtitle));
  for (const section of artifact.sections) {
    if (section.heading) page.append(el('h2', null, section.heading));
    for (const paragraph of section.paragraphs) page.append(el('p', null, paragraph));
    if (section.bullets.length) page.append(list(section.bullets));
    if (section.table) page.append(table(section.table));
  }
  return [page];
}

function slidesPreview(artifact) {
  const cover = el('div', 'slide slide-cover');
  cover.append(el('span', 'slide-number', '1'), el('h3', null, artifact.title));
  if (artifact.subtitle) cover.append(el('p', 'doc-subtitle', artifact.subtitle));
  return [cover, ...artifact.slides.map((slide, index) => {
    const card = el('div', 'slide');
    card.append(el('span', 'slide-number', String(index + 2)), el('h3', null, slide.title), list(slide.bullets));
    if (slide.notes) card.append(el('p', 'slide-notes', `Notes: ${slide.notes}`));
    return card;
  })];
}

function sheetsPreview(artifact) {
  return artifact.tables.flatMap((sheet) => {
    const section = el('section', 'sheet-table');
    section.append(el('h3', null, `Sheet: ${sheet.name}`));
    if (sheet.description) section.append(el('p', 'muted small', sheet.description));
    section.append(table(sheet));
    return [section];
  });
}

const PREVIEWS = { docx: documentPreview, pdf: documentPreview, pptx: slidesPreview, xlsx: sheetsPreview };
const APPS = { docx: 'Word', pdf: 'a PDF reader', pptx: 'PowerPoint', xlsx: 'Excel' };

export function renderDocument(container, record) {
  container.append(el('p', 'muted small', `This is a preview. Tap Save to get the real file to open in ${APPS[record.format]}.`),
    ...PREVIEWS[record.format](record.artifact));
  return { dispose() {} };
}