import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import os from 'node:os';
import { LIMITS, modelKey } from '../shared/common/core.mjs';
import { validateJob } from '../shared/common/formats.mjs';
import { summary } from '../shared/common/summary.mjs';
import { StudioJobs } from '../shared/service/jobs.mjs';
import { createStudioServer } from '../shared/service/server.mjs';
import { OpenCodeGateway } from '../shared/service/opencode.mjs';

const source = await fs.readFile(new URL('../SPEC.md', import.meta.url), 'utf8');
const transportResult = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
// These transports exercise persistence and failure handling, not LLM quality.
const model = { providerID: 'unit-test', id: 'controlled-transport' };
const request = () => ({ id: randomUUID(), format: 'summary', source: { path: 'SPEC.md', content: source }, instructions: '', model });
async function directory() {
  const parent = path.resolve('temp');
  await fs.mkdir(parent, { recursive: true });
  return fs.mkdtemp(path.join(parent, 'summary-test-'));
}
async function completed(jobs, root, id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const record = await jobs.get(root, id);
    if (!['queued', 'running'].includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The controlled test transport did not settle.');
}

test('source validation rejects traversal and oversized input instead of truncating it', () => {
  const input = request();
  assert.equal(validateJob(input).source.content, source);
  for (const unsafe of ['../SPEC.md', '/SPEC.md', 'C:/SPEC.md', 'folder\\SPEC.md', 'SPEC.exe']) {
    assert.throws(() => validateJob({ ...input, source: { path: unsafe, content: source } }), { code: 'BAD_SOURCE' });
  }
  assert.throws(() => validateJob({ ...input, source: { path: 'SPEC.md', content: source.repeat(Math.ceil(LIMITS.source / source.length) + 1) } }), { code: 'SOURCE_TOO_LARGE' });
  assert.ok(summary.prompt(input).includes(JSON.stringify(source)));
  assert.notEqual(modelKey(model), modelKey({ ...model, variant: 'high' }));
});

test('completed summaries survive a new store instance and exports never overwrite files', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  await jobs.start(root, input, async () => ({ text: transportResult }));
  const record = await completed(jobs, root, input.id);
  assert.equal(record.status, 'completed');
  assert.equal(record.source.md5, createHash('md5').update(source).digest('hex'));
  const restored = await new StudioJobs().get(root, input.id);
  assert.equal(restored.markdown, transportResult.trim() + '\n');
  await jobs.save(root, input.id, 'summary.md');
  await assert.rejects(jobs.save(root, input.id, 'summary.md'), { code: 'FILE_EXISTS' });
  assert.equal(await fs.readFile(path.join(root, 'summary.md'), 'utf8'), restored.markdown);
  await assert.rejects(jobs.save(root, input.id, '../summary.md'), { code: 'BAD_FILENAME' });
});

test('duplicate request IDs do not repeat a billable generation', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  let calls = 0;
  const generate = async () => { calls += 1; return { text: transportResult }; };
  await jobs.start(root, input, generate);
  await completed(jobs, root, input.id);
  await jobs.start(root, input, generate);
  assert.equal(calls, 1);
  await assert.rejects(jobs.start(root, { ...input, instructions: 'Changed request' }, generate), { code: 'JOB_CONFLICT' });
});

test('cancellation aborts the transport and leaves a visible cancelled record', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let aborted = false;
  await jobs.start(root, input, (_prompt, _model, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('Controlled cancellation')); }, { once: true });
    started();
  }));
  await ready;
  const result = await jobs.cancel(root, input.id);
  assert.equal(result.status, 'cancelled');
  assert.equal(aborted, true);
  assert.equal((await jobs.get(root, input.id)).markdown, null);
});

test('provider failures cannot expose raw error bodies or credentials', async () => {
  const root = await directory();
  const jobs = new StudioJobs();
  const input = request();
  await jobs.start(root, input, async () => { throw new Error('unit-test-private-error-marker'); });
  const record = await completed(jobs, root, input.id);
  assert.equal(record.status, 'failed');
  assert.equal(record.error.code, 'MODEL_FAILED');
  assert.equal(JSON.stringify(jobs.public(record)).includes('unit-test-private-error-marker'), false);
  assert.equal((await jobs.list(root)).total, 1);
});

test('service health requires the host bearer and rejects malformed generation input', async (t) => {
  const token = randomUUID();
  const { server } = createStudioServer({ token, gateway: {} });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/health`)).status, 401);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const health = await fetch(`${origin}/health`, { headers });
  assert.equal((await health.json()).ok, true);
  const response = await fetch(`${origin}/jobs`, { method: 'POST', headers, body: JSON.stringify({ context: { directory: await directory() }, id: 'not-a-job' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'BAD_JOB');
});

test('model gateway refuses remote origins and protected hosts without a credential workaround', async () => {
  let calls = 0;
  const gateway = new OpenCodeGateway({ fetch: async () => { calls += 1; return new Response('', { status: 401 }); } });
  const context = { directory: await directory(), sessionId: 'ses_controlled_test', hostOrigin: 'http://192.0.2.1' };
  await assert.rejects(gateway.describe(context), { code: 'LOCAL_HOST_REQUIRED' });
  assert.equal(calls, 0);
  await assert.rejects(gateway.describe({ ...context, hostOrigin: 'http://127.0.0.1:1' }), { code: 'AUTH_REQUIRED' });
});

test('stateless generation advertises the base catalog and preserves the selected model', async () => {
  const root = await directory();
  const sessionId = 'ses_controlled_base_catalog';
  let catalogScope;
  let dispatched;
  const gateway = new OpenCodeGateway({ fetch: async (url, options) => {
    if (url.pathname === '/api/info') return Response.json({ version: '2.0.22' });
    if (url.pathname.startsWith('/api/session/')) return Response.json({ id: sessionId, location: { directory: root }, model });
    if (url.pathname === '/api/model') {
      catalogScope = decodeURIComponent(options.headers['x-opencode-directory']);
      return Response.json({ data: [{ ...model, name: 'Controlled transport', enabled: true, capabilities: { output: ['text'] } }] });
    }
    if (url.pathname === '/api/experimental/generate') {
      dispatched = JSON.parse(options.body);
      return Response.json({ data: { text: transportResult } });
    }
    throw new Error('Unexpected test route');
  } });
  const connection = await gateway.prepare({ directory: root, sessionId, hostOrigin: 'http://127.0.0.1:1' });
  assert.equal(catalogScope, path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'opencode'));
  assert.equal(connection.selectedModelKey, modelKey(model));
  const prompt = summary.prompt(validateJob(request()));
  assert.equal((await connection.generate(prompt, model, new AbortController().signal)).text, transportResult);
  assert.deepEqual(dispatched, { prompt, model });
});
