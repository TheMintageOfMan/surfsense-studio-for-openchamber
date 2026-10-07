// Word, Slides, Spreadsheet and PDF: structured prompts and reply validation shared by the
// panel and the service. These are this project's own prompts; SurfSense's Office prompts ask
// the model for Python scripts, which this build never runs. Files are built by the service
// (shared/service/builders/) from the validated artifact only.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const CAPS = Object.freeze({
  sections: 12, tableColumns: 8, tableRows: 50,
  slides: 15, bullets: 6,
  sheets: 10, sheetColumns: 20, sheetRows: 500,
});

const COMMON_RULES = [
  'The source is raw material, not an outline to walk. Read all of it, then lead with what it adds up to.',
  'Prefer the specific figure, date or name over the general statement. Where the source records a disagreement or a correction, say so and give both sides.',
  'Distinguish what is settled from what is proposed, pending or conditional.',
  'Use only what the source states. Do not invent numbers, names, dates, status or claims.',
  'Every value is plain text. No Markdown, no HTML, no code, no formulas: the file is assembled from your text and formatting is applied for you.',
];

// Pipes and line breaks would break a Markdown table row in the history body.
const cell = (value) => (value === null || value === undefined ? '' : String(value)).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
function markdownTable(columns, rows) {
  return [
    `| ${columns.map(cell).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ];
}

// Rows must match the header exactly; a short or long row would misalign every value after it.
function cleanTable(value, notes, label, { maxColumns, maxRows, cellValue }) {
  if (!value || typeof value !== 'object') return null;
  const columns = asList(value.columns).map(asText);
  if (!columns.length || columns.some((column) => !column)) {
    notes.push(`Omitted the ${label} because its column headers were missing or blank.`);
    return null;
  }
  if (columns.length > maxColumns) {
    notes.push(`Omitted the ${label} because it has ${columns.length} columns; this build allows ${maxColumns}.`);
    return null;
  }
  const offered = asList(value.rows);
  const matching = offered.filter((row) => Array.isArray(row) && row.length === columns.length);
  if (matching.length < offered.length) notes.push(`Omitted ${plural(offered.length - matching.length, 'row')} from the ${label} whose length did not match its ${columns.length} columns.`);
  if (matching.length > maxRows) notes.push(`The ${label} had ${matching.length} rows; this build keeps the first ${maxRows}.`);
  const rows = matching.slice(0, maxRows).map((row) => row.map(cellValue));
  return { columns, rows };
}

const textCell = (value) => asText(value);

function documentArtifact(raw, label) {
  const spec = parseJsonObject(raw, label);
  const notes = [];
  const offered = asList(spec.sections);
  const usable = [];
  offered.forEach((section, index) => {
    const heading = asText(section?.heading);
    const paragraphs = asList(section?.paragraphs).map(asText).filter(Boolean);
    const bullets = asList(section?.bullets).map(asText).filter(Boolean);
    const table = section?.table ? cleanTable(section.table, notes, `table in section ${index + 1}`, {
      maxColumns: CAPS.tableColumns, maxRows: CAPS.tableRows, cellValue: textCell,
    }) : null;
    if (paragraphs.length || bullets.length || table) usable.push({ heading, paragraphs, bullets, table });
  });
  if (usable.length < offered.length) notes.unshift(`Omitted ${plural(offered.length - usable.length, 'section')} without text, bullets or a usable table.`);
  if (usable.length > CAPS.sections) notes.push(`The model returned ${usable.length} usable sections; this build keeps the first ${CAPS.sections}.`);
  const sections = usable.slice(0, CAPS.sections);
  if (!sections.length) throw new StudioError('EMPTY_RESULT', `The model returned no usable ${label} sections. Nothing was saved; regenerate explicitly.`);
  const title = asText(spec.title) || label;
  const subtitle = asText(spec.subtitle);
  const lines = [`# ${title}`];
  if (subtitle) lines.push('', `_${subtitle}_`);
  for (const section of sections) {
    if (section.heading) lines.push('', `## ${section.heading}`);
    for (const paragraph of section.paragraphs) lines.push('', paragraph);
    if (section.bullets.length) lines.push('', ...section.bullets.map((bullet) => `- ${bullet}`));
    if (section.table) lines.push('', ...markdownTable(section.table.columns, section.table.rows));
  }
  return { title, markdown: lines.join('\n') + '\n', artifact: { title, subtitle, sections }, notes };
}

const DOCUMENT_SHAPE = `Return only JSON, no prose: {"title": string, "subtitle": string, "sections": [{"heading": string, "paragraphs": [string], "bullets": [string], "table": {"columns": [string], "rows": [[string]]} or null}]}. At most ${CAPS.sections} sections. A table has at most ${CAPS.tableColumns} columns and ${CAPS.tableRows} rows, and every row has exactly one value per column. Use empty lists where a section has no paragraphs or bullets. Nothing before the JSON, nothing after it.`;

function documentPrompt(input, kind) {
  return structuredPrompt({
    input,
    role: `You write ${kind} documents from a source document. The reader opens this document cold and will never see the source.`,
    task: `write a structured ${kind} document from the source.`,
    rules: [
      ...COMMON_RULES,
      `Use as many sections as the material earns, at most ${CAPS.sections}, in the order a reader needs them.`,
      'A heading states something. "Overview", "Background" and "Conclusion" are placeholders for the work of naming what the section says.',
      'Use bullets for lists the source actually enumerates, and a table only where the source gives values that line up in rows and columns.',
    ],
    shape: DOCUMENT_SHAPE,
  });
}

const base = (key, label, noun, folder, extension) => ({ key, label, noun, folder, extension, implemented: true, binary: true });

export const docx = Object.freeze({
  ...base('docx', 'Word', 'Word document', 'documents', 'docx'),
  prompt: (input) => documentPrompt(input, 'Word'),
  build: (raw) => documentArtifact(raw, 'Word document'),
});

export const pdf = Object.freeze({
  ...base('pdf', 'PDF', 'PDF', 'pdfs', 'pdf'),
  prompt: (input) => documentPrompt(input, 'PDF'),
  build: (raw) => documentArtifact(raw, 'PDF'),
});

export const pptx = Object.freeze({
  ...base('pptx', 'Slides', 'slide deck', 'slides', 'pptx'),
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You write slide decks from a source document. The audience sees only the slides; the speaker reads the notes.',
      task: 'write a slide deck from the source.',
      rules: [
        ...COMMON_RULES,
        `Use as many slides as the material earns, at most ${CAPS.slides}. A title slide is added for you; do not write one.`,
        'A slide title states the point of the slide, not its topic.',
        `At most ${CAPS.bullets} short bullets per slide. Put the explanation a speaker would give in the notes.`,
      ],
      shape: `Return only JSON, no prose: {"title": string, "subtitle": string, "slides": [{"title": string, "bullets": [string], "notes": string}]}. Nothing before the JSON, nothing after it.`,
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Slides');
    const notes = [];
    const offered = asList(spec.slides);
    let trimmed = 0;
    const usable = offered.map((slide) => {
      const bullets = asList(slide?.bullets).map(asText).filter(Boolean);
      if (bullets.length > CAPS.bullets) trimmed += 1;
      return { title: asText(slide?.title), bullets: bullets.slice(0, CAPS.bullets), notes: asText(slide?.notes) };
    }).filter((slide) => slide.title && slide.bullets.length);
    if (usable.length < offered.length) notes.push(`Omitted ${plural(offered.length - usable.length, 'slide')} without a title and bullets.`);
    if (trimmed) notes.push(`${plural(trimmed, 'slide')} had more than ${CAPS.bullets} bullets; this build keeps the first ${CAPS.bullets} on each.`);
    if (usable.length > CAPS.slides) notes.push(`The model returned ${usable.length} usable slides; this build keeps the first ${CAPS.slides}.`);
    const slides = usable.slice(0, CAPS.slides);
    if (!slides.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable slides. Nothing was saved; regenerate explicitly.');
    const title = asText(spec.title) || 'Slides';
    const subtitle = asText(spec.subtitle);
    const lines = [`# ${title}`];
    if (subtitle) lines.push('', `_${subtitle}_`);
    slides.forEach((slide, index) => {
      lines.push('', `## ${index + 1}. ${slide.title}`, '', ...slide.bullets.map((bullet) => `- ${bullet}`));
      if (slide.notes) lines.push('', `> Notes: ${slide.notes}`);
    });
    return { title, markdown: lines.join('\n') + '\n', artifact: { title, subtitle, slides }, notes };
  },
});

// Excel's sheet-name rules: 1-31 characters, none of []:*?/\, no leading or trailing
// apostrophe, unique ignoring case. "History" is reserved by Excel and "Notes" by this build.
export function sheetName(value, taken, index) {
  let name = asText(value).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, 31).trim();
  if (!name || ['history', 'notes'].includes(name.toLowerCase())) name = name ? `${name} ${index + 1}` : `Sheet ${index + 1}`;
  let candidate = name;
  for (let suffix = 2; taken.has(candidate.toLowerCase()); suffix += 1) {
    const tail = ` (${suffix})`;
    candidate = name.slice(0, 31 - tail.length).trim() + tail;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

// Only source values survive: numbers stay numbers, blanks stay empty, anything else is dropped.
function sheetCell(counter) {
  return (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return value.trim() || null;
    counter.invalid += 1;
    return null;
  };
}

export const xlsx = Object.freeze({
  ...base('xlsx', 'Spreadsheet', 'spreadsheet', 'spreadsheets', 'xlsx'),
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You extract tables from a source document into a spreadsheet. The reader will sort, filter and calculate with these values.',
      task: 'extract the tabular facts in the source into spreadsheet tables.',
      rules: [
        ...COMMON_RULES,
        'Every row comes from the source. Do not invent rows, estimate values or fill gaps.',
        'A value the source does not give is null, never a guess, zero or "N/A".',
        'Write a number as a JSON number only when the source gives it as a plain quantity; keep units in the column header. Keep identifiers, dates and ranges as strings.',
        `Every row has exactly one value per column. At most ${CAPS.sheets} tables, ${CAPS.sheetColumns} columns and ${CAPS.sheetRows} rows per table.`,
        'Name each table for what its rows are, in at most 31 characters, and say in its description where in the source the values come from.',
      ],
      shape: 'Return only JSON, no prose: {"title": string, "tables": [{"name": string, "description": string, "columns": [string], "rows": [[string or number or null]]}]}. Nothing before the JSON, nothing after it.',
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Spreadsheet');
    const notes = [];
    const offered = asList(spec.tables);
    const taken = new Set();
    const counter = { invalid: 0 };
    const usable = [];
    offered.forEach((table, index) => {
      const label = `table "${asText(table?.name) || index + 1}"`;
      const clean = cleanTable(table, notes, label, { maxColumns: CAPS.sheetColumns, maxRows: CAPS.sheetRows, cellValue: sheetCell(counter) });
      if (!clean?.rows.length) {
        if (clean) notes.push(`Omitted the ${label} because it had no rows.`);
        return;
      }
      usable.push({ ...clean, offeredName: asText(table.name), description: asText(table.description) });
    });
    if (usable.length > CAPS.sheets) notes.push(`The model returned ${usable.length} usable tables; this build keeps the first ${CAPS.sheets}.`);
    const tables = usable.slice(0, CAPS.sheets).map((table, index) => {
      const name = sheetName(table.offeredName, taken, index);
      if (table.offeredName && name !== table.offeredName) notes.push(`Renamed sheet "${table.offeredName}" to "${name}" to meet Excel's sheet-name rules.`);
      return { name, description: table.description, columns: table.columns, rows: table.rows };
    });
    if (counter.invalid) notes.push(`Left ${plural(counter.invalid, 'cell')} empty because the value was not text, a number or null.`);
    if (!tables.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable tables. Nothing was saved; regenerate explicitly.');
    const title = asText(spec.title) || 'Spreadsheet';
    const lines = [`# ${title}`];
    for (const table of tables) {
      lines.push('', `## ${table.name}`);
      if (table.description) lines.push('', table.description);
      lines.push('', ...markdownTable(table.columns, table.rows));
    }
    return { title, markdown: lines.join('\n') + '\n', artifact: { title, tables }, notes };
  },
});

export const DOCUMENT_CAPS = CAPS;
