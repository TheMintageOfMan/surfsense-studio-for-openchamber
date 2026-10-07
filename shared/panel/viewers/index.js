import { renderDocument } from './documents.js';
import { renderFlashcards } from './flashcards.js';
import { renderInfographic } from './infographic.js';
import { renderMindmap } from './mindmap.js';
import { renderQuiz } from './quiz.js';
import { renderSummary } from './summary.js';
import { renderWebpage } from './webpage.js';

const VIEWERS = {
  summary: renderSummary, flashcards: renderFlashcards, quiz: renderQuiz, mindmap: renderMindmap, webpage: renderWebpage,
  docx: renderDocument, pptx: renderDocument, xlsx: renderDocument, pdf: renderDocument, infographic: renderInfographic,
};

export function renderViewer(container, record, api) {
  container.replaceChildren();
  const render = VIEWERS[record.format];
  if (!render) {
    container.textContent = 'Studio cannot show this here.';
    return { dispose() {} };
  }
  return render(container, record, api);
}
