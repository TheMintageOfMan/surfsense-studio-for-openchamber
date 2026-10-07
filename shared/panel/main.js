import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountSelect, mountTextField } from '@openchamber/sdk/ui';
import { LIMITS, validSourcePath } from '../common/core.mjs';
import { FORMATS, IMPLEMENTED, formatFor, labelFor, validateJob } from '../common/formats.mjs';
import { renderViewer } from './viewers/index.js';

const host = connectHost();
const element = (id) => document.getElementById(id);
const state = {
  context: null, epoch: 0, ready: false, models: [], model: null, format: 'summary',
  path: '', source: null, instructions: '', active: null, record: null,
  rows: [], next: null, filename: '', timer: null, submitting: false, viewer: null,
};
const progressQueue = { pending: null, running: false };
let mounted = false;
const controls = {};

function status(text, error = false) {
  element('status').textContent = text;
  element('status').dataset.error = String(error);
}

const message = (error) => error?.message || 'Studio could not complete this operation.';
const modelLabel = (model) => `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ''}`;

function contextQuery(context = state.context) {
  return new URLSearchParams({
    directory: context?.directory ?? '', sessionId: context?.sessionId ?? '', hostOrigin: context?.hostOrigin ?? '',
  }).toString();
}

async function rpc(method, path, body) {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  if (encoded && encoded.length > LIMITS.request) throw new Error('The encoded request exceeds the host bridge limit. Nothing was truncated.');
  const response = await host.serviceRequest({ method, path, ...(encoded ? { body: encoded } : {}) });
  let data;
  try { data = JSON.parse(response.body); }
  catch { throw new Error('Studio returned an unreadable response. No request was automatically repeated.'); }
  if (response.status >= 400) {
    const error = new Error(data.error?.message || 'Studio rejected the request.');
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

function mountFormats() {
  element('formats').replaceChildren(...FORMATS.map((format) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'format-tile';
    tile.textContent = format.label;
    tile.dataset.format = format.key;
    if (!format.implemented) {
      // aria-disabled keeps the tile focusable so its reason stays discoverable.
      tile.setAttribute('aria-disabled', 'true');
      tile.title = format.reason;
    }
    tile.addEventListener('click', () => {
      if (!format.implemented) {
        element('format-hint').textContent = `${format.label}: ${format.reason}`;
        return;
      }
      state.format = format.key;
      element('format-hint').textContent = '';
      paintFormats();
      updateControls();
    });
    return tile;
  }));
  paintFormats();
}

function paintFormats() {
  for (const tile of element('formats').children) tile.setAttribute('aria-pressed', String(tile.dataset.format === state.format));
}

function updateControls() {
  const busy = state.submitting || Boolean(state.active);
  controls.generate.update({
    label: `Generate ${formatFor(state.format).noun}`,
    disabled: !state.ready || !state.model || !state.source || busy, loading: state.submitting,
  });
  controls.cancel.update({ disabled: !state.active?.canCancel });
  controls.load.update({ disabled: !state.context?.directory || !validSourcePath(state.path) || busy });
  controls.path.update({ disabled: busy });
  controls.files.update({ disabled: busy });
  controls.instructions.update({ disabled: busy });
  controls.model.update({ disabled: !state.ready || busy });
  controls.save.update({ disabled: state.record?.status !== 'completed' || !state.filename });
}

async function refreshFiles(epoch) {
  try {
    const { entries } = await host.listDir('.');
    if (epoch !== state.epoch) return;
    controls.files.update({
      options: entries.filter((file) => file.kind === 'file' && /\.(md|txt)$/i.test(file.name))
        .map((file) => ({ id: file.name, label: file.name })), value: null,
    });
  } catch (error) {
    if (epoch === state.epoch) status(message(error), true);
  }
}

async function refreshConnection() {
  const epoch = state.epoch;
  const context = state.context;
  state.ready = false;
  updateControls();
  if (!context?.directory) {
    element('connection').textContent = 'Open a project to use Studio.';
    return;
  }
  element('connection').textContent = 'Checking the OpenCode connection...';
  try {
    const result = await rpc('GET', `/connection?${contextQuery(context)}`);
    if (epoch !== state.epoch) return;
    state.models = result.models;
    const previousKey = state.model?.key;
    state.model = result.models.find((model) => model.key === previousKey)
      ?? result.models.find((model) => model.key === result.selectedModelKey) ?? null;
    controls.model.update({ options: result.models.map((model) => ({ id: model.key, label: model.label })), value: state.model?.key ?? null });
    state.ready = true;
    element('connection').textContent = `OpenCode ${result.version} | ${result.endpoint} | ${result.modelScope}`;
    if (!result.models.length) status('No enabled text models are available in this connection.', true);
  } catch (error) {
    if (epoch !== state.epoch) return;
    element('connection').textContent = message(error);
  }
  updateControls();
}

async function loadSource() {
  const epoch = state.epoch;
  const path = state.path;
  state.source = null;
  element('coverage').textContent = 'Reading selected source...';
  updateControls();
  try {
    const { content } = await host.readFile(path);
    if (epoch !== state.epoch || state.path !== path) return;
    if (!content.trim()) throw new Error('The selected source is empty.');
    if (content.includes('\0')) throw new Error('The selected file is not plain text.');
    if (content.length > LIMITS.source) throw new Error(`Source has ${content.length.toLocaleString()} characters; this build accepts ${LIMITS.source.toLocaleString()}. Nothing was truncated.`);
    state.source = { path, content };
    element('coverage').textContent = `1/1 source loaded in full: ${content.length.toLocaleString()} characters.`;
    status('Source ready. Choose a format, review the model, then generate.');
  } catch (error) {
    if (epoch !== state.epoch) return;
    element('coverage').textContent = message(error);
    status(message(error), true);
  }
  updateControls();
}

// Progress is full state, so only the newest pending snapshot needs sending.
function queueProgress(recordId, value) {
  progressQueue.pending = { recordId, value, context: { ...state.context }, epoch: state.epoch };
  if (!progressQueue.running) void flushProgress();
}

async function flushProgress() {
  progressQueue.running = true;
  while (progressQueue.pending) {
    const next = progressQueue.pending;
    progressQueue.pending = null;
    try {
      await rpc('POST', `/jobs/${next.recordId}/progress`, { context: next.context, progress: next.value });
    } catch (error) {
      if (next.epoch === state.epoch) status(`Progress was not saved: ${message(error)}`, true);
    }
  }
  progressQueue.running = false;
}

function showRecord(record) {
  state.viewer?.dispose();
  state.viewer = null;
  state.record = record;
  const complete = record.status === 'completed';
  element('result-section').hidden = !complete;
  if (complete) {
    const format = formatFor(record.format);
    element('result-heading').textContent = `${format.label}: ${record.title ?? format.label}`;
    element('result-meta').textContent = `${record.source.path} | ${modelLabel(record.model)}`;
    const notes = record.notes ?? [];
    element('notes').replaceChildren(...notes.map((note) => Object.assign(document.createElement('li'), { textContent: note })));
    element('notes').hidden = !notes.length;
    state.viewer = renderViewer(element('preview'), record, {
      host, status, saveProgress: (value) => queueProgress(record.id, value),
    });
    state.filename = `${record.format}-${record.id}.${format.extension}`;
    controls.filename.update({ value: state.filename, helper: `A new .${format.extension} file in the project root. Existing files are never overwritten.` });
    controls.save.update({ label: `Export .${format.extension}` });
    element('save-status').textContent = record.savedPath ? `Exported to ${record.savedPath}` : 'Stored in this project\'s Studio history.';
  }
  if (record.error) status(record.error.message, true);
  else status(complete ? `${labelFor(record.format)} completed. Source coverage: 1/1 supplied in full.` : `${labelFor(record.format)} ${record.status}.`);
  updateControls();
}

async function openRecord(id) {
  const epoch = state.epoch;
  try {
    const record = await rpc('GET', `/jobs/${id}?${contextQuery()}`);
    if (epoch !== state.epoch) return;
    controls.history.update({ value: id });
    showRecord(record);
  } catch (error) { if (epoch === state.epoch) status(message(error), true); }
}

async function refreshHistory(append = false) {
  const epoch = state.epoch;
  if (!state.context?.directory) return;
  try {
    const offset = append ? state.next : 0;
    const result = await rpc('GET', `/jobs?${contextQuery()}&offset=${offset ?? 0}`);
    if (epoch !== state.epoch) return;
    state.rows = append ? [...state.rows, ...result.jobs] : result.jobs;
    state.next = result.next;
    controls.history.update({
      options: state.rows.map((row) => ({
        id: row.id, label: `${labelFor(row.format)} - ${new Date(row.createdAt).toLocaleString()} - ${row.source.path}`, hint: row.status,
      })),
      value: state.record?.id ?? null,
    });
    element('history-count').textContent = `${state.rows.length} of ${result.total} artifacts shown.`;
    controls.more.update({ disabled: result.next === null });
    if (!state.active) {
      const active = result.jobs.find((job) => job.canCancel);
      if (active) { state.active = active; schedulePoll(); }
    }
    updateControls();
  } catch (error) { if (epoch === state.epoch) status(message(error), true); }
}

function schedulePoll() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { void poll(); }, 1200);
}

async function poll() {
  const epoch = state.epoch;
  const active = state.active;
  if (!active) return;
  try {
    const result = await rpc('GET', `/jobs/${active.id}?${contextQuery()}`);
    if (epoch !== state.epoch) return;
    const running = ['queued', 'running'].includes(result.status);
    state.active = running ? result : null;
    if (!state.record || state.record.id === result.id) showRecord(result);
    if (running) schedulePoll();
    else await refreshHistory();
  } catch (error) {
    if (epoch !== state.epoch) return;
    // A lost response is not permission to resubmit a billable model call.
    state.active = null;
    status(`${message(error)} Refresh history before retrying generation.`, true);
  }
  updateControls();
}

async function generate() {
  const epoch = state.epoch;
  const context = { ...state.context };
  const format = formatFor(state.format);
  const input = {
    id: crypto.randomUUID(), format: format.key, context, source: state.source,
    instructions: state.instructions, model: state.model?.ref,
  };
  try { validateJob(input); } catch (error) { status(message(error), true); return; }
  state.submitting = true;
  state.viewer?.dispose();
  state.viewer = null;
  state.record = null;
  element('result-section').hidden = true;
  status(`Submitting ${format.noun}...`);
  updateControls();
  try {
    const created = await rpc('POST', '/jobs', input);
    if (epoch !== state.epoch) return;
    state.active = created;
    showRecord(state.active);
    await refreshHistory();
    schedulePoll();
  } catch (error) {
    if (epoch !== state.epoch) return;
    status(`${message(error)} Checking history; the request will not be automatically resubmitted.`, true);
    await refreshHistory();
  } finally {
    if (epoch === state.epoch) { state.submitting = false; updateControls(); }
  }
}

async function cancel() {
  const active = state.active;
  const epoch = state.epoch;
  if (!active) return;
  try {
    const result = await rpc('POST', `/jobs/${active.id}/cancel`, { context: state.context });
    if (epoch !== state.epoch) return;
    state.active = null;
    clearTimeout(state.timer);
    showRecord(result);
    await refreshHistory();
  } catch (error) { if (epoch === state.epoch) status(message(error), true); }
  updateControls();
}

async function save() {
  const epoch = state.epoch;
  if (!state.record) return;
  const recordId = state.record.id;
  try {
    const result = await rpc('POST', `/jobs/${recordId}/save`, { context: state.context, filename: state.filename });
    if (epoch !== state.epoch || state.record?.id !== recordId) return;
    element('save-status').textContent = `Saved ${result.savedPath} in ${state.context.directory}. Open it through OpenChamber's Files view.`;
    await refreshHistory();
  } catch (error) { if (epoch === state.epoch) element('save-status').textContent = message(error); }
}

function mount() {
  element('build-label').textContent = `Development build - ${IMPLEMENTED.length} of ${FORMATS.length} formats`;
  mountFormats();
  controls.refresh = mountButton(element('refresh'), { label: 'Refresh connection and history', variant: 'secondary', size: 'sm', onClick: () => { void refreshConnection(); void refreshHistory(); } });
  controls.model = mountSelect(element('model'), { label: 'Generation model', options: [], value: null, searchable: true, disabled: true, onChange: (key) => {
    state.model = state.models.find((model) => model.key === key) ?? null;
    controls.model.update({ value: state.model?.key ?? null }); updateControls();
  } });
  const setPath = (value) => {
    state.path = value; state.source = null;
    controls.path.update({ value }); controls.files.update({ value });
    element('coverage').textContent = 'Load the selected source before generating.';
    updateControls();
  };
  controls.files = mountSelect(element('files'), { label: 'Files in the project root', options: [], value: null, searchable: true, onChange: setPath });
  controls.path = mountTextField(element('source-path'), { label: 'Source path', value: '', helper: 'For a nested file, enter its project-relative .md or .txt path using forward slashes.', onChange: setPath });
  controls.load = mountButton(element('load'), { label: 'Load source', variant: 'secondary', onClick: () => { void loadSource(); } });
  controls.instructions = mountTextField(element('instructions'), { label: 'Focus (optional)', value: '', multiline: true, rows: 3, onChange: (value) => {
    state.instructions = value;
    controls.instructions.update({ value, error: value.length > LIMITS.instructions ? `Maximum ${LIMITS.instructions} characters.` : undefined });
  } });
  controls.generate = mountButton(element('generate'), { label: 'Generate summary', disabled: true, onClick: () => { void generate(); } });
  controls.cancel = mountButton(element('cancel'), { label: 'Cancel', variant: 'outline', disabled: true, onClick: () => { void cancel(); } });
  controls.history = mountSelect(element('history'), { label: 'Studio history', options: [], value: null, onChange: (id) => { void openRecord(id); } });
  controls.more = mountButton(element('more'), { label: 'Load more', variant: 'ghost', size: 'sm', disabled: true, onClick: () => { void refreshHistory(true); } });
  controls.filename = mountTextField(element('filename'), { label: 'Export filename', value: '', helper: 'A new file in the project root. Existing files are never overwritten.', onChange: (value) => {
    state.filename = value; controls.filename.update({ value }); updateControls();
  } });
  controls.save = mountButton(element('save'), { label: 'Export', disabled: true, onClick: () => { void save(); } });
}

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (!mounted) { mount(); mounted = true; }
  const next = { directory: ctx.directory, sessionId: ctx.session?.id ?? '', hostOrigin: new URL(window.location.href).origin };
  if (state.context?.directory === next.directory && state.context?.sessionId === next.sessionId) return;
  clearTimeout(state.timer);
  state.viewer?.dispose();
  state.context = next; state.epoch += 1;
  state.ready = false; state.model = null; state.models = []; state.source = null; state.path = '';
  state.active = null; state.record = null; state.viewer = null; state.rows = []; state.next = null; state.submitting = false;
  controls.path.update({ value: '' }); controls.files.update({ options: [], value: null });
  controls.model.update({ options: [], value: null }); controls.history.update({ options: [], value: null });
  element('project').textContent = next.directory || 'No project selected';
  element('coverage').textContent = 'No source loaded.'; element('result-section').hidden = true;
  element('history-count').textContent = ''; status(''); updateControls();
  if (next.directory) { void refreshFiles(state.epoch); void refreshHistory(); }
  void refreshConnection();
});

window.addEventListener('pagehide', () => {
  clearTimeout(state.timer);
  state.viewer?.dispose();
  for (const control of Object.values(controls)) control.dispose();
  host.dispose();
});
