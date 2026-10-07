import { LIMITS, requireJobId, sourcesOf, StudioError, validSourcePath } from './core.mjs';
import { docx, pdf, pptx, xlsx } from './documents.mjs';
import { flashcards } from './flashcards.mjs';
import { mindmap } from './mindmap.mjs';
import { quiz } from './quiz.mjs';
import { summary } from './summary.mjs';
import { webpage } from './webpage.mjs';

const planned = (key, label, reason) => Object.freeze({ key, label, implemented: false, reason });

// Grid order follows SurfSense's Studio panel.
export const FORMATS = Object.freeze([
  summary,
  docx,
  pptx,
  xlsx,
  webpage,
  pdf,
  mindmap,
  flashcards,
  quiz,
  planned('podcast', 'Podcast', 'Not built yet: needs the optional Kokoro audio pack.'),
  planned('image', 'Image', 'Not built yet: needs an image-generation model.'),
  planned('infographic', 'Infographic', 'Not built yet: needs an image-generation model.'),
]);

export const IMPLEMENTED = Object.freeze(FORMATS.filter((format) => format.implemented));

export function formatFor(key) {
  const format = IMPLEMENTED.find((entry) => entry.key === key);
  if (!format) throw new StudioError('BAD_FORMAT', 'Choose a format this build implements.');
  return format;
}

export const labelFor = (key) => FORMATS.find((entry) => entry.key === key)?.label ?? String(key);

// One simple choice per format, shown behind the tile's pencil. The first option marked
// `default` is used when the tile is tapped. `hint` is what the model is told.
const choice = (label, options) => Object.freeze({ label, options: Object.freeze(options) });
const LENGTH = choice('Length', [
  { id: 'short', label: 'Shorter', hint: 'Keep it short: roughly half the usual length.' },
  { id: 'standard', label: 'Standard', hint: '', default: true },
  { id: 'long', label: 'Longer', hint: 'Go into more detail: use more of the allowed length.' },
]);
export const CHOICES = Object.freeze({
  summary: choice('Length', [
    { id: 'short', label: 'Short', hint: 'Length: about 200 words.' },
    { id: 'standard', label: 'Standard', hint: '', default: true },
    { id: 'long', label: 'Long', hint: 'Length: about 900 words.' },
  ]),
  docx: LENGTH, pdf: LENGTH, webpage: LENGTH,
  pptx: choice('Length', [
    { id: 'short', label: 'Short deck', hint: 'Length: about 6 slides.' },
    { id: 'standard', label: 'Standard', hint: '', default: true },
  ]),
  flashcards: choice('Number of cards', [
    { id: 'fewer', label: 'Fewer', hint: 'Amount: about 8 cards.' },
    { id: 'standard', label: 'Standard', hint: '', default: true },
    { id: 'more', label: 'More', hint: 'Amount: as many good cards as the limit allows.' },
  ]),
  quiz: choice('Difficulty', [
    { id: 'easy', label: 'Easy', hint: 'Difficulty: easy. Test the main facts with clearly different options.' },
    { id: 'medium', label: 'Medium', hint: '', default: true },
    { id: 'hard', label: 'Hard', hint: 'Difficulty: hard. Test fine distinctions and links between parts of the source.' },
  ]),
  mindmap: choice('Detail', [
    { id: 'simple', label: 'Simple', hint: 'Detail: simple. Fewer branches, two levels deep.' },
    { id: 'standard', label: 'Detailed', hint: '', default: true },
  ]),
});

export const defaultChoice = (key) => CHOICES[key]?.options.find((option) => option.default)?.id ?? null;

export function validateJob(input) {
  if (!input || typeof input !== 'object') throw new StudioError('BAD_INPUT', 'A Studio request is required.');
  requireJobId(input.id);
  const format = formatFor(input.format);
  const offered = sourcesOf(input);
  if (!Array.isArray(offered) || !offered.length) throw new StudioError('BAD_SOURCE', 'Choose at least one source.');
  if (offered.length > LIMITS.sources) throw new StudioError('TOO_MANY_SOURCES', `Choose at most ${LIMITS.sources} sources.`);
  const seen = new Set();
  const sources = offered.map((source) => {
    if (!validSourcePath(source?.path) || seen.has(source.path)) throw new StudioError('BAD_SOURCE', 'Choose project-relative .md or .txt files.');
    seen.add(source.path);
    const content = source.content;
    if (typeof content !== 'string' || !content.trim()) throw new StudioError('EMPTY_SOURCE', `${source.path} is empty.`);
    if (content.includes('\0')) throw new StudioError('BAD_SOURCE', `${source.path} is not a plain text file.`);
    return { path: source.path, content };
  });
  const total = sources.reduce((sum, source) => sum + source.content.length, 0);
  if (total > LIMITS.source) {
    throw new StudioError('SOURCE_TOO_LARGE', `The selected sources have ${total.toLocaleString('en-US')} characters; this build accepts ${LIMITS.source.toLocaleString('en-US')}. Nothing was truncated; select fewer or smaller sources.`);
  }
  const instructions = input.instructions ?? '';
  if (typeof instructions !== 'string' || instructions.length > LIMITS.instructions) {
    throw new StudioError('BAD_INSTRUCTIONS', `Instructions must be at most ${LIMITS.instructions} characters.`);
  }
  const options = CHOICES[format.key]?.options ?? [];
  const picked = input.choice ?? defaultChoice(format.key);
  if (picked !== null && !options.some((option) => option.id === picked)) throw new StudioError('BAD_CHOICE', 'Choose one of the offered options.');
  if (!input.model || !['providerID', 'id'].every((key) => typeof input.model[key] === 'string' && input.model[key].length > 0 && input.model[key].length <= 200)
      || (input.model.variant !== undefined && (typeof input.model.variant !== 'string' || input.model.variant.length > 200))) {
    throw new StudioError('NO_MODEL', 'Select an available generation model.');
  }
  if (JSON.stringify(input).length > LIMITS.request) throw new StudioError('REQUEST_TOO_LARGE', 'The encoded request exceeds the host bridge limit. Nothing was truncated.');
  return {
    id: input.id,
    format: format.key,
    sources,
    // Kept for callers that read one source: the first, or a combined label.
    source: sources.length === 1 ? sources[0] : { path: `${sources[0].path} + ${sources.length - 1} more`, content: sources.map((source) => source.content).join('\n\n') },
    instructions,
    choice: picked,
    preference: options.find((option) => option.id === picked)?.hint ?? '',
    model: { providerID: input.model.providerID, id: input.model.id, ...(input.model.variant ? { variant: input.model.variant } : {}) },
  };
}