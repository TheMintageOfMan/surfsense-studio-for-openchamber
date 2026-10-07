import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { flashcards } from '../shared/common/flashcards.mjs';
import { FORMATS, IMPLEMENTED, validateJob } from '../shared/common/formats.mjs';
import { mindmap } from '../shared/common/mindmap.mjs';
import { quiz } from '../shared/common/quiz.mjs';
import { buildWebPage, webpage, webpageMeta } from '../shared/common/webpage.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';
import { embeddedFontCss } from '../shared/service/fonts.mjs';

// Controlled replies exercise parsing, validation and persistence, not model quality.
const source = await fs.readFile(new URL('../SPEC.md', import.meta.url), 'utf8');
const model = { providerID: 'unit-test', id: 'controlled-transport' };
const request = (format) => ({ id: randomUUID(), format, source: { path: 'SPEC.md', content: source }, instructions: '', model });
const question = { question: 'Which pass is current?', options: ['First', 'Second', 'Third', 'Fourth'], answer: 1, explanation: 'Stated in the source.' };

async function directory() {
  const parent = path.resolve('temp');
  await fs.mkdir(parent, { recursive: true });
  return fs.mkdtemp(path.join(parent, 'formats-test-'));
}

async function settle(jobs, root, id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The controlled test transport did not settle.');
}

test('catalog shows all 12 formats and implements all but Podcast and Picture', () => {
  assert.equal(FORMATS.length, 12);
  assert.deepEqual(IMPLEMENTED.map((format) => format.key).sort(), ['docx', 'flashcards', 'infographic', 'mindmap', 'pdf', 'pptx', 'quiz', 'summary', 'webpage', 'xlsx']);
  assert.ok(FORMATS.filter((format) => !format.implemented).every((format) => format.reason.startsWith('Not built yet')));
  assert.throws(() => validateJob(request('podcast')), { code: 'BAD_FORMAT' });
  // Every prompt carries the complete source; nothing is excerpted.
  for (const format of IMPLEMENTED) assert.ok(format.prompt(validateJob(request(format.key))).includes(JSON.stringify(source)));
});

test('flashcards keep usable cards and disclose omissions and the 20-card cap', () => {
  const cards = Array.from({ length: 22 }, (_, index) => ({ front: `Question ${index}?`, back: `Answer ${index}.` }));
  const built = flashcards.build(`Here is the deck:\n\`\`\`json\n${JSON.stringify({ title: 'Deck', cards: [...cards, { front: 'No back' }] })}\n\`\`\``);
  assert.equal(built.artifact.cards.length, 20);
  assert.deepEqual(built.notes, ['Omitted 1 incomplete card from the model.', 'The model returned 22 usable cards; this build keeps the first 20.']);
  assert.throws(() => flashcards.build('{"title":"Deck","cards":[]}'), { code: 'EMPTY_RESULT' });
  assert.throws(() => flashcards.build('I cannot help with that.'), { code: 'BAD_OUTPUT' });
  assert.deepEqual(flashcards.validateProgress(built.artifact, { position: 3, known: [5, 1] }), { position: 3, known: [1, 5] });
  assert.throws(() => flashcards.validateProgress(built.artifact, { position: 20, known: [] }), { code: 'BAD_PROGRESS' });
  assert.throws(() => flashcards.validateProgress(built.artifact, { position: 0, known: [1, 1] }), { code: 'BAD_PROGRESS' });
});

test('quiz keeps only four distinct options with one valid answer', () => {
  const built = quiz.build(JSON.stringify({ title: 'Quiz', questions: [
    question, { ...question, answer: 'Third' }, { ...question, options: ['A', 'a', 'B', 'C'] },
    { ...question, options: ['A', 'B', 'C'] }, { ...question, answer: 4 },
  ] }));
  assert.deepEqual(built.artifact.questions.map((item) => item.answer), [1, 2]);
  assert.match(built.notes[0], /^Omitted 3 questions/);
  assert.match(built.markdown, /_Answer: B\. Second_/);
  assert.deepEqual(quiz.validateProgress(built.artifact, { answers: [0, null] }), { answers: [0, null] });
  assert.throws(() => quiz.validateProgress(built.artifact, { answers: [4, null] }), { code: 'BAD_PROGRESS' });
  assert.throws(() => quiz.validateProgress(built.artifact, { answers: [0] }), { code: 'BAD_PROGRESS' });
});

test('mind map discloses unlabeled, over-deep and excess branches', () => {
  let chain = { label: 'Level 7', children: [] };
  for (let level = 6; level >= 1; level -= 1) chain = { label: `Level ${level}`, children: [chain] };
  const extra = Array.from({ length: 10 }, (_, index) => ({ label: `Branch ${index}`, children: [] }));
  const built = mindmap.build(JSON.stringify({ title: 'Map', nodes: [chain, ...extra, { label: ' ', children: [{ label: 'Orphan' }] }] }));
  assert.equal(built.artifact.nodes.length, 10);
  assert.match(built.markdown, /^# Map\n- Level 1\n {2}- Level 2\n/);
  assert.ok(built.markdown.includes('          - Level 6') && !built.markdown.includes('Level 7'));
  assert.deepEqual(built.notes, [
    'Omitted 2 nodes under unlabeled entries.', 'Omitted 1 node deeper than 6 levels.',
    'The model returned 11 main branches; this build keeps the first 10.',
  ]);
});

test('web page escapes every model value and carries no executable markup', () => {
  const built = webpage.build(JSON.stringify({ title: '<script>alert(1)</script>', sections: [
    { heading: 'A "quoted" <b>heading</b>', paragraphs: ['x <img src=x onerror=alert(1)>', ''] }, { heading: 'Empty', paragraphs: [] },
  ] }));
  assert.equal(built.artifact.sections.length, 1);
  assert.deepEqual(built.notes, ['Omitted 1 section without paragraph text.']);
  const html = buildWebPage(built.artifact, { source: 'SPEC.md', model: 'unit-test/controlled', createdAt: '2026-10-06T00:00:00.000Z' });
  assert.equal(/<(script|img|b)\b/i.test(html), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('&quot;quoted&quot;'));
  assert.ok(html.includes("default-src 'none'"));
});

test('structured jobs persist artifacts and progress, and exports match the preview', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const page = request('webpage');
  await jobs.start(root, page, async () => ({ text: JSON.stringify({ title: 'Page', sections: [{ heading: 'One', paragraphs: ['Text'] }] }) }));
  assert.equal((await settle(jobs, root, page.id)).status, 'completed');
  await jobs.save(root, page.id, 'page.html');
  const restored = await new StudioJobs().get(root, page.id);
  // The saved page carries Inter inline; the panel preview supplies the same font itself.
  const saved = await fs.readFile(path.join(root, 'page.html'), 'utf8');
  assert.equal(saved, buildWebPage(restored.artifact, webpageMeta(restored), await embeddedFontCss()));
  assert.ok(saved.includes('font-family: Inter') && saved.includes('data:font/woff2;base64,'));
  await assert.rejects(jobs.save(root, page.id, 'page.html'), { code: 'FILE_EXISTS' });
  await assert.rejects(jobs.save(root, page.id, 'page.md'), { code: 'BAD_FILENAME' });
  await assert.rejects(jobs.saveProgress(root, page.id, { answers: [1] }), { code: 'NO_PROGRESS' });

  const test = request('quiz');
  await jobs.start(root, test, async () => ({ text: JSON.stringify({ title: 'Quiz', questions: [question] }) }));
  await settle(jobs, root, test.id);
  await jobs.saveProgress(root, test.id, { answers: [1] });
  assert.deepEqual((await new StudioJobs().get(root, test.id)).progress, { answers: [1] });
  const history = await jobs.list(root);
  assert.deepEqual(history.jobs.map((job) => job.format).sort(), ['quiz', 'webpage']);
  assert.ok(history.jobs.every((job) => !('artifact' in job) && !('markdown' in job)));
});

test('malformed structured output fails without saving an artifact', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const deck = request('flashcards');
  await jobs.start(root, deck, async () => ({ text: 'I cannot produce JSON for this.' }));
  const record = await settle(jobs, root, deck.id);
  assert.equal(record.status, 'failed');
  assert.equal(record.error.code, 'BAD_OUTPUT');
  assert.equal(record.artifact, null);
});
