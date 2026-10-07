// Reads a project file and returns its text for the model. Runs in the service, which can read
// any file type; the sandboxed panel can only read UTF-8 text. Every extractor is a library or
// parser with no OCR and no code execution; a file without readable text is refused, not guessed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { decodeHTML, decodeXML } from 'entities';
import mammoth from 'mammoth';
import { StudioError } from '../common/core.mjs';
import { SOURCE_KINDS, sourceKind } from '../common/sources.mjs';
import { excelDateText, isDateFormat } from './excel-dates.mjs';
import { docText, xlsText } from './legacy.mjs';
import { pptText } from './legacy-ppt.mjs';

// Larger files are almost always data dumps or scans, and slow to parse.
const FILE_BYTES = 25 * 1024 * 1024;

// ---------- plain text and markup ----------

function decodeText(bytes) {
  if (bytes.includes(0)) throw new StudioError('NOT_TEXT', 'is not readable as text.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
  catch { throw new StudioError('NOT_TEXT', 'is in a text format Studio cannot read.'); }
}

// Keeps the readable text of a page: scripts and styles go, block elements become line breaks.
export function htmlText(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6]|blockquote|pre|table|ul|ol|dt|dd)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, ' ');
  return decodeHTML(text).replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Office Open XML (slides and sheets) ----------

const xmlText = (value) => decodeXML(value);
const zipEntries = (bytes) => {
  try { return unzipSync(bytes); } catch { throw new StudioError('BAD_FILE', 'could not be opened; it may be damaged.'); }
};
const part = (entries, name) => (entries[name] ? strFromU8(entries[name]) : '');
const relationships = (xml) => new Map([...xml.matchAll(/<Relationship\b([^>]*)\/?>/g)]
  .map((m) => [m[1].match(/\bId="([^"]+)"/)?.[1], m[1].match(/\bTarget="([^"]+)"/)?.[1]]).filter(([id, target]) => id && target));
const byNumber = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);

// Text of DrawingML paragraphs (<a:p> holding <a:t> runs), one line per paragraph.
function drawingParagraphs(xml) {
  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
    .map((match) => [...match[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((run) => xmlText(run[1])).join('').trim())
    .filter(Boolean);
}

export function pptxText(bytes) {
  const entries = zipEntries(bytes);
  // Slide order comes from the presentation's slide list, not file names.
  const presentation = part(entries, 'ppt/presentation.xml');
  const rels = part(entries, 'ppt/_rels/presentation.xml.rels');
  const targets = relationships(rels);
  let slides = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => targets.get(m[1])).filter(Boolean)
    .map((target) => path.posix.normalize(path.posix.join('ppt', target)));
  if (!slides.length) slides = Object.keys(entries).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(byNumber);
  const out = [];
  slides.forEach((slide, index) => {
    const lines = drawingParagraphs(part(entries, slide));
    const slideRels = part(entries, slide.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const notesTarget = slideRels.match(/Target="([^"]*notesSlide\d+\.xml)"/)?.[1];
    // Notes repeat the slide number placeholder; keep only real sentences.
    const notes = notesTarget ? drawingParagraphs(part(entries, path.posix.normalize(path.posix.join(path.posix.dirname(slide), notesTarget)))).filter((line) => !/^\d+$/.test(line)) : [];
    if (!lines.length && !notes.length) return;
    out.push(`Slide ${index + 1}`, ...lines, ...(notes.length ? ['Notes:', ...notes] : []), '');
  });
  return out.join('\n').trim();
}

// Column letters to a zero-based index: A -> 0, AA -> 26.
const column = (ref) => [...ref.replace(/\d+/g, '')].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

export function xlsxText(bytes) {
  const entries = zipEntries(bytes);
  const shared = [...part(entries, 'xl/sharedStrings.xml').matchAll(/<si\b[\s\S]*?<\/si>/g)]
    .map((si) => [...si[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(''));
  const workbook = part(entries, 'xl/workbook.xml');
  const rels = part(entries, 'xl/_rels/workbook.xml.rels');
  // Dates are numbers whose cell style points at a date format; find which styles those are.
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);
  const stylesXml = part(entries, 'xl/styles.xml');
  const customFormats = new Map([...stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)].map((m) => [Number(m[1].match(/\bnumFmtId="(\d+)"/)?.[1]), xmlText(m[1].match(/\bformatCode="([^"]*)"/)?.[1] ?? '')]));
  const cellStyles = [...(stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? '').matchAll(/<xf\b([^>]*)/g)].map((m) => Number(m[1].match(/\bnumFmtId="(\d+)"/)?.[1] ?? 0));
  const targets = relationships(rels);
  // Attribute order varies between writers, so each attribute is read on its own.
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const target = targets.get(m[1].match(/\br:id="([^"]+)"/)?.[1]) ?? '';
    return { name: xmlText(m[1].match(/\bname="([^"]*)"/)?.[1] ?? 'Sheet'), file: target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join('xl', target)) };
  });
  const numberText = (raw, attrs) => {
    const formatId = cellStyles[Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0)];
    const value = Number(raw);
    return isDateFormat(formatId, customFormats.get(formatId)) ? excelDateText(value, date1904, customFormats.get(formatId)) : xmlText(raw);
  };
  const out = [];
  for (const sheet of sheets) {
    const rows = [];
    for (const row of part(entries, sheet.file).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1];
        const body = cell[2] ?? '';
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const value = type === 's' ? shared[Number(raw)] ?? ''
          : type === 'inlineStr' ? [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join('')
            : type === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE')
              : raw === undefined ? ''
                : type === undefined || type === 'n' ? numberText(raw, attrs)
                  : xmlText(raw);
        cells[ref ? column(ref) : cells.length] = value.replace(/\s+/g, ' ').trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, (value) => value ?? '').join('\t'));
    }
    if (rows.length) out.push(`Sheet: ${sheet.name}`, ...rows, '');
  }
  return out.join('\n').trim();
}

// ---------- Word and PDF ----------

async function docxText(bytes) {
  try { return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.replace(/\n{3,}/g, '\n\n').trim(); }
  catch { throw new StudioError('BAD_FILE', 'could not be opened; it may be damaged.'); }
}

// pdf.js runs with its worker code in this thread ("fake worker"), so no worker file is shipped.
let pdfjs;
async function loadPdfjs() {
  pdfjs ??= (async () => {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    globalThis.pdfjsWorker = worker;
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return pdfjs;
}

async function pdfText(bytes) {
  const { getDocument, VerbosityLevel } = await loadPdfjs();
  let task;
  let document;
  try {
    task = getDocument({
      data: new Uint8Array(bytes), verbosity: VerbosityLevel.ERRORS,
      isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false,
    });
    document = await task.promise;
  } catch (error) {
      void task?.destroy();
    if (error?.name === 'PasswordException') throw new StudioError('LOCKED_FILE', 'is password-protected.');
    throw new StudioError('BAD_FILE', 'could not be opened; it may be damaged.');
  }
  try {
    const pages = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      // hasEOL marks line ends; items on one line are joined with what pdf.js reports between them.
      pages.push(content.items.map((item) => `${item.str ?? ''}${item.hasEOL ? '\n' : ''}`).join('').replace(/[ \t]+/g, ' ').trim());
      page.cleanup();
    }
    const text = pages.filter(Boolean).map((page, index) => `Page ${index + 1}\n${page}`).join('\n\n').trim();
    if (!text) throw new StudioError('NO_TEXT', 'has no text Studio can read; it may be a scanned picture.');
    return text;
  } finally {
    await task.destroy();
  }
}

// ---------- entry points ----------

const EXTRACTORS = {
  text: (bytes) => decodeText(bytes),
  html: (bytes) => htmlText(decodeText(bytes)),
  docx: docxText,
  pdf: pdfText,
  pptx: pptxText,
  xlsx: xlsxText,
  doc: docText,
  xls: xlsText,
  ppt: pptText,
};

// Resolves a project-relative path to a regular file inside the project, refusing links out.
async function projectFile(directory, relative) {
  const target = path.resolve(directory, ...relative.split('/'));
  const inside = path.relative(directory, target);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new StudioError('BAD_SOURCE', 'is outside this project.');
  const info = await fs.lstat(target).catch(() => null);
  if (!info) throw new StudioError('MISSING_SOURCE', 'no longer exists.');
  if (info.isSymbolicLink() || !info.isFile()) throw new StudioError('BAD_SOURCE', 'is a shortcut or a folder, not a file.');
  if (info.size > FILE_BYTES) throw new StudioError('FILE_TOO_LARGE', `is too big (over ${FILE_BYTES / 1024 / 1024} MB).`);
  return { target, info };
}

// Cache by path, size and modification time, so the source list and the job share one parse.
const cache = new Map();

export async function readSource(directory, relative) {
  const kind = sourceKind(relative);
  if (!kind) throw new StudioError('BAD_SOURCE', 'is a kind of file Studio cannot read.');
  const { target, info } = await projectFile(directory, relative);
  const key = `${target}|${info.size}|${info.mtimeMs}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const text = (await EXTRACTORS[SOURCE_KINDS[kind].extractor](await fs.readFile(target))).trim();
      if (!text) throw new StudioError('NO_TEXT', 'has no text in it.');
      return text;
    })());
    // A failed read is not remembered: the file may be fixed and tried again.
    cache.get(key).catch(() => cache.delete(key));
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

// Prefixes the file name so every error reads as a sentence: "notes.pdf is password-protected."
export async function readSourceOrExplain(directory, relative) {
  try { return { text: await readSource(directory, relative) }; }
  catch (error) {
    if (!(error instanceof StudioError)) return { error: { code: 'BAD_FILE', message: `${relative} could not be read.` } };
    return { error: { code: error.code, message: `${relative} ${error.message}` } };
  }
}

// ---------- listing ----------

// Folders that hold tooling or build output rather than someone's material.
const SKIP_FOLDERS = new Set(['node_modules', '.git', '.studio', 'temp', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv', '.venv']);
// Legal and package boilerplate is rarely what someone wants to study.
const BOILERPLATE = /^(license|licence|copying|notice|third-party|changelog|code_of_conduct|package(-lock)?\.json$|yarn\.lock|pnpm-lock|tsconfig|jsconfig|composer\.(json|lock)$)|-license\.txt$/i;
const MAX_FILES = 60;
const MAX_DEPTH = 2;
const LIST_BUDGET_MS = 12_000;

// Lists readable files near the project root with their exact text size, so the panel can offer
// only what fits. A file that cannot be read is listed with the reason instead of its size.
export async function listSources(directory) {
  const found = [];
  const walk = async (relative, depth) => {
    let entries;
    try { entries = await fs.readdir(path.join(directory, ...relative.split('/').filter(Boolean)), { withFileTypes: true }); }
    catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isFile() && sourceKind(entry.name) && !BOILERPLATE.test(entry.name)) found.push({ path: child, name: entry.name, folder: relative, kind: sourceKind(entry.name) });
    }
    if (depth >= MAX_DEPTH) return;
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_FOLDERS.has(entry.name)) await walk(relative ? `${relative}/${entry.name}` : entry.name, depth + 1);
    }
  };
  await walk('', 0);
  // A few at a time: PDFs and Office files take real work to read. The host bridge gives up after
  // about 20 seconds, so files still being read are returned as pending; reading carries on into
  // the cache and the panel asks again.
  const queue = [...found];
  const workers = Promise.all(Array.from({ length: 4 }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const { text, error } = await readSourceOrExplain(directory, file.path);
      if (error) file.error = error.message.slice(file.path.length).trim();
      else file.characters = text.length;
      file.done = true;
    }
  }));
  await Promise.race([workers, new Promise((resolve) => { setTimeout(resolve, LIST_BUDGET_MS).unref(); })]);
  return found.map(({ done, ...file }) => (done ? file : { ...file, pending: true }));
}