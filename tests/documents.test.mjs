import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { DOCUMENT_CAPS, docx, pdf, pptx, sheetName, xlsx } from '../shared/common/documents.mjs';
import { LIMITS } from '../shared/common/core.mjs';
import { buildFile } from '../shared/service/builders/index.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';

// Controlled replies only: these check validation, the built files and persistence, not model quality.
const model = { providerID: 'unit-test', id: 'controlled-transport' };
const request = (format) => ({ id: randomUUID(), format, source: { path: 'SPEC.md', content: 'Source text.' }, instructions: '', model });
const meta = (notes = []) => ({ title: 'T', source: 'SPEC.md', model: 'unit-test/controlled', createdAt: new Date('2026-10-06T12:00:00Z'), notes });
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const documentReply = {
  title: 'Report \u201cquoted\u201d', subtitle: 'Sub \u2014 title',
  sections: [
    { heading: 'Status', paragraphs: ['First <b>not markup</b>.'], bullets: ['One', 'Two'], table: { columns: ['A', 'B'], rows: [['1', '2'], ['3'], ['5', '6']] } },
    { heading: 'Empty', paragraphs: [], bullets: [], table: null },
    { heading: 'Wide', paragraphs: ['Text'], bullets: [], table: { columns: Array.from({ length: 9 }, (_, i) => `C${i}`), rows: [] } },
  ],
};
const sheetReply = {
  title: 'Data',
  tables: [
    { name: 'Sites: [west]', description: 'Section 2', columns: ['Site', 'Racks', 'Note'], rows: [['PDX', 12, null], ['=1+1', 2.5, ''], ['short'], ['IAD', true, 'x']] },
    { name: 'Notes', description: '', columns: ['A'], rows: [['b']] },
    { name: 'Empty', description: '', columns: ['A'], rows: [] },
  ],
};

async function directory() {
  const parent = path.resolve('temp');
  await fs.mkdir(parent, { recursive: true });
  return fs.mkdtemp(path.join(parent, 'documents-test-'));
}

async function settle(jobs, root, id) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The controlled test transport did not settle.');
}

test('Word and PDF replies keep valid sections and disclose every omission', () => {
  const built = docx.build(JSON.stringify(documentReply));
  assert.deepEqual(built.artifact.sections.map((section) => section.heading), ['Status', 'Wide']);
  assert.deepEqual(built.artifact.sections[0].table.rows, [['1', '2'], ['5', '6']]);
  assert.equal(built.artifact.sections[1].table, null);
  assert.deepEqual(built.notes, [
    'Left out 1 empty section.',
    'Left out 1 incomplete row from the table in section 1.',
    `Left out the table in section 3 because it had 9 columns (the most is ${DOCUMENT_CAPS.tableColumns}).`,
  ]);
  assert.match(built.markdown, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  const many = { title: 'T', sections: Array.from({ length: 14 }, (_, i) => ({ heading: `S${i}`, paragraphs: ['p'] })) };
  assert.match(pdf.build(JSON.stringify(many)).notes.at(-1), /^Kept the first 12 of 14 sections\.$/);
  assert.throws(() => pdf.build('{"title":"T","sections":[]}'), { code: 'EMPTY_RESULT' });
  assert.throws(() => docx.build('{"title": "cut off'), { code: 'BAD_OUTPUT' });
});

test('Slides keep titled slides, cap bullets and slides, and disclose both', () => {
  const slides = Array.from({ length: 16 }, (_, i) => ({ title: `S${i}`, bullets: Array.from({ length: i === 0 ? 8 : 2 }, (_, j) => `b${j}`), notes: 'n' }));
  const built = pptx.build(JSON.stringify({ title: 'Deck', slides: [...slides, { title: '', bullets: ['x'] }] }));
  assert.equal(built.artifact.slides.length, DOCUMENT_CAPS.slides);
  assert.equal(built.artifact.slides[0].bullets.length, DOCUMENT_CAPS.bullets);
  assert.deepEqual(built.notes, [
    'Left out 1 slide without a title or points.', 'Kept the first 6 points on 1 slide that had more.',
    'Kept the first 15 of 16 slides.',
  ]);
});

test('Spreadsheet keeps source values only, checks row lengths and sanitizes sheet names', () => {
  const built = xlsx.build(JSON.stringify(sheetReply));
  const [sites, notes] = built.artifact.tables;
  assert.equal(built.artifact.tables.length, 2);
  assert.equal(sites.name, 'Sites west');
  assert.equal(notes.name, 'Notes 2');
  assert.deepEqual(sites.rows, [['PDX', 12, null], ['=1+1', 2.5, null], ['IAD', null, 'x']]);
  assert.deepEqual(built.notes, [
    'Left out 1 incomplete row from the table "Sites: [west]".',
    'Left out the table "Empty" because it had no rows.',
    'Renamed the sheet "Sites: [west]" to "Sites west", because Excel does not allow that name.',
    'Renamed the sheet "Notes" to "Notes 2", because Excel does not allow that name.',
    'Left 1 cell blank because the value could not be used.',
  ]);
  const taken = new Set();
  assert.equal(sheetName('x'.repeat(40), taken, 0), 'x'.repeat(31));
  assert.equal(sheetName('x'.repeat(40), taken, 1), `${'x'.repeat(27)} (2)`);
  assert.equal(sheetName("'History'", taken, 2), 'History 3');
  assert.equal(sheetName('', taken, 3), 'Sheet 4');
});

test('built files are valid packages, carry the text, and rebuild byte-identically', async () => {
  const cases = { docx: docx.build(JSON.stringify(documentReply)), pptx: pptx.build(JSON.stringify({ title: 'Deck', slides: [{ title: 'S', bullets: ['b'], notes: 'n' }] })), xlsx: xlsx.build(JSON.stringify(sheetReply)) };
  const parts = { docx: 'word/document.xml', pptx: 'ppt/slides/slide2.xml', xlsx: 'xl/worksheets/sheet1.xml' };
  for (const [key, built] of Object.entries(cases)) {
    const first = await buildFile(key, built.artifact, meta(built.notes));
    const second = await buildFile(key, built.artifact, meta(built.notes));
    assert.equal(md5(first.bytes), md5(second.bytes), `${key} rebuild differs`);
    const entries = unzipSync(first.bytes);
    assert.ok(entries['[Content_Types].xml'] && entries[parts[key]], `${key} is missing OOXML parts`);
    assert.match(strFromU8(entries['docProps/core.xml'] ?? new Uint8Array()), /2026-10-06T12:00:00Z|^$/);
  }
  const word = strFromU8(unzipSync((await buildFile('docx', cases.docx.artifact, meta())).bytes)['word/document.xml']);
  assert.ok(word.includes('First &lt;b&gt;not markup&lt;/b&gt;.') && !word.includes('<b>'));
  // Formula-like text stays a string cell: no <f> element is written.
  const sheet = strFromU8(unzipSync((await buildFile('xlsx', cases.xlsx.artifact, meta())).bytes)['xl/worksheets/sheet1.xml']);
  assert.ok(!sheet.includes('<f>'));

  const report = pdf.build(JSON.stringify({ ...documentReply, title: 'Rocket \u{1F680}' }));
  const one = await buildFile('pdf', report.artifact, meta());
  const two = await buildFile('pdf', report.artifact, meta());
  assert.equal(md5(one.bytes), md5(two.bytes));
  assert.equal(one.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(one.bytes.subarray(-32).toString(), /%%EOF\s*$/);
  assert.equal(one.pages, 1);
  assert.deepEqual(one.notes, ['One character (\u{1F680}) could not be shown in the PDF and appears as "?".']);
});

test('document jobs store the file, export its exact bytes, and refuse overwrites', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const job = request('xlsx');
  await jobs.start(root, job, async () => ({ text: JSON.stringify(sheetReply) }));
  const record = await settle(jobs, root, job.id);
  assert.equal(record.status, 'completed', JSON.stringify(record.error));
  assert.equal(record.file.name, `${job.id}.xlsx`);
  const stored = await fs.readFile(path.join(root, '.studio/spreadsheets', record.file.name));
  assert.equal(md5(stored), record.file.md5);
  assert.equal(stored.length, record.file.bytes);
  assert.ok(JSON.stringify(jobs.public(record)).length < LIMITS.response);

  await jobs.save(root, job.id, 'data.xlsx');
  assert.equal(md5(await fs.readFile(path.join(root, 'data.xlsx'))), record.file.md5);
  await assert.rejects(jobs.save(root, job.id, 'data.xlsx'), { code: 'FILE_EXISTS' });
  await assert.rejects(jobs.save(root, job.id, 'data.docx'), { code: 'BAD_FILENAME' });

  // A tampered stored file is never exported.
  await fs.writeFile(path.join(root, '.studio/spreadsheets', record.file.name), 'changed');
  await assert.rejects(jobs.save(root, job.id, 'other.xlsx'), { code: 'FILE_CHANGED' });

  const history = await jobs.list(root);
  assert.equal(history.total, 1);
  assert.ok(history.jobs.every((entry) => !('artifact' in entry)));

  const broken = request('pptx');
  await jobs.start(root, broken, async () => ({ text: '{"title":"Deck","slides":[' }));
  const failed = await settle(jobs, root, broken.id);
  assert.equal(failed.error.code, 'BAD_OUTPUT');
  assert.equal(failed.file, null);
  await assert.rejects(fs.access(path.join(root, '.studio/slides', `${broken.id}.pptx`)));
});
