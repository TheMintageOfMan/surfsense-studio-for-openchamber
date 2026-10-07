// Studio panel: pick sources, tap a tile, open what was made. Defaults are chosen for the
// user; problems are retried quietly by the service and only reach the user as plain words.
import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { LIMITS } from '../common/core.mjs';
import { CHOICES, FORMATS, defaultChoice } from '../common/formats.mjs';
import { ICONS, NOUNS, TILES } from './icons.js';
import { renderViewer } from './viewers/index.js';

const host = connectHost();
const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const icon = (name, className = 'icon') => {
  const span = make('span', className);
  span.innerHTML = ICONS[name]; // Trusted constant markup from icons.js only.
  return span;
};

const SOURCE_TYPES = /\.(md|txt)$/i;
// Legal and package boilerplate is rarely what someone wants to study.
const BOILERPLATE = /^(license|licence|copying|notice|third-party|changelog|code_of_conduct)|-license\.txt$/i;
const SKIP_FOLDERS = new Set(['node_modules', '.git', '.studio', 'temp', 'dist', 'build']);
const MAX_FILES = 60;
const state = {
  context: null, epoch: 0, connection: null, connecting: null, retryDelay: 2000, retryTimer: null,
  modelPref: 'auto', files: [], selected: new Set(), rows: [], next: null, active: new Map(), pollTimer: null,
  viewer: null, customizing: null, snackTimer: null,
};

// ---------- small helpers ----------

const query = () => new URLSearchParams({
  directory: state.context?.directory ?? '', sessionId: state.context?.sessionId ?? '', hostOrigin: state.context?.hostOrigin ?? '',
}).toString();

async function rpc(method, path, body) {
  const response = await host.serviceRequest({ method, path, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data;
  try { data = JSON.parse(response.body); } catch { data = {}; }
  if (response.status >= 400) {
    const error = new Error(data.error?.message || 'Studio could not complete this.');
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

const storageKey = (name) => `${name}:${state.context?.directory ?? ''}`.slice(0, 128);
async function remember(name, value) { try { await host.storage.set(storageKey(name), value); } catch { /* Preferences are a convenience only. */ } }
async function recall(name) { try { return await host.storage.get(storageKey(name)); } catch { return undefined; } }

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
const sourcesLabel = (count) => `${count} source${count === 1 ? '' : 's'}`;
const modelName = (ref) => state.connection?.models.find((model) => model.ref.providerID === ref?.providerID && model.ref.id === ref?.id)?.label
  ?? (ref ? `${ref.providerID}/${ref.id}` : 'unknown');

function snack(text, action) {
  clearTimeout(state.snackTimer);
  $('snackbar-text').textContent = text;
  const button = $('snackbar-action');
  button.hidden = !action;
  if (action) { button.textContent = action.label; button.onclick = () => { $('snackbar').hidden = true; action.run(); }; }
  $('snackbar').hidden = false;
  state.snackTimer = setTimeout(() => { $('snackbar').hidden = true; }, action ? 8000 : 4500);
}

function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text ?? '';
}

// ---------- connection (quiet, self-retrying) ----------

function chosenModel() {
  const models = state.connection?.models ?? [];
  const key = state.modelPref !== 'auto' && models.some((model) => model.key === state.modelPref)
    ? state.modelPref : state.connection?.recommendedModelKey;
  return models.find((model) => model.key === key) ?? models[0] ?? null;
}

function connect() {
  if (state.connecting) return state.connecting;
  const epoch = state.epoch;
  clearTimeout(state.retryTimer);
  state.connecting = (async () => {
    try {
      const result = await rpc('GET', `/connection?${query()}`);
      if (epoch !== state.epoch) return null;
      state.connection = result;
      state.retryDelay = 2000;
      notice(result.models.length ? null : 'No AI model is turned on in OpenChamber yet. Add one in OpenChamber settings.');
      paintSettings();
      return result;
    } catch (error) {
      if (epoch !== state.epoch) return null;
      // A missing chat is the one thing the user must do; everything else is retried quietly.
      if (['SESSION_REQUIRED', 'WRONG_DIRECTORY', 'WRONG_SERVER'].includes(error.code)) notice('Open a chat in this project to use Studio.');
      else if (['LOCAL_HOST_REQUIRED', 'AUTH_REQUIRED'].includes(error.code)) notice('Studio works with OpenChamber on this computer only.');
      state.retryTimer = setTimeout(() => { void connect(); }, state.retryDelay);
      state.retryDelay = Math.min(state.retryDelay * 2, 30_000);
      return null;
    } finally {
      state.connecting = null;
    }
  })();
  return state.connecting;
}

// ---------- sources ----------

async function scan(epoch) {
  const found = [];
  const walk = async (folder, depth) => {
    let entries;
    try { ({ entries } = await host.listDir(folder || '.')); } catch { return; }
    if (epoch !== state.epoch) return;
    const files = entries.filter((entry) => entry.kind === 'file' && SOURCE_TYPES.test(entry.name) && !BOILERPLATE.test(entry.name));
    for (const entry of files) if (found.length < MAX_FILES) found.push({ path: folder ? `${folder}/${entry.name}` : entry.name, name: entry.name, folder });
    if (depth >= 2) return;
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      if (entry.kind === 'directory' && !entry.name.startsWith('.') && !SKIP_FOLDERS.has(entry.name)) await walk(folder ? `${folder}/${entry.name}` : entry.name, depth + 1);
    }
  };
  await walk('', 0);
  // Byte size is an upper bound on characters, so the budget check never under-counts.
  // Near the limit, read the file for an exact count so non-ASCII text is not shut out.
  await Promise.all(found.map(async (file) => {
    try {
      file.size = (await host.stat(file.path)).size;
      if (file.size > LIMITS.source && file.size <= LIMITS.source * 4) file.size = (await host.readFile(file.path)).content.length;
    } catch { file.size = 0; }
  }));
  return found.filter((file) => file.size > 0);
}

const selectedSize = () => state.files.filter((file) => state.selected.has(file.path)).reduce((sum, file) => sum + file.size, 0);

async function loadSources() {
  const epoch = state.epoch;
  $('source-hint').textContent = 'Looking for files...';
  const files = await scan(epoch);
  if (epoch !== state.epoch) return;
  state.files = files;
  const saved = await recall('sources');
  state.selected = new Set();
  const remembered = Array.isArray(saved) ? files.filter((file) => saved.includes(file.path)) : [];
  // A remembered choice wins. Otherwise: every top-level file if they fit together, else the
  // biggest top-level file that fits on its own (most material), else the first file that fits.
  const top = files.filter((file) => !file.folder);
  const fits = (list) => list.length <= LIMITS.sources && list.reduce((sum, file) => sum + file.size, 0) <= LIMITS.source;
  const pick = remembered.length && fits(remembered) ? remembered
    : top.length && fits(top) ? top
      : [[...top].sort((a, b) => b.size - a.size).find((file) => file.size <= LIMITS.source) ?? files.find((file) => file.size <= LIMITS.source)].filter(Boolean);
  for (const file of pick) state.selected.add(file.path);
  paintSources();
}

function paintSources(message) {
  const list = $('source-list');
  list.replaceChildren(...state.files.map((file) => {
    const row = make('li');
    const label = make('label', 'check-row');
    const box = make('input');
    box.type = 'checkbox';
    box.checked = state.selected.has(file.path);
    box.addEventListener('change', () => toggleSource(file, box));
    const text = make('span', 'source-name');
    text.append(icon('file', 'icon small'), make('span', null, file.name));
    if (file.folder) text.append(make('span', 'muted small', ` in ${file.folder}`));
    label.append(box, text);
    row.append(label);
    return row;
  }));
  const count = state.selected.size;
  $('source-count').textContent = state.files.length ? `${count} of ${state.files.length} selected` : '';
  $('select-all-row').hidden = state.files.length < 2;
  $('select-all').checked = count > 0 && count === state.files.length;
  $('select-all').indeterminate = count > 0 && count < state.files.length;
  $('source-hint').textContent = message
    ?? (state.files.length ? (count ? '' : 'Tick at least one file to start.') : 'Add a text (.txt) or Markdown (.md) file to this project to get started.');
}

function toggleSource(file, box) {
  if (box.checked) {
    if (selectedSize() + file.size > LIMITS.source || state.selected.size >= LIMITS.sources) {
      box.checked = false;
      paintSources('That is too much text at once. Untick another file first.');
      return;
    }
    state.selected.add(file.path);
  } else state.selected.delete(file.path);
  void remember('sources', [...state.selected]);
  paintSources();
}

function selectAll(checked) {
  state.selected = new Set();
  let total = 0;
  let skipped = 0;
  if (checked) {
    for (const file of state.files) {
      if (state.selected.size < LIMITS.sources && total + file.size <= LIMITS.source) { state.selected.add(file.path); total += file.size; } else skipped += 1;
    }
  }
  void remember('sources', [...state.selected]);
  paintSources(skipped ? `Selected what fits. ${skipped} file${skipped === 1 ? '' : 's'} left out because it is too much text at once.` : undefined);
}

async function readSources(paths) {
  const sources = [];
  for (const path of paths) {
    try {
      const { content } = await host.readFile(path);
      // Empty or binary files are skipped quietly; they add nothing to generate from.
      if (content.trim() && !content.includes('\0')) sources.push({ path, content });
    } catch { /* A file that vanished is skipped. */ }
  }
  return sources;
}

// ---------- tiles and creating ----------

function paintTiles() {
  $('tiles').replaceChildren(...FORMATS.map((format) => {
    const meta = TILES[format.key];
    const tile = make('div', 'tile');
    tile.style.setProperty('--tile', meta.color);
    tile.dataset.disabled = String(!format.implemented);
    const main = make('button', 'tile-main');
    main.type = 'button';
    main.append(icon(format.key, 'tile-icon'), make('span', 'tile-name', meta.name), make('span', 'tile-blurb', meta.blurb));
    if (!format.implemented) {
      main.disabled = true;
      main.title = 'Coming soon';
    } else {
      main.title = `Make a ${NOUNS[format.key]}`;
      main.addEventListener('click', () => { void create(format.key); });
    }
    tile.append(main);
    if (format.implemented) {
      const pencil = make('button', 'tile-edit');
      pencil.type = 'button';
      pencil.setAttribute('aria-label', `Customize ${meta.name}`);
      pencil.title = 'Customize';
      pencil.append(icon('pencil', 'icon small'));
      pencil.addEventListener('click', () => openCustomize(format.key));
      tile.append(pencil);
    }
    return tile;
  }));
}

function openCustomize(key) {
  state.customizing = { key, choice: defaultChoice(key) };
  $('customize-title').textContent = `Customize ${TILES[key].name}`;
  const choice = CHOICES[key];
  $('choice-group').hidden = !choice;
  if (choice) {
    $('choice-label').textContent = choice.label;
    const paintChips = () => $('choice-options').replaceChildren(...choice.options.map((option) => {
      const chip = make('button', 'chip', option.label);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(option.id === state.customizing.choice));
      chip.addEventListener('click', () => { state.customizing.choice = option.id; paintChips(); });
      return chip;
    }));
    paintChips();
  }
  $('focus').value = '';
  $('customize').showModal();
}

async function create(key, { choice, focus = '', paths } = {}) {
  const wanted = paths ?? [...state.selected];
  if (!wanted.length) {
    paintSources('Tick at least one file to start.');
    $('source-list').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const epoch = state.epoch;
  const connection = state.connection ?? await connect();
  if (epoch !== state.epoch) return;
  const model = chosenModel();
  if (!connection || !model) { snack('Studio is still getting ready. Please try again in a moment.'); return; }
  const sources = await readSources(wanted);
  if (epoch !== state.epoch) return;
  if (!sources.length) { paintSources('Those files are empty. Pick a file with some text in it.'); return; }
  const input = {
    id: crypto.randomUUID(), format: key, sources, instructions: focus.trim(), choice: choice ?? defaultChoice(key),
    model: model.ref, context: state.context,
  };
  try {
    const record = await rpc('POST', '/jobs', input);
    if (epoch !== state.epoch) return;
    trackActive(record);
  } catch (error) {
    if (epoch !== state.epoch) return;
    if (error.code === 'BUSY') snack('Studio is already making 3 things. Try again when one is done.');
    else if (error.code === 'SOURCE_TOO_LARGE') paintSources('That is too much text at once. Untick a file and try again.');
    else {
      // The request may have arrived even though the reply was lost; history shows the truth.
      await refreshHistory();
      if (!state.rows.some((row) => row.id === input.id)) snack('Studio could not start that. Please try again.');
    }
  }
}

// ---------- creations list and polling ----------

function trackActive(record) {
  state.rows = [record, ...state.rows.filter((row) => row.id !== record.id)];
  if (['queued', 'running'].includes(record.status)) state.active.set(record.id, record);
  paintCreations();
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(state.pollTimer);
  if (state.active.size) state.pollTimer = setTimeout(() => { void poll(); }, 1500);
}

async function poll() {
  const epoch = state.epoch;
  for (const id of [...state.active.keys()]) {
    try {
      const record = await rpc('GET', `/jobs/${id}?${query()}`);
      if (epoch !== state.epoch) return;
      if (['queued', 'running'].includes(record.status)) continue;
      state.active.delete(id);
      state.rows = state.rows.map((row) => (row.id === id ? record : row));
      if (record.status === 'completed' && state.viewer?.record.id !== id) {
        snack(`Your ${NOUNS[record.format]} ${['flashcards', 'pptx'].includes(record.format) ? 'are' : 'is'} ready.`, { label: 'Open', run: () => openViewer(record) });
      }
    } catch { /* Keep polling; a lost reply is not a failed job. */ }
  }
  paintCreations();
  schedulePoll();
}

async function refreshHistory(append = false) {
  const epoch = state.epoch;
  if (!state.context?.directory) return;
  try {
    const result = await rpc('GET', `/jobs?${query()}&offset=${append ? state.next ?? 0 : 0}`);
    if (epoch !== state.epoch) return;
    state.rows = append ? [...state.rows, ...result.jobs] : result.jobs;
    state.next = result.next;
    for (const row of result.jobs) if (row.canCancel) state.active.set(row.id, row);
    paintCreations();
    schedulePoll();
  } catch { /* History is retried on the next refresh. */ }
}

function rowText(row) {
  const noun = NOUNS[row.format] ?? 'item';
  const count = row.sources?.length ?? 1;
  const base = `${TILES[row.format]?.name ?? row.format} · ${sourcesLabel(count)} · ${timeAgo(row.createdAt)}`;
  if (row.status === 'completed') return { title: row.title || TILES[row.format].name, sub: base };
  if (['queued', 'running'].includes(row.status)) return { title: `Making your ${noun}...`, sub: `${sourcesLabel(count)} · This can take a minute` };
  if (row.status === 'cancelled') return { title: `Stopped ${noun}`, sub: `${base} · Tap to make it again` };
  return { title: `Couldn't make this ${noun}`, sub: `${base} · Tap to try again` };
}

function paintCreations() {
  const list = $('creations');
  list.replaceChildren(...state.rows.map((row) => {
    const item = make('li', 'creation');
    item.dataset.status = row.status;
    const button = make('button', 'creation-main');
    button.type = 'button';
    const bubble = icon(row.format, 'creation-icon');
    bubble.style.setProperty('--tile', TILES[row.format]?.color ?? '#888');
    const { title, sub } = rowText(row);
    const text = make('span', 'creation-text');
    text.append(make('span', 'creation-title', title), make('span', 'creation-sub', sub));
    button.append(bubble, text);
    const running = ['queued', 'running'].includes(row.status);
    if (running) button.append(make('span', 'spinner'));
    button.addEventListener('click', () => {
      if (row.status === 'completed') void openRecord(row.id);
      else if (!running) void retry(row.id);
    });
    item.append(button);
    if (running && row.canCancel !== false) {
      const stop = make('button', 'icon-button');
      stop.type = 'button';
      stop.setAttribute('aria-label', 'Stop');
      stop.title = 'Stop';
      stop.append(icon('stop', 'icon small'));
      stop.addEventListener('click', () => { void stopJob(row.id); });
      item.append(stop);
    }
    return item;
  }));
  $('creations-empty').hidden = state.rows.length > 0;
  $('more').hidden = state.next === null;
}

async function stopJob(id) {
  try {
    const record = await rpc('POST', `/jobs/${id}/cancel`, { context: state.context });
    state.active.delete(id);
    state.rows = state.rows.map((row) => (row.id === id ? record : row));
    paintCreations();
  } catch { await refreshHistory(); }
}

async function retry(id) {
  try {
    const record = await rpc('GET', `/jobs/${id}?${query()}`);
    const paths = (record.sources ?? [record.source]).map((source) => source.path).filter((path) => state.files.some((file) => file.path === path));
    await create(record.format, { choice: record.choice ?? undefined, focus: record.instructions ?? '', paths: paths.length ? paths : undefined });
  } catch { snack('Studio could not start that. Please try again.'); }
}

// ---------- viewer ----------

async function openRecord(id) {
  try { openViewer(await rpc('GET', `/jobs/${id}?${query()}`)); }
  catch { snack('That one could not be opened. Please try again.'); }
}

function openViewer(record) {
  closeViewer();
  if (!record.artifact && !record.markdown) { void openRecord(record.id); return; }
  const handle = renderViewer($('viewer-body'), record, {
    host, status: (text) => snack(text),
    saveProgress: (value) => { void rpc('POST', `/jobs/${record.id}/progress`, { context: state.context, progress: value }).catch(() => {}); },
  });
  state.viewer = { record, handle };
  $('viewer-title').textContent = record.title || TILES[record.format].name;
  const save = $('viewer-save');
  save.replaceChildren(icon('save', 'icon small'), make('span', null, 'Save'));
  save.title = 'Save a copy in your project folder';
  save.onclick = () => { void saveRecord(record); };
  paintFacts(record);
  $('viewer-details').open = false;
  $('viewer').hidden = false;
  $('studio').hidden = true;
  $('viewer-back').focus();
}

function closeViewer() {
  state.viewer?.handle.dispose();
  state.viewer = null;
  $('viewer-body').replaceChildren();
  $('viewer').hidden = true;
  $('studio').hidden = false;
}

function paintFacts(record) {
  const facts = [
    ['Made from', (record.sources ?? [record.source]).map((source) => source.path).join(', ')],
    ['Made', new Date(record.completedAt ?? record.createdAt).toLocaleString()],
    ['AI model', modelName(record.model)],
  ];
  const tries = record.attempts ?? [];
  if (tries.length > 1) {
    const switched = tries.some((attempt) => attempt.model.id !== record.requestedModel?.id);
    facts.push(['Behind the scenes', `Took ${tries.length} tries${switched ? `; finished with ${modelName(record.model)}` : ''}.`]);
  }
  if (record.file) facts.push(['File', `${record.file.bytes.toLocaleString()} bytes${record.file.pages ? `, ${record.file.pages} ${record.format === 'pdf' ? 'pages' : record.format === 'pptx' ? 'slides' : 'sheets'}` : ''}. MD5 ${record.file.md5}`]);
  if (record.savedPath) facts.push(['Last saved as', record.savedPath]);
  for (const note of record.notes ?? []) facts.push(['Note', note]);
  $('viewer-facts').replaceChildren(...facts.flatMap(([term, value]) => [make('dt', null, term), make('dd', null, value)]));
}

async function saveRecord(record) {
  const button = $('viewer-save');
  button.disabled = true;
  try {
    const { savedPath } = await rpc('POST', `/jobs/${record.id}/save`, { context: state.context });
    record.savedPath = savedPath;
    paintFacts(record);
    snack(`Saved as "${savedPath}" in your project folder.`);
  } catch { snack('Saving did not work. Please try again.'); }
  finally { button.disabled = false; }
}

// ---------- settings ----------

function paintSettings() {
  const select = $('model-select');
  const models = state.connection?.models ?? [];
  const recommended = models.find((model) => model.key === state.connection?.recommendedModelKey);
  const auto = make('option', null, `Automatic${recommended ? ` (${recommended.label})` : ''}`);
  auto.value = 'auto';
  select.replaceChildren(auto, ...models.map((model) => Object.assign(make('option', null, model.label), { value: model.key })));
  select.value = models.some((model) => model.key === state.modelPref) ? state.modelPref : 'auto';
  $('connection-line').textContent = state.connection ? `Connected to OpenCode ${state.connection.version}.` : 'Connecting...';
}

// ---------- wiring ----------

function mount() {
  $('open-settings').append(icon('gear'));
  $('viewer-back').append(icon('back'));
  $('viewer-back').addEventListener('click', closeViewer);
  $('select-all').addEventListener('change', (event) => selectAll(event.target.checked));
  $('more').addEventListener('click', () => { void refreshHistory(true); });
  $('open-settings').addEventListener('click', () => { paintSettings(); $('settings').showModal(); });
  $('model-select').addEventListener('change', (event) => {
    state.modelPref = event.target.value;
    void remember('model', state.modelPref);
  });
  $('customize').addEventListener('close', () => {
    const pending = state.customizing;
    state.customizing = null;
    if ($('customize').returnValue === 'go' && pending) void create(pending.key, { choice: pending.choice, focus: $('focus').value });
  });
  // The sandboxed frame blocks form submission, so dialog buttons close their dialog directly.
  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => button.closest('dialog').close(button.dataset.close));
  }
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.viewer) closeViewer(); });
  paintTiles();
}

let mounted = false;
host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (!mounted) { mount(); mounted = true; }
  const next = { directory: ctx.directory, sessionId: ctx.session?.id ?? '', hostOrigin: new URL(window.location.href).origin };
  if (state.context?.directory === next.directory && state.context?.sessionId === next.sessionId) return;
  clearTimeout(state.pollTimer);
  clearTimeout(state.retryTimer);
  closeViewer();
  Object.assign(state, { context: next, epoch: state.epoch + 1, connection: null, connecting: null, retryDelay: 2000, files: [], selected: new Set(), rows: [], next: null, active: new Map() });
  paintSources();
  paintCreations();
  if (!next.directory) { notice('Open a project in OpenChamber to use Studio.'); return; }
  notice(next.sessionId ? null : 'Open a chat in this project to use Studio.');
  void (async () => {
    const pref = await recall('model');
    if (typeof pref === 'string') state.modelPref = pref;
  })();
  void loadSources();
  void refreshHistory();
  void connect();
});

window.addEventListener('pagehide', () => {
  clearTimeout(state.pollTimer);
  clearTimeout(state.retryTimer);
  state.viewer?.handle.dispose();
  host.dispose();
});
