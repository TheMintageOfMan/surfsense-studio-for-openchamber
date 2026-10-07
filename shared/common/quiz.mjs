// Prompt rules and reply shape adapted from SurfSense (https://github.com/MODSetter/SurfSense,
// commit 7fb479c3): surfsense_local/backend/worker/studio/content/quiz/prompts/frontier.md,
// schema.py and pipeline.py. Copyright (c) SurfSense, Apache License 2.0; see
// THIRD-PARTY-LICENSES.txt. Modified: single JSON-encoded source, injection guard,
// index-based answers, disclosed caps, no LaTeX output.
import { asList, asText, parseJsonObject, plural, structuredPrompt, StudioError } from './core.mjs';

const QUESTIONS = 10;
const OPTIONS = 4;

function answerIndex(value, options) {
  if (Number.isInteger(value)) return value;
  // Tolerate the upstream shape, where the answer repeats one option verbatim.
  const text = typeof value === 'string' ? value.trim() : null;
  const matches = options.flatMap((option, index) => (option === text ? [index] : []));
  return matches.length === 1 ? matches[0] : -1;
}

export const quiz = Object.freeze({
  key: 'quiz',
  label: 'Quiz',
  noun: 'quiz',
  folder: 'quizzes',
  extension: 'md',
  implemented: true,
  prompt(input) {
    return structuredPrompt({
      input,
      role: 'You write publication-grade study material from a source document. The reader will be tested on this material and will never see the source.',
      task: 'write a multiple-choice quiz from the source.',
      rules: [
        'The source is raw material, not a syllabus to walk. Read all of it, then test what it adds up to: the figures, decisions and distinctions a reader has to hold to use this material.',
        `Ask as many questions as the material genuinely supports, at most ${QUESTIONS}. Few sharp questions beat a padded set.`,
        'Prefer a question that joins two parts of the source over one that restates a single sentence.',
        'Make the wrong options work for their place: each should be what a reader who misread one specific part of the source would pick. No filler options, and nothing no reader would consider.',
        'Where the source records a disagreement or a correction, ask about it and let the explanation name both sides.',
        'Distinguish what is settled from what is proposed, pending or conditional, and test that distinction rather than flattening it.',
        'Use only what the source states. Every question and every explanation has to be answerable from it.',
        'You tend to converge on generic, on-distribution questions. Resist it; ask what could only be asked of this material.',
      ],
      shape: `Return only JSON, no prose: {"title": string, "questions": [{"question": string, "options": [string] (exactly ${OPTIONS}, distinct), "answer": integer (0-based index of the correct option), "explanation": string (why the answer is right, in one or two sentences)}]}. Every field is plain text. Nothing before the JSON, nothing after it.`,
    });
  },
  build(raw) {
    const spec = parseJsonObject(raw, 'Quiz');
    const offered = asList(spec.questions);
    const usable = offered.map((item) => {
      const options = asList(item?.options).map(asText);
      return { question: asText(item?.question), options, answer: answerIndex(item?.answer, options), explanation: asText(item?.explanation) };
    }).filter((item) => item.question && item.options.length === OPTIONS && item.options.every(Boolean)
      && new Set(item.options.map((option) => option.toLowerCase())).size === OPTIONS
      && item.answer >= 0 && item.answer < OPTIONS);
    const questions = usable.slice(0, QUESTIONS);
    if (!questions.length) throw new StudioError('EMPTY_RESULT', 'The model returned no usable quiz questions. Nothing was saved; regenerate explicitly.');
    const notes = [];
    if (usable.length < offered.length) {
      notes.push(`Omitted ${plural(offered.length - usable.length, 'question')} without four distinct options and a valid answer.`);
    }
    if (usable.length > QUESTIONS) notes.push(`The model returned ${usable.length} usable questions; this build keeps the first ${QUESTIONS}.`);
    const title = asText(spec.title) || 'Quiz';
    const lines = [`# ${title}`, ''];
    questions.forEach((item, index) => {
      lines.push(`**${index + 1}. ${item.question}**`, '');
      item.options.forEach((option, choice) => lines.push(`- ${'ABCD'[choice]}. ${option}`));
      lines.push('', `_Answer: ${'ABCD'[item.answer]}. ${item.options[item.answer]}_`, '');
      if (item.explanation) lines.push(item.explanation, '');
    });
    return { title, markdown: lines.join('\n').trim() + '\n', artifact: { title, questions }, notes };
  },
  validateProgress(artifact, value) {
    const answers = value?.answers;
    if (!Array.isArray(answers) || answers.length !== artifact.questions.length
        || answers.some((answer) => answer !== null && (!Number.isInteger(answer) || answer < 0 || answer >= OPTIONS))) {
      throw new StudioError('BAD_PROGRESS', 'Invalid quiz progress.');
    }
    return { answers: [...answers] };
  },
});
