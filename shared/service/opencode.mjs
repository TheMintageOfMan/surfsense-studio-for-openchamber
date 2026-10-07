import { modelKey, StudioError } from '../common/core.mjs';
import { projectDirectory } from './storage.mjs';
import os from 'node:os';
import path from 'node:path';

function localOrigin(value) {
  let url;
  try { url = new URL(value); } catch { /* The same actionable error handles malformed origins. */ }
  if (!url || !['http:', 'https:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new StudioError('LOCAL_HOST_REQUIRED', 'This first pass supports a local OpenChamber desktop origin only. Remote and protected hosts need an authenticated extension broker.');
  }
  return url.origin;
}

const unpack = (value) => value?.data ?? value;

// Models that produced every Studio format live on this build's reference host. When one is
// available it is the default; otherwise the session's own model is. Variants are avoided:
// a reasoning variant returned empty text through the stateless route.
const KNOWN_GOOD = [
  ['amazon-bedrock', 'us.openai.gpt-6-astra-ultrafast'], ['amazon-bedrock', 'global.openai.gpt-6-astra-ultrafast'],
  ['amazon-bedrock', 'openai.gpt-6-astra-ultrafast'],
];
export function recommendModel(models, selectedKey) {
  for (const [providerID, id] of KNOWN_GOOD) {
    const match = models.find((model) => model.ref.providerID === providerID && model.ref.id === id && !model.ref.variant);
    if (match) return match.key;
  }
  const selected = models.find((model) => model.key === selectedKey);
  const plain = selected && models.find((model) => model.ref.providerID === selected.ref.providerID && model.ref.id === selected.ref.id && !model.ref.variant);
  return (plain ?? selected ?? models[0])?.key ?? null;
}
const sameDirectory = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

export class OpenCodeGateway {
  constructor({ fetch: transport = globalThis.fetch } = {}) {
    this.fetch = transport;
  }

  async prepare(context) {
    const origin = localOrigin(context.hostOrigin);
    if (typeof context.sessionId !== 'string' || !/^ses[A-Za-z0-9_-]{1,196}$/.test(context.sessionId)) {
      throw new StudioError('SESSION_REQUIRED', 'Open a session in this project so Studio can verify the selected OpenCode instance.');
    }
    const directory = await projectDirectory(context.directory);
    const headers = { 'x-opencode-directory': encodeURIComponent(directory) };
    const baseDirectory = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'opencode');
    const call = async (route, { body, signal, generation = false, baseConfiguration = false } = {}) => {
      let response;
      try {
        response = await this.fetch(new URL(route, origin), {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            ...headers,
            ...(baseConfiguration ? { 'x-opencode-directory': encodeURIComponent(baseDirectory) } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: 'error',
          signal: signal ?? AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new StudioError('CONNECTION_FAILED', 'The selected local OpenChamber API could not be reached. No other server was tried.', 502);
      }
      if (response.status === 401 || response.status === 403) {
        throw new StudioError('AUTH_REQUIRED', 'This host requires authentication that its extension service cannot inherit. This build will not bypass it or switch to the Small Model.', 403);
      }
      if (!response.ok) {
        if (generation && response.status === 400) {
          const failure = await response.json().catch(() => null);
          const text = typeof failure?.message === 'string' ? failure.message : '';
          // Classify known selection failures without exposing provider error bodies.
          const reason = /model unavailable/i.test(text) ? 'The model is unavailable to OpenCode base-configuration generation.'
            : /variant/i.test(text) ? 'OpenCode rejected this model variant for stateless generation.'
            : /package|initializ|configur|environment|variable/i.test(text) ? 'OpenCode could not initialize this model for stateless generation.'
            : 'OpenCode rejected the stateless generation request.';
          throw new StudioError('MODEL_CONFIGURATION_REJECTED', `${reason} No fallback model was used.`, 400);
        }
        throw new StudioError(generation ? 'MODEL_FAILED' : 'CONNECTION_FAILED',
          generation ? `The chosen OpenCode model request failed (HTTP ${response.status}). Check its connection in OpenChamber.`
            : `Could not verify this OpenCode connection (HTTP ${response.status}). Open a session in the selected project.`, 502);
      }
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new StudioError('UNSUPPORTED_CONNECTION', 'The host did not return the expected OpenCode v2 API response.', 502);
      }
      try { return await response.json(); }
      catch { throw new StudioError('BAD_RESPONSE', 'OpenCode returned an unreadable response.', 502); }
    };
    // Use the origin of our actual guest frame, not a guessed port or the unrelated CLI service.
    // This adapter is deliberately limited to a local proxy that accepts the request as configured.
    // The v2 stateless handler runs in the server's base config, regardless of a
    // project header. Load that catalog, not a project-only model/override.
    const [infoPayload, sessionPayload, catalog] = await Promise.all([
      call('/api/info'), call(`/api/session/${encodeURIComponent(context.sessionId)}`),
      call('/api/model', { baseConfiguration: true }),
    ]);
    const info = unpack(infoPayload);
    const session = unpack(sessionPayload);
    if (typeof info?.version !== 'string' || !info.version.startsWith('2.') || session?.id !== context.sessionId) {
      throw new StudioError('WRONG_SERVER', 'Studio could not match the active session to an OpenCode v2 server. No model call was made.');
    }
    const sessionDirectory = await projectDirectory(session.location?.directory);
    if (!sameDirectory(directory, sessionDirectory)) {
      throw new StudioError('WRONG_DIRECTORY', 'The active session belongs to another directory. Select its matching project or worktree.');
    }
    const entries = unpack(catalog);
    if (!Array.isArray(entries)) throw new StudioError('BAD_CATALOG', 'OpenCode returned an unreadable model catalog.');
    const textModels = entries.filter((entry) => entry.enabled && entry.capabilities?.output?.includes('text'));
    const models = textModels.map((entry) => {
      const ref = { providerID: entry.providerID, id: entry.id };
      return { key: modelKey(ref), label: `${entry.name} (${entry.providerID})`, ref };
    });
    let selected = session.model;
    if (!selected) {
      const fallback = unpack(await call('/api/model/default', { baseConfiguration: true }));
      if (fallback) selected = { providerID: fallback.providerID, id: fallback.id };
    }
    if (selected?.variant) {
      const base = textModels.find((entry) => entry.providerID === selected.providerID && entry.id === selected.id);
      if (base) models.unshift({ key: modelKey(selected), label: `${base.name} (${selected.variant}; ${base.providerID})`, ref: selected });
    }
    if (!models.length) throw new StudioError('NO_MODEL', 'No enabled text models are available on the verified OpenCode instance.');
    return {
      endpoint: origin, version: info.version, directory, models, modelScope: 'OpenCode base configuration',
      selectedModelKey: selected ? modelKey(selected) : null,
      recommendedModelKey: recommendModel(models, selected ? modelKey(selected) : null),
      generate: async (prompt, model, signal) => {
        // Public v2 one-shot generation: no session prompt, agent tools, or transcript mutation.
        const output = unpack(await call('/api/experimental/generate', { body: { prompt, model }, signal, generation: true }));
        return { text: output?.text };
      },
    };
  }

  async describe(context) {
    const { generate, ...publicConnection } = await this.prepare(context);
    return publicConnection;
  }
}
