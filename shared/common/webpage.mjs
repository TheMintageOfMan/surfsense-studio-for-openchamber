// Prompt rules and reply shape adapted from SurfSense (https://github.com/MODSetter/SurfSense,
// commit 7fb479c3): surfsense_local/backend/worker/studio/web/html/prompts/frontier.md and
// pipeline.py. Copyright (c) SurfSense, Apache License 2.0; see THIRD-PARTY-LICENSES.txt.
// Modified: single JSON-encoded source, injection guard, disclosed caps, a new styled
// template with a script-free Content-Security-Policy and a provenance footer.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const SECTIONS = 10;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);

const CSS = `:root { color-scheme: light dark; --text: #1f2328; --muted: #59636e; --line: #d1d9e0; --bg: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --text: #e6edf3; --muted: #9198a1; --line: #3d444d; --bg: #0d1117; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
h1 { font-size: 2.1rem; line-height: 1.2; margin: 0 0 1.5rem; letter-spacing: -0.02em; }
h2 { font-size: 1.3rem; line-height: 1.3; margin: 1.6rem 0 0.6rem; }
p { margin: 0 0 1rem; overflow-wrap: anywhere; }
section { border-top: 1px solid var(--line); padding-top: 0.4rem; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; }`;

export function webpageMeta(record) {
  const { providerID, id, variant } = record.model;
  return { source: record.source.path, model: `${providerID}/${id}${variant ? `#${variant}` : ''}`, createdAt: record.createdAt };
}

// Every model value is escaped into a fixed template; the page can carry no script.
export function buildWebPage(page, meta) {
  const sections = page.sections.map((section) => [
    '<section>',
    ...(section.heading ? [`<h2>${escapeHtml(section.heading)}</h2>`] : []),
    ...section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    '</section>',
  ].join('\n')).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="generator" content="SurfSense Studio for OpenChamber v2">
<title>${escapeHtml(page.title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(page.title)}</h1>
${sections}
<footer>Generated from ${escapeHtml(meta.source)} with ${escapeHtml(meta.model)} on ${escapeHtml(String(meta.createdAt).slice(0, 10))}. Review it against the source before relying on it.</footer>
</main>
</body>
</html>
`;
}

export const webpage = Object.freeze({
  key: 'webpage',
  label: 'Web page',
  noun: 'web page',
  folder: 'webpages',
  extension: 'html',
  implemented: true,
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You write web pages from a source document. The reader lands on this page cold and will never see the source.',
      task: 'write a structured page from the source.',
      rules: [
        'The source is raw material, not an outline to walk. Read all of it, then lead with what it adds up to.',
        `Use as many sections as the material earns, at most ${SECTIONS}, in the order a reader needs them.`,
        'A heading states something. "Overview", "Background" and "Conclusion" are placeholders for the work of naming what the section says.',
        'Prefer the specific figure, date or name over the general statement. Where the source records a disagreement or a correction, say so and give both sides.',
        'Distinguish what is settled from what is proposed, pending or conditional.',
        'Cut anything that restates the brief, hedges without content, or stands in for material you do not have.',
        'Every field is plain text. No HTML, no Markdown, no links, no table markup: the page is assembled from your text, and anything that looks like markup is escaped and shown as characters.',
        'You tend to converge on generic, on-distribution pages. Resist it; the page should be one only this material could support.',
      ],
      shape: 'Return only JSON, no prose: {"title": string, "sections": [{"heading": string, "paragraphs": [string]}]}. Nothing before the JSON, nothing after it.',
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Web page');
    const offered = asList(spec.sections);
    const usable = offered.map((section) => ({
      heading: asText(section?.heading),
      paragraphs: asList(section?.paragraphs).map(asText).filter(Boolean),
    })).filter((section) => section.paragraphs.length);
    const sections = usable.slice(0, SECTIONS);
    if (!sections.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable page sections. Nothing was saved; regenerate explicitly.');
    const notes = [];
    if (usable.length < offered.length) notes.push(`Omitted ${plural(offered.length - usable.length, 'section')} without paragraph text.`);
    if (usable.length > SECTIONS) notes.push(`The model returned ${usable.length} usable sections; this build keeps the first ${SECTIONS}.`);
    const title = asText(spec.title) || 'Web page';
    const lines = [`# ${title}`];
    for (const section of sections) {
      if (section.heading) lines.push('', `## ${section.heading}`);
      for (const paragraph of section.paragraphs) lines.push('', paragraph);
    }
    return { title, markdown: lines.join('\n') + '\n', artifact: { title, sections }, notes };
  },
  exportContent(record) {
    return buildWebPage(record.artifact, webpageMeta(record));
  },
});
