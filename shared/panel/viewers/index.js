import { renderFlashcards } from './flashcards.js';
import { renderMindmap } from './mindmap.js';
import { renderQuiz } from './quiz.js';
import { renderSummary } from './summary.js';
import { renderWebpage } from './webpage.js';

const VIEWERS = {
  summary: renderSummary, flashcards: renderFlashcards, quiz: renderQuiz, mindmap: renderMindmap, webpage: renderWebpage,
};

export function renderViewer(container, record, api) {
  container.replaceChildren();
  const render = VIEWERS[record.format];
  if (!render) {
    container.textContent = 'This build cannot display this format.';
    return { dispose() {} };
  }
  return render(container, record, api);
}
