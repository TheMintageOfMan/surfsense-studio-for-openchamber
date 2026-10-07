// Infographic: the model picks one checked layout and fills in its data; AntV Infographic
// (shared/service/builders/infographic.mjs) draws it. This project's own prompt and rules.
// Every layout below was rendered and checked by eye to show every field Studio sends it.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const ITEMS = { min: 3, max: 8 };
const TEXT = { title: 60, desc: 120, label: 28, itemDesc: 70, groupItem: 60 };

// id -> AntV template, data kind, and when to use it (shown to the model).
export const LAYOUTS = Object.freeze({
  'steps': { template: 'list-row-horizontal-icon-arrow', kind: 'items', use: 'a process or how-to, 3 to 6 steps in order' },
  'stairs': { template: 'sequence-ascending-steps', kind: 'items', use: 'stages that build up or grow, 3 to 6' },
  'roadmap': { template: 'sequence-roadmap-vertical-simple', kind: 'items', use: 'a journey or plan with milestones, 3 to 6' },
  'timeline': { template: 'sequence-timeline-simple', kind: 'items', use: 'events in time order, label is the date or period' },
  'cycle': { template: 'sequence-circular-simple', kind: 'items', use: 'a repeating cycle, 3 to 6 stages' },
  'pyramid': { template: 'sequence-pyramid-simple', kind: 'items', use: 'levels from top (smallest or most important) to bottom' },
  'funnel': { template: 'sequence-funnel-simple', kind: 'items', use: 'a narrowing process from wide to narrow' },
  'cards': { template: 'list-grid-badge-card', kind: 'items', use: 'a set of related facts or parts, no order' },
  'list': { template: 'list-column-vertical-icon-arrow', kind: 'items', use: 'a numbered list of key points' },
  'compare': { template: 'compare-hierarchy-row-letter-card-compact-card', kind: 'groups', groups: 2, use: 'two things side by side' },
  'compare-circles': { template: 'compare-hierarchy-left-right-circle-node-pill-badge', kind: 'groups', groups: 2, use: 'two things and their features' },
  'swot': { template: 'compare-swot', kind: 'groups', groups: 4, use: 'strengths, weaknesses, opportunities and threats, in that order' },
  'pie': { template: 'chart-pie-donut-pill-badge', kind: 'values', use: 'parts of a whole, numbers from the source' },
  'columns': { template: 'chart-column-simple', kind: 'values', use: 'a few amounts to compare, numbers from the source' },
  'bars': { template: 'chart-bar-plain-text', kind: 'values', use: 'amounts with longer names, numbers from the source' },
  'tree': { template: 'hierarchy-tree-curved-line-rounded-rect-node', kind: 'tree', use: 'groups and subgroups, up to three levels' },
});
const TREE = { depth: 3, nodes: 20 };

// Text that would break a layout is cut at a word boundary and the cut is disclosed.
function fit(value, limit, counter) {
  const text = asText(value).replace(/\s+/g, ' ');
  if (text.length <= limit) return text;
  counter.shortened += 1;
  const cut = text.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(limit / 2))).trim()}\u2026`;
}

// Icon keywords are fetched by name from AntV's icon service, so keep them to a plain word.
const iconWord = (value) => (asText(value).toLowerCase().match(/^[a-z][a-z -]{0,30}$/) ? asText(value).toLowerCase() : '');

function buildItems(spec, notes, counter) {
  const offered = asList(spec.items);
  const usable = offered.map((item) => ({ label: fit(item?.label, TEXT.label, counter), desc: fit(item?.desc, TEXT.itemDesc, counter), icon: iconWord(item?.icon) }))
    .filter((item) => item.label);
  if (usable.length < offered.length) notes.push(`Left out ${plural(offered.length - usable.length, 'item')} without a name.`);
  if (usable.length > ITEMS.max) notes.push(`Kept the first ${ITEMS.max} of ${usable.length} items.`);
  const items = usable.slice(0, ITEMS.max);
  if (items.length < ITEMS.min) throw new StudioError('EMPTY_RESULT', `The model returned fewer than ${ITEMS.min} usable items.`);
  return { items };
}

function buildGroups(spec, notes, counter, count) {
  const offered = asList(spec.groups);
  const groups = offered.map((group) => ({
    label: fit(group?.label, TEXT.label, counter),
    items: asList(group?.items).map((item) => fit(item, TEXT.groupItem, counter)).filter(Boolean).slice(0, 5),
  })).filter((group) => group.label && group.items.length);
  if (groups.length !== count) throw new StudioError('EMPTY_RESULT', `This layout needs exactly ${count} groups with items; the model returned ${groups.length}.`);
  return { groups };
}

function buildValues(spec, notes, counter) {
  const offered = asList(spec.values);
  const values = offered.map((entry) => ({ label: fit(entry?.label, TEXT.label, counter), value: entry?.value }))
    .filter((entry) => entry.label && typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value >= 0);
  if (values.length < offered.length) notes.push(`Left out ${plural(offered.length - values.length, 'value')} without a name or a usable number.`);
  if (values.length > ITEMS.max) notes.push(`Kept the first ${ITEMS.max} of ${values.length} values.`);
  const kept = values.slice(0, ITEMS.max);
  if (kept.length < 2 || !kept.some((entry) => entry.value > 0)) throw new StudioError('EMPTY_RESULT', 'The model returned too few usable numbers for a chart.');
  return { values: kept };
}

function buildTree(spec, notes, counter) {
  let nodes = 0;
  let dropped = 0;
  const walk = (node, depth) => {
    const label = fit(node?.label, TEXT.label, counter);
    if (!label) return null;
    nodes += 1;
    const children = [];
    for (const child of asList(node?.children)) {
      if (depth >= TREE.depth || nodes >= TREE.nodes) { dropped += 1; continue; }
      const built = walk(child, depth + 1);
      if (built) children.push(built);
    }
    return { label, children };
  };
  const root = walk(spec.root, 1);
  if (!root || !root.children.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable tree.');
  if (dropped) notes.push(`Left out ${dropped} smaller branch${dropped === 1 ? '' : 'es'} to keep the tree readable.`);
  return { root };
}

function markdownOf(artifact) {
  const lines = [`# ${artifact.title}`];
  if (artifact.desc) lines.push('', artifact.desc);
  lines.push('');
  if (artifact.items) for (const item of artifact.items) lines.push(`- **${item.label}**${item.desc ? `: ${item.desc}` : ''}`);
  if (artifact.groups) for (const group of artifact.groups) lines.push(`## ${group.label}`, '', ...group.items.map((item) => `- ${item}`), '');
  if (artifact.values) for (const entry of artifact.values) lines.push(`- ${entry.label}: ${entry.value}`);
  if (artifact.root) {
    const walk = (node, depth) => { lines.push(`${'  '.repeat(depth)}- ${node.label}`); node.children.forEach((child) => walk(child, depth + 1)); };
    walk(artifact.root, 0);
  }
  return lines.join('\n').trim() + '\n';
}

// What the AntV renderer receives. Every data kind is passed as `items` (a tree as one root).
export function libraryOptions(artifact) {
  const { template, kind } = LAYOUTS[artifact.layout];
  const items = kind === 'items' ? artifact.items.map(({ label, desc, icon }) => ({ label, ...(desc ? { desc } : {}), ...(icon ? { icon } : {}) }))
    : kind === 'groups' ? artifact.groups.map((group) => ({ label: group.label, children: group.items.map((label) => ({ label })) }))
      : kind === 'values' ? artifact.values.map(({ label, value }) => ({ label, value }))
        : [artifact.root];
  return { template, data: { title: artifact.title, ...(artifact.desc ? { desc: artifact.desc } : {}), items } };
}

const SHAPES = [
  'Return only JSON, no prose, in one of these shapes, matching the layout\'s kind:',
  `- items: {"layout": string, "title": string, "desc": string, "items": [{"label": string, "desc": string, "icon": string}]} with ${ITEMS.min} to ${ITEMS.max} items. "icon" is one plain English word naming a simple picture, such as "leaf", "sun" or "rocket".`,
  '- groups: {"layout": string, "title": string, "desc": string, "groups": [{"label": string, "items": [string]}]} with exactly the number of groups the layout needs and 2 to 5 short items each.',
  `- values: {"layout": string, "title": string, "desc": string, "values": [{"label": string, "value": number}]} with 2 to ${ITEMS.max} values, each a number the source states.`,
  `- tree: {"layout": "tree", "title": string, "desc": string, "root": {"label": string, "children": [{"label": string, "children": [...]}]}} at most ${TREE.depth} levels and ${TREE.nodes} boxes.`,
  'Nothing before the JSON, nothing after it.',
].join('\n');

export const infographic = Object.freeze({
  key: 'infographic',
  label: 'Infographic',
  noun: 'infographic',
  folder: 'infographics',
  extension: 'svg',
  implemented: true,
  binary: true,
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You design one-page infographics from a source document for readers aged ten and up. The reader sees only the infographic.',
      task: 'pick the one layout that best fits the most important idea in the source, and fill it in.',
      rules: [
        `Choose exactly one layout id: ${Object.entries(LAYOUTS).map(([id, layout]) => `"${id}" (${layout.kind}: ${layout.use})`).join('; ')}.`,
        'Pick the layout from the shape of the material: order suggests steps or a timeline, two sides suggest compare, numbers suggest a chart, nesting suggests a tree.',
        'Use a chart only when the source gives the numbers. Never estimate, round up or invent a number.',
        `Keep text short and plain: title up to ${TEXT.title} characters, desc up to ${TEXT.desc}, labels up to ${TEXT.label}, item descriptions up to ${TEXT.itemDesc}, group items up to ${TEXT.groupItem}.`,
        'Use only what the source states. No outside knowledge, no plausible filler.',
        'Every value is plain text: no Markdown, HTML or emoji.',
      ],
      shape: SHAPES,
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Infographic');
    const layout = asText(spec.layout).toLowerCase();
    const chosen = LAYOUTS[layout];
    if (!chosen) throw new StudioError('BAD_OUTPUT', 'The model chose a layout this build does not offer.');
    const notes = [];
    const counter = { shortened: 0 };
    const title = fit(spec.title, TEXT.title, counter) || 'Infographic';
    const desc = fit(spec.desc, TEXT.desc, counter);
    const body = chosen.kind === 'items' ? buildItems(spec, notes, counter)
      : chosen.kind === 'groups' ? buildGroups(spec, notes, counter, chosen.groups)
        : chosen.kind === 'values' ? buildValues(spec, notes, counter)
          : buildTree(spec, notes, counter);
    if (counter.shortened) notes.push(`Shortened ${counter.shortened} piece${counter.shortened === 1 ? '' : 's'} of text to fit; each cut is marked with "\u2026".`);
    const artifact = { layout, title, desc, ...body };
    return { title, markdown: markdownOf(artifact), artifact, notes };
  },
});
