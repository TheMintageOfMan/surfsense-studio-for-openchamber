import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { infographic, LAYOUTS, libraryOptions } from '../shared/common/infographic.mjs';
import { buildFile } from '../shared/service/builders/index.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';

// Controlled replies; the AntV renderer itself runs for real in its worker thread.
const model = { providerID: 'unit-test', id: 'controlled-transport' };
const steps = { layout: 'steps', title: 'How a seed grows', desc: 'Four stages', items: [
  { label: 'Seed', desc: 'Planted in soil', icon: 'seed' }, { label: 'Sprout', desc: 'Roots appear', icon: 'sprout' },
  { label: 'Leaves', desc: 'Makes food from sunlight', icon: 'leaf' }, { label: 'Flower', desc: 'Makes new seeds', icon: '<b>' },
] };
const meta = { title: 'T', source: 'a.md', model: 'unit-test/controlled', createdAt: new Date('2026-10-06T12:00:00Z'), notes: [] };
const settle = async (jobs, root, id) => {
  for (let attempt = 0; attempt < 1500; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('did not settle');
};

test('infographic replies are checked against the chosen layout, with every change disclosed', () => {
  const built = infographic.build(JSON.stringify({ ...steps, items: [...steps.items, { desc: 'no label' }], title: 'x'.repeat(70) }));
  assert.equal(built.artifact.items.length, 4);
  assert.equal(built.artifact.items[3].icon, '', 'icon keywords are plain words only');
  assert.ok(built.artifact.title.endsWith('\u2026') && built.artifact.title.length <= 60);
  assert.deepEqual(built.notes, ['Omitted 1 item without a label.', 'Shortened 1 piece of text to fit the layout; each cut is marked with "\u2026".']);
  assert.throws(() => infographic.build('{"layout":"spaceship","title":"x"}'), { code: 'BAD_OUTPUT' });
  assert.throws(() => infographic.build(JSON.stringify({ layout: 'compare', title: 'x', groups: [{ label: 'A', items: ['a'] }] })), { code: 'EMPTY_RESULT' });
  assert.throws(() => infographic.build(JSON.stringify({ layout: 'pie', title: 'x', values: [{ label: 'A', value: 'lots' }, { label: 'B', value: -1 }] })), { code: 'EMPTY_RESULT' });
  const tree = infographic.build(JSON.stringify({ layout: 'tree', title: 'T', root: { label: 'R', children: [{ label: 'A', children: [{ label: 'A1', children: [{ label: 'too deep' }] }] }] } }));
  assert.deepEqual(tree.notes, ['Omitted 1 branch beyond 3 levels or 20 boxes.']);
  assert.deepEqual(libraryOptions(tree.artifact).data.items, [tree.artifact.root]);
  assert.equal(libraryOptions(infographic.build(JSON.stringify(steps)).artifact).template, LAYOUTS.steps.template);
});

test('the renderer draws a self-contained SVG in Inter and keeps the service free of DOM globals', async () => {
  const { artifact } = infographic.build(JSON.stringify(steps));
  const built = await buildFile('infographic', artifact, meta);
  const svg = built.bytes.toString('utf8');
  assert.match(svg, /^<\?xml[^>]*\?>\n<svg[\s>]/);
  assert.ok(!svg.includes('xml-stylesheet') && !svg.includes('assets.antv.antgroup.com'), 'no link to the library CDN font');
  assert.ok(svg.includes('font-family: Inter') && svg.includes('data:font/woff2;base64,'));
  for (const text of ['How a seed grows', 'Planted in soil', 'Makes new seeds']) assert.ok(svg.includes(text), text);
  assert.ok(built.preview.length < 60_000 && !built.preview.includes('base64,'), 'preview is light and font-free');
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.document, 'undefined');
  for (const layout of ['compare', 'pie', 'tree']) {
    const reply = layout === 'compare' ? { layout, title: 'Frogs vs toads', groups: [{ label: 'Frogs', items: ['Smooth skin', 'Long legs'] }, { label: 'Toads', items: ['Bumpy skin', 'Short legs'] }] }
      : layout === 'pie' ? { layout, title: 'Earth', values: [{ label: 'Water', value: 71 }, { label: 'Land', value: 29 }] }
        : { layout, title: 'Animals', root: { label: 'Animals', children: [{ label: 'Mammals' }, { label: 'Birds' }] } };
    const drawn = await buildFile('infographic', infographic.build(JSON.stringify(reply)).artifact, meta);
    assert.ok(drawn.bytes.toString('utf8').includes(reply.title), layout);
  }
});

test('infographic jobs store the SVG, carry a preview, and save SVG plus an uploaded PNG', async () => {
  await fs.mkdir('temp', { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve('temp'), 'infographic-test-'));
  const jobs = new StudioJobs();
  const input = { id: randomUUID(), format: 'infographic', sources: [{ path: 'a.md', content: 'Seeds grow.' }], model };
  await jobs.start(root, input, async () => ({ text: JSON.stringify(steps) }));
  const record = await settle(jobs, root, input.id);
  assert.equal(record.status, 'completed', JSON.stringify(record.error));
  assert.ok(record.artifact.svg.startsWith('<svg'));
  assert.equal((await jobs.save(root, input.id)).savedPath, 'How a seed grows.svg');
  // A 1x1 PNG, split the way the panel splits a real one.
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const upload = randomUUID();
  assert.deepEqual(await jobs.savePicture(root, input.id, { upload, index: 0, total: 2, data: png.slice(0, 40) }), { received: 1 });
  assert.equal((await jobs.savePicture(root, input.id, { upload, index: 1, total: 2, data: png.slice(40) })).savedPath, 'How a seed grows.png');
  assert.equal((await fs.readFile(path.join(root, 'How a seed grows.png'))).toString('base64'), png);
  await assert.rejects(jobs.savePicture(root, input.id, { upload: randomUUID(), index: 0, total: 1, data: btoa('not a png') }), { code: 'BAD_UPLOAD' });
});
