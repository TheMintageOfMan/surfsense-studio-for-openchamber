import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { LIMITS, modelKey, requireJobId, StudioError } from '../common/core.mjs';
import { validateJob } from '../common/formats.mjs';
import { StudioJobs } from './jobs.mjs';
import { projectDirectory } from './storage.mjs';

function authorized(header, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(typeof header === 'string' ? header : '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 512_000) throw new StudioError('REQUEST_TOO_LARGE', 'Request body exceeds the limit.', 413);
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length > LIMITS.request) throw new StudioError('REQUEST_TOO_LARGE', 'Request body exceeds the host bridge limit.', 413);
  try { return JSON.parse(text); }
  catch { throw new StudioError('BAD_JSON', 'Expected a JSON request.'); }
}

const json = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

export function createStudioServer({ token, gateway, jobs = new StudioJobs() }) {
  const server = http.createServer(async (request, response) => {
    if (!authorized(request.headers.authorization, token)) {
      json(response, 401, { error: { code: 'UNAUTHORIZED', message: 'Use the approved OpenChamber service bridge.' } });
      return;
    }
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { ok: true, version: '0.2.0', runtime: process.version, platform: process.platform, arch: process.arch });
        return;
      }
      const body = request.method === 'POST' ? await readBody(request) : null;
      const context = body?.context ?? Object.fromEntries(url.searchParams);
      const directory = await projectDirectory(context.directory);
      context.directory = directory;
      if (request.method === 'GET' && url.pathname === '/connection') {
        json(response, 200, await gateway.describe(context));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/jobs') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new StudioError('BAD_OFFSET', 'Invalid history page.');
        json(response, 200, await jobs.list(directory, offset));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/jobs') {
        const input = validateJob(body);
        const connection = await gateway.prepare(context);
        if (!connection.models.some((model) => model.key === modelKey(input.model))) {
          throw new StudioError('NO_MODEL', 'This model is no longer available. Refresh the connection and select a model.');
        }
        // The recommended model doubles as the quiet fallback when the chosen one keeps failing.
        const fallback = connection.models.find((model) => model.key === connection.recommendedModelKey)?.ref ?? null;
        const record = await jobs.start(directory, input, connection.generate, { fallback });
        json(response, 202, jobs.public(record));
        return;
      }
      const match = url.pathname.match(/^\/jobs\/([^/]+)(?:\/(cancel|save|progress))?$/);
      if (match) {
        const id = requireJobId(match[1]);
        if (request.method === 'GET' && !match[2]) {
          json(response, 200, jobs.public(await jobs.get(directory, id)));
          return;
        }
        if (request.method === 'POST' && match[2] === 'cancel') {
          json(response, 200, await jobs.cancel(directory, id));
          return;
        }
        if (request.method === 'POST' && match[2] === 'save') {
          json(response, 200, await jobs.save(directory, id, body.filename ?? null));
          return;
        }
        if (request.method === 'POST' && match[2] === 'progress') {
          json(response, 200, await jobs.saveProgress(directory, id, body.progress));
          return;
        }
      }
      throw new StudioError('NOT_FOUND', 'Unknown Studio operation.', 404);
    } catch (error) {
      const known = error instanceof StudioError;
      json(response, known ? error.status : 500, { error: {
        code: known ? error.code : 'STUDIO_FAILED',
        message: known ? error.message : 'Studio could not complete the operation. Check that the project is writable, then retry explicitly.',
      } });
    }
  });
  return { server, jobs };
}
