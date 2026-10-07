// Prompt rules and reply shape adapted from SurfSense (https://github.com/MODSetter/SurfSense,
// commit 7fb479c3): surfsense_local/backend/worker/studio/content/mindmap/prompts/frontier.md
// and pipeline.py. Copyright (c) SurfSense, Apache License 2.0; see THIRD-PARTY-LICENSES.txt.
// Modified: single JSON-encoded source, injection guard, disclosed branch and depth caps.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const BRANCHES = 10;
// Levels below the title. The prompt asks for two or three; this bounds recursion.
const DEPTH = 6;

function countNodes(items) {
  let total = 0;
  const stack = [...asList(items)];
  while (stack.length) {
    const item = stack.pop();
    total += 1;
    stack.push(...asList(item?.children));
  }
  return total;
}

export const mindmap = Object.freeze({
  key: 'mindmap',
  label: 'Mind map',
  noun: 'mind map',
  folder: 'mindmaps',
  extension: 'md',
  implemented: true,
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You turn a source document into a mind map someone thinks with. The reader will never see the source.',
      task: 'organise the source into a mind map.',
      rules: [
        'The source is raw material, not a structure to mirror. Branch by what the material is actually about, not by its section order.',
        `Use as many main branches as the material earns, at most ${BRANCHES}, and keep the tree two or three levels deep. Depth where the material is dense, none where it is thin.`,
        'A label is a few words carrying a fact, such as a figure, a date or a decision, not a category noun like "Overview" or "Details".',
        'Where the source records a disagreement or a correction, give that its own label rather than smoothing it away.',
        'Distinguish what is settled from what is proposed, pending or conditional, in the label itself.',
        'Use only what the source states. No outside knowledge, no plausible filler.',
        'You tend to converge on generic, on-distribution structures. Resist it; build the map only this material could produce.',
      ],
      shape: 'Return only JSON, no prose: {"title": string, "nodes": [{"label": string, "children": [{"label": string, "children": [...]}]}]}. Labels are plain text. Nothing before the JSON, nothing after it.',
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Mind map');
    let unlabeled = 0;
    let deep = 0;
    const walk = (items, depth) => asList(items).flatMap((item) => {
      const label = asText(item?.label);
      if (!label) { unlabeled += countNodes([item]); return []; }
      if (depth > DEPTH) { deep += countNodes([item]); return []; }
      return [{ label, children: walk(item.children, depth + 1) }];
    });
    const branches = walk(spec.nodes, 1);
    const nodes = branches.slice(0, BRANCHES);
    if (!nodes.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable mind map branches. Nothing was saved; regenerate explicitly.');
    const notes = [];
    if (unlabeled) notes.push(`Omitted ${plural(unlabeled, 'node')} under unlabeled entries.`);
    if (deep) notes.push(`Omitted ${plural(deep, 'node')} deeper than ${DEPTH} levels.`);
    if (branches.length > BRANCHES) notes.push(`The model returned ${branches.length} main branches; this build keeps the first ${BRANCHES}.`);
    const title = asText(spec.title) || 'Mind map';
    const lines = [`# ${title}`];
    const outline = (items, depth) => items.forEach((node) => {
      lines.push(`${'  '.repeat(depth)}- ${node.label}`);
      outline(node.children, depth + 1);
    });
    outline(nodes, 0);
    return { title, markdown: lines.join('\n') + '\n', artifact: { title, nodes }, notes };
  },
});
