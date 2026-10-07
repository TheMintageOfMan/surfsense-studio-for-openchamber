import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { excelDateText, isDateFormat } from '../shared/service/excel-dates.mjs';
import { readCompoundFile } from '../shared/service/legacy.mjs';
import { readSource, readSourceOrExplain } from '../shared/service/sources.mjs';

// Fixtures were saved by Microsoft Office from short, made-up content (see tests/fixtures/README.md).
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const trips = 'Sheet: Trips\nPlace\tDate\tCost\tStart\nZoo\t2025-10-06\t12.5\t09:00\nMuseum & park\t2025-10-20\t25\t2025-10-20 12:00\n\nSheet: Notes\nBring water\nTRUE';

test('Word 97-2003 text keeps accents, symbols, quotes and table cells', async () => {
  assert.equal(await readSource(fixtures, 'small.doc'),
    'The water cycle\nThe sun warms the sea and water rises as vapour.\nCaf\u00e9 notes: 5 \u2264 7 \u2014 \u201cquoted\u201d\nStage\tWhere\nRain\tClouds');
});

test('PowerPoint 97-2003 slides come out in order with their notes', async () => {
  assert.equal(await readSource(fixtures, 'small.ppt'),
    'Slide 1\nPlanets\nA short tour\n\nSlide 2\nMars is red\nIron oxide dust\nTwo small moons\nNotes:\nMention Phobos and Deimos');
});

test('Excel shows dates, times and formula results the same way in .xls and .xlsx', async () => {
  assert.equal(await readSource(fixtures, 'trips.xls'), trips);
  assert.equal(await readSource(fixtures, 'trips.xlsx'), trips);
});

test('date formats are recognized and serials print as dates in both date systems', () => {
  assert.ok(isDateFormat(14) && isDateFormat(164, 'dd mmm yyyy') && isDateFormat(165, '[h]:mm'));
  assert.ok(!isDateFormat(0) && !isDateFormat(164, '0.00') && !isDateFormat(164, '"days" 0') && !isDateFormat(164, '[Red]0'));
  assert.equal(excelDateText(45936, false, 'yyyy-mm-dd'), '2025-10-06');
  assert.equal(excelDateText(1, false, 'yyyy-mm-dd'), '1900-01-01');
  assert.equal(excelDateText(61, false, 'yyyy-mm-dd'), '1900-03-01');
  assert.equal(excelDateText(0, true, 'yyyy-mm-dd'), '1904-01-01');
  assert.equal(excelDateText(0.5, false, 'h:mm'), '12:00');
  assert.equal(excelDateText(45936.75, false, 'yyyy-mm-dd hh:mm:ss'), '2025-10-06 18:00:00');
});

test('damaged or foreign containers are refused with a reason', async () => {
  assert.throws(() => readCompoundFile(Buffer.alloc(600)), { code: 'BAD_FILE' });
  const temp = await fs.mkdtemp(path.join(path.resolve('temp'), 'legacy-test-'));
  await fs.writeFile(path.join(temp, 'fake.doc'), 'plain text pretending');
  assert.deepEqual((await readSourceOrExplain(temp, 'fake.doc')).error, { code: 'BAD_FILE', message: 'fake.doc could not be opened; it may be damaged.' });
  // An .xls renamed .doc is a valid container without a Word stream.
  await fs.copyFile(path.join(fixtures, 'trips.xls'), path.join(temp, 'wrong.doc'));
  assert.equal((await readSourceOrExplain(temp, 'wrong.doc')).error.code, 'BAD_FILE');
});
