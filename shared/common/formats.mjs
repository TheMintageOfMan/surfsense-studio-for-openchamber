import { LIMITS, requireJobId, StudioError, validSourcePath } from './core.mjs';
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

export function validateJob(input) {
  if (!input || typeof input !== 'object') throw new StudioError('BAD_INPUT', 'A Studio request is required.');
  requireJobId(input.id);
  const format = formatFor(input.format);
  if (!validSourcePath(input.source?.path)) throw new StudioError('BAD_SOURCE', 'Choose a project-relative .md or .txt file.');
  const content = input.source.content;
  if (typeof content !== 'string' || !content.trim()) throw new StudioError('EMPTY_SOURCE', 'The selected source is empty.');
  if (content.includes('\0')) throw new StudioError('BAD_SOURCE', 'The source is not a plain text file.');
  if (content.length > LIMITS.source) {
    throw new StudioError('SOURCE_TOO_LARGE', `This development build accepts ${LIMITS.source.toLocaleString('en-US')} source characters. Nothing was truncated; select a smaller source.`);
  }
  const instructions = input.instructions ?? '';
  if (typeof instructions !== 'string' || instructions.length > LIMITS.instructions) {
    throw new StudioError('BAD_INSTRUCTIONS', `Instructions must be at most ${LIMITS.instructions} characters.`);
  }
  if (!input.model || !['providerID', 'id'].every((key) => typeof input.model[key] === 'string' && input.model[key].length > 0 && input.model[key].length <= 200)
      || (input.model.variant !== undefined && (typeof input.model.variant !== 'string' || input.model.variant.length > 200))) {
    throw new StudioError('NO_MODEL', 'Select an available generation model.');
  }
  if (JSON.stringify(input).length > LIMITS.request) throw new StudioError('REQUEST_TOO_LARGE', 'The encoded request exceeds the host bridge limit. Nothing was truncated.');
  return {
    id: input.id,
    format: format.key,
    source: { path: input.source.path, content },
    instructions,
    model: { providerID: input.model.providerID, id: input.model.id, ...(input.model.variant ? { variant: input.model.variant } : {}) },
  };
}
