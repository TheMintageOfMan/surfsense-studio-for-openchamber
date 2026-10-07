// Prompt rules and reply shape adapted from SurfSense (https://github.com/MODSetter/SurfSense,
// commit 7fb479c3): surfsense_local/backend/worker/studio/content/flashcards/prompts/frontier.md
// and pipeline.py. Copyright (c) SurfSense, Apache License 2.0; see THIRD-PARTY-LICENSES.txt.
// Modified: single JSON-encoded source, injection guard, disclosed caps, no LaTeX output.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const CARDS = 20;

export const flashcards = Object.freeze({
  key: 'flashcards',
  label: 'Flashcards',
  noun: 'flashcards',
  folder: 'flashcards',
  extension: 'md',
  implemented: true,
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You write publication-grade study material from a source document. The reader will revise from these cards and will never see the source.',
      task: 'make study flashcards from the source.',
      rules: [
        'The source is raw material, not a glossary to transcribe. Read all of it, then card what a reader has to hold to use this material: the figures, definitions and distinctions that carry weight.',
        `Write as many cards as the material genuinely supports, at most ${CARDS}. A short deck covering what matters beats a padded one.`,
        'The front asks one thing and reads as a question. The back answers it in one or two sentences and stops.',
        'Prefer the card a reader would get wrong before revising. Skip anything obvious from the title alone.',
        'Where the source records a disagreement or a correction, make that a card and let the back name both sides.',
        'Distinguish what is settled from what is proposed, pending or conditional, and keep that distinction on the back.',
        'Use only what the source states. No outside knowledge, no plausible filler.',
        'You tend to converge on generic, on-distribution cards. Resist it; write the deck only this material could produce.',
      ],
      shape: 'Return only JSON, no prose: {"title": string, "cards": [{"front": string, "back": string}]}. Every field is plain text. Nothing before the JSON, nothing after it.',
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Flashcards');
    const offered = asList(spec.cards);
    const usable = offered.map((card) => ({ front: asText(card?.front), back: asText(card?.back) }))
      .filter((card) => card.front && card.back);
    const cards = usable.slice(0, CARDS);
    if (!cards.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable flashcards. Nothing was saved; regenerate explicitly.');
    const notes = [];
    if (usable.length < offered.length) notes.push(`Left out ${plural(offered.length - usable.length, 'incomplete card')}.`);
    if (usable.length > CARDS) notes.push(`Kept the first ${CARDS} of ${usable.length} cards.`);
    const title = asText(spec.title) || 'Flashcards';
    const lines = [`# ${title}`, ''];
    cards.forEach((card, index) => lines.push(`**${index + 1}. ${card.front}**`, '', card.back, ''));
    return { title, markdown: lines.join('\n').trim() + '\n', artifact: { title, cards }, notes };
  },
  validateProgress(artifact, value) {
    const count = artifact.cards.length;
    const { position, known } = value ?? {};
    if (!Number.isInteger(position) || position < 0 || position >= count || !Array.isArray(known)
        || known.some((index) => !Number.isInteger(index) || index < 0 || index >= count)
        || new Set(known).size !== known.length) {
      throw new StudioError('BAD_PROGRESS', 'Invalid flashcard progress.');
    }
    return { position, known: [...known].sort((a, b) => a - b) };
  },
});
