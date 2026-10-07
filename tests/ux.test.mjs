import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateJob } from '../shared/common/formats.mjs';
import { quiz } from '../shared/common/quiz.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';
import { recommendModel } from '../shared/service/opencode.mjs';
import { friendlyName } from '../shared/service/storage.mjs';
import { modelKey } from '../shared/common/core.mjs';

// Controlled transports: these check the quiet-recovery rules, not model quality.
const chosen = { providerID: 'unit-test', id: 'chosen' };
const fallback = { providerID: 'unit-test', id: 'fallback' };
const reply = JSON.stringify({ title: 'Quiz', questions: [{ question: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'E.' }] });
const request = (extra = {}) => ({ id: randomUUID(), format: 'quiz', sources: [{ path: 'a.md', content: 'Alpha.' }, { path: 'notes/b.txt', content: 'Beta.' }], model: chosen, ...extra });

async function settle(jobs, root, id) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The controlled test transport did not settle.');
}
const directory = async () => { await fs.mkdir('temp', { recursive: true }); return fs.mkdtemp(path.join(path.resolve('temp'), 'ux-test-')); };

test('several sources, a choice and focus all reach the prompt; bad choices are refused', () => {
  const input = validateJob(request({ choice: 'hard', instructions: 'planets' }));
  const prompt = quiz.prompt(input);
  for (const text of ['"name":"a"', '"name":"b"', 'Alpha.', 'Beta.', '"focus":"planets"', 'Difficulty: hard']) assert.ok(prompt.includes(text), text);
  assert.equal(validateJob(request()).choice, 'medium');
  assert.throws(() => validateJob(request({ choice: 'impossible' })), { code: 'BAD_CHOICE' });
  assert.throws(() => validateJob(request({ sources: [{ path: 'a.md', content: 'x' }, { path: 'a.md', content: 'y' }] })), { code: 'BAD_SOURCE' });
});

test('a failing model is retried once, then the fallback finishes the job, and every try is recorded', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  const calls = [];
  await jobs.start(root, input, async (_prompt, model) => {
    calls.push(model.id);
    return { text: model.id === 'fallback' ? reply : 'not json' };
  }, { fallback });
  const record = await settle(jobs, root, input.id);
  assert.equal(record.status, 'completed');
  assert.deepEqual(calls, ['chosen', 'chosen', 'fallback']);
  assert.deepEqual(record.attempts.map((attempt) => attempt.outcome), ['BAD_OUTPUT', 'BAD_OUTPUT', 'completed']);
  assert.deepEqual(record.model, fallback);
  assert.deepEqual(record.requestedModel, chosen);
  assert.deepEqual(record.sources.map((source) => source.path), ['a.md', 'notes/b.txt']);
});

test('recovery stops after three calls and a rejected model skips straight to the fallback', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const failing = request();
  let calls = 0;
  await jobs.start(root, failing, async () => { calls += 1; return { text: '' }; }, { fallback });
  assert.equal((await settle(jobs, root, failing.id)).error.code, 'EMPTY_RESULT');
  assert.equal(calls, 3);

  const { StudioError } = await import('../shared/common/core.mjs');
  const rejected = request();
  const seen = [];
  await jobs.start(root, rejected, async (_prompt, model) => {
    seen.push(model.id);
    if (model.id === 'chosen') throw new StudioError('MODEL_CONFIGURATION_REJECTED', 'Rejected.');
    return { text: reply };
  }, { fallback });
  assert.equal((await settle(jobs, root, rejected.id)).status, 'completed');
  assert.deepEqual(seen, ['chosen', 'fallback']);
});

test('saving picks a friendly unused name and never overwrites', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  await jobs.start(root, input, async () => ({ text: reply.replace('"Quiz"', '"Planets: a quiz?"') }));
  await settle(jobs, root, input.id);
  assert.equal((await jobs.save(root, input.id)).savedPath, 'Planets a quiz.md');
  assert.equal((await jobs.save(root, input.id)).savedPath, 'Planets a quiz (2).md');
  assert.equal(friendlyName('CON'), 'Studio CON');
  assert.equal(friendlyName('...report. '), 'report');
});

test('the recommended model prefers a known-good model without a variant', () => {
  const entry = (providerID, id, variant) => {
    const ref = { providerID, id, ...(variant ? { variant } : {}) };
    return { key: modelKey(ref), ref };
  };
  const astra = entry('amazon-bedrock', 'us.openai.gpt-6-astra-ultrafast');
  const opus = entry('amazon-bedrock', 'claude', 'max');
  const opusPlain = entry('amazon-bedrock', 'claude');
  assert.equal(recommendModel([opus, opusPlain, astra], opus.key), astra.key);
  assert.equal(recommendModel([opus, opusPlain], opus.key), opusPlain.key);
});
