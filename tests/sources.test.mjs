import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { docx, pdf, pptx, xlsx } from '../shared/common/documents.mjs';
import { CHAT_LIMIT, CHAT_SOURCE, sourceKind } from '../shared/common/sources.mjs';
import { quiz } from '../shared/common/quiz.mjs';
import { buildFile } from '../shared/service/builders/index.mjs';
import { chatSource, measureChat, transcript } from '../shared/service/chat.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';
import { htmlText, listSources, readSource, readSourceOrExplain } from '../shared/service/sources.mjs';

// Fixtures are built by Studio's own file builders, so no binary test files are checked in.
const meta = { title: 'T', source: 'a.md', model: 'unit-test/controlled', createdAt: new Date('2026-10-06T12:00:00Z'), notes: [] };
const model = { providerID: 'unit-test', id: 'controlled-transport' };
const reply = JSON.stringify({ title: 'Quiz', questions: [{ question: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'E.' }] });

async function project() {
  await fs.mkdir('temp', { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve('temp'), 'sources-test-'));
  const document = { title: 'Water cycle', sections: [{ heading: 'Evaporation', paragraphs: ['The sun warms the sea.'], bullets: ['Clouds form'], table: null }] };
  const files = {
    'notes.md': '# Notes\nPlants need light.',
    'data.csv': 'planet,moons\nEarth,1\nMars,2\n',
    'page.html': '<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Seeds &amp; soil</h1><p>Roots grow <b>down</b>.</p></body></html>',
    'report.docx': (await buildFile('docx', docx.build(JSON.stringify(document)).artifact, meta)).bytes,
    'report.pdf': (await buildFile('pdf', pdf.build(JSON.stringify(document)).artifact, meta)).bytes,
    'deck.pptx': (await buildFile('pptx', pptx.build(JSON.stringify({ title: 'Deck', slides: [{ title: 'Rain falls', bullets: ['Water returns'], notes: 'Say why' }] })).artifact, meta)).bytes,
    'table.xlsx': (await buildFile('xlsx', xlsx.build(JSON.stringify({ title: 'T', tables: [{ name: 'Planets', columns: ['Planet', 'Moons'], rows: [['Earth', 1], ['Mars', 2]] }] })).artifact, meta)).bytes,
    'binary.txt': Buffer.from([0x61, 0x00, 0x62]),
    'empty.md': '   ',
    'LICENSE.md': 'boilerplate',
  };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(root, name), content);
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'node_modules', 'skip.md'), 'never listed');
  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'docs', 'more.txt'), 'Nested notes.');
  return root;
}

test('every supported file type yields its text, and unreadable files say why', async () => {
  const root = await project();
  assert.equal(await readSource(root, 'notes.md'), '# Notes\nPlants need light.');
  assert.match(await readSource(root, 'data.csv'), /Earth,1/);
  assert.equal(await readSource(root, 'page.html'), 'Seeds & soil\nRoots grow down .');
  for (const [name, words] of [['report.docx', ['Water cycle', 'The sun warms the sea.', 'Clouds form']], ['report.pdf', ['Page 1', 'The sun warms the sea.']],
    ['deck.pptx', ['Slide 2', 'Rain falls', 'Water returns', 'Notes:', 'Say why']], ['table.xlsx', ['Sheet: Planets', 'Planet\tMoons', 'Earth\t1']]]) {
    const text = await readSource(root, name);
    for (const word of words) assert.ok(text.includes(word), `${name}: ${word}`);
  }
  assert.deepEqual((await readSourceOrExplain(root, 'binary.txt')).error, { code: 'NOT_TEXT', message: 'binary.txt is not readable as text.' });
  assert.equal((await readSourceOrExplain(root, 'empty.md')).error.code, 'NO_TEXT');
  assert.equal((await readSourceOrExplain(root, 'gone.md')).error.code, 'MISSING_SOURCE');
  assert.equal((await readSourceOrExplain(root, 'program.exe')).error.code, 'BAD_SOURCE');
  await fs.writeFile(path.join(root, 'broken.pdf'), 'not a pdf');
  assert.equal((await readSourceOrExplain(root, 'broken.pdf')).error.code, 'BAD_FILE');
  assert.equal(sourceKind('Report.DOCX'), 'docx');
  assert.equal(htmlText('<p>a&nbsp;b</p><br>c'), 'a b\n\nc');
});

test('the source list measures files, skips tooling folders and boilerplate, and explains failures', async () => {
  const root = await project();
  const files = await listSources(root);
  const byPath = Object.fromEntries(files.map((file) => [file.path, file]));
  assert.ok(!byPath['LICENSE.md'] && !byPath['node_modules/skip.md']);
  assert.equal(byPath['docs/more.txt'].characters, 'Nested notes.'.length);
  assert.equal(byPath['report.pdf'].kind, 'pdf');
  assert.ok(byPath['report.pdf'].characters > 0);
  assert.equal(byPath['binary.txt'].error, 'is not readable as text.');
});

test('a file outside the project or behind a link is never read', async () => {
  const root = await project();
  const outside = path.join(path.dirname(root), `outside-${randomUUID()}.md`);
  await fs.writeFile(outside, 'secret');
  assert.equal((await readSourceOrExplain(root, `../${path.basename(outside)}`)).error.code, 'BAD_SOURCE');
  try {
    await fs.symlink(outside, path.join(root, 'link.md'));
    assert.equal((await readSourceOrExplain(root, 'link.md')).error.code, 'BAD_SOURCE');
  } catch (error) {
    // Windows needs a privilege to create symlinks; the path check above still applies.
    if (error.code !== 'EPERM') throw error;
  }
});

test('jobs read files by path in the service, record their identity, and name a failing file', async () => {
  const root = await project();
  const jobs = new StudioJobs();
  let prompt = '';
  const ok = { id: randomUUID(), format: 'quiz', sources: [{ path: 'report.pdf' }, { path: 'deck.pptx' }], model };
  await jobs.start(root, ok, async (text) => { prompt = text; return { text: reply }; });
  const record = await settle(jobs, root, ok.id);
  assert.equal(record.status, 'completed', JSON.stringify(record.error));
  assert.ok(prompt.includes('The sun warms the sea.') && prompt.includes('Rain falls'));
  assert.deepEqual(record.sources.map((source) => source.path), ['report.pdf', 'deck.pptx']);
  assert.ok(record.sources.every((source) => source.characters > 0 && /^[0-9a-f]{32}$/.test(source.md5)));

  const bad = { id: randomUUID(), format: 'quiz', sources: [{ path: 'notes.md' }, { path: 'binary.txt' }], model };
  let calls = 0;
  await jobs.start(root, bad, async () => { calls += 1; return { text: reply }; });
  const failed = await settle(jobs, root, bad.id);
  assert.equal(failed.error.message, 'binary.txt is not readable as text.');
  assert.equal(calls, 0, 'no model call when a source cannot be read');
});

const conversation = (count, size) => Array.from({ length: count }, (_, index) => (index % 2
  ? { type: 'assistant', content: [{ type: 'reasoning', text: 'hidden' }, { type: 'tool', name: 'shell' }, { type: 'text', text: `Answer ${index} ${'x'.repeat(size)}` }] }
  : { type: 'user', text: `Question ${index}` }));

test('a short chat goes as it is; a long one is compressed by OpenCode, and only on request', async () => {
  const short = conversation(4, 10);
  assert.equal(transcript(short), `User: Question 0\n\nAssistant: Answer 1 ${'x'.repeat(10)}\n\nUser: Question 2\n\nAssistant: Answer 3 ${'x'.repeat(10)}`);
  assert.ok(!transcript(short).includes('hidden'), 'reasoning and tools are left out');
  const compacted = [{ type: 'compaction', status: 'completed', summary: 'We planned the water cycle unit.', recent: '' }, ...short];
  assert.match(transcript(compacted), /^Earlier in this chat \(summary\):\nWe planned the water cycle unit\./);

  let summarized = 0;
  const connection = (messages, summary = 'Key points.') => ({
    chatContext: async () => messages,
    summarizeChat: async (prompt) => { summarized += 1; assert.match(prompt, /compressed context/); return summary; },
  });
  assert.deepEqual(await measureChat(connection(short)), { available: true, characters: transcript(short).length, compressed: false });
  const full = await chatSource(connection(short));
  assert.equal(full.how, 'full');
  assert.equal(summarized, 0);

  const long = conversation(6, 4000);
  assert.deepEqual(await measureChat(connection(long)), { available: true, characters: CHAT_LIMIT, compressed: true });
  const compressed = await chatSource(connection(long));
  assert.deepEqual([compressed.how, compressed.content, summarized], ['compressed', 'Key points.', 1]);
  assert.ok(compressed.fullCharacters > CHAT_LIMIT);
  await assert.rejects(chatSource(connection(long, 'y'.repeat(CHAT_LIMIT + 1))), { code: 'CHAT_SUMMARY_FAILED' });
  await assert.rejects(chatSource(connection([])), { code: 'EMPTY_CHAT' });
  assert.deepEqual(await measureChat(connection([])), { available: false, reason: 'This chat has no messages yet.' });
});

test('a job can use the chat alone, labelled for the model as the current conversation', async () => {
  const root = await project();
  const jobs = new StudioJobs();
  let prompt = '';
  const input = { id: randomUUID(), format: 'quiz', sources: [], chat: true, model };
  const connection = { chatContext: async () => conversation(2, 5), summarizeChat: async () => assert.fail('short chats are not summarized') };
  await jobs.start(root, input, async (text) => { prompt = text; return { text: reply }; }, { connection });
  const record = await settle(jobs, root, input.id);
  assert.equal(record.status, 'completed', JSON.stringify(record.error));
  assert.ok(prompt.includes('"name":"this chat"') && prompt.includes('Question 0'));
  assert.ok(!prompt.includes(CHAT_SOURCE));
  assert.equal(record.chat.how, 'full');
  assert.equal(record.source.path, 'this chat');
  assert.equal(quiz.key, record.format);
});

async function settle(jobs, root, id) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('did not settle');
}
