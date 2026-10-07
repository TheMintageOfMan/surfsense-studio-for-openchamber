import { mountButton } from '@openchamber/sdk/ui';
import { el, slot } from './dom.js';

const LETTERS = 'ABCD';

export function renderQuiz(container, record, { saveProgress }) {
  const { questions } = record.artifact;
  const saved = record.progress?.answers;
  let answers = Array.isArray(saved) && saved.length === questions.length ? [...saved] : questions.map(() => null);

  const score = el('p', 'quiz-score');
  const list = el('ol', 'quiz');
  const actions = el('div', 'actions');
  const retake = mountButton(slot(actions), { label: 'Retake quiz', variant: 'secondary', size: 'sm', onClick: () => {
    answers = questions.map(() => null);
    paint();
    saveProgress({ answers });
  } });

  function paint() {
    const answered = answers.filter((answer) => answer !== null).length;
    const correct = answers.filter((answer, index) => answer === questions[index].answer).length;
    score.textContent = answered ? `Score: ${correct} right out of ${answered} answered (${questions.length} questions)` : `Pick an answer for each of the ${questions.length} questions.`;
    retake.update({ disabled: answered === 0 });
    list.replaceChildren(...questions.map((question, index) => {
      const item = el('li', 'quiz-item');
      const options = el('div', 'quiz-options');
      const chosen = answers[index];
      question.options.forEach((option, choice) => {
        const button = el('button', 'quiz-option', `${LETTERS[choice]}. ${option}`);
        button.type = 'button';
        if (chosen !== null) {
          button.disabled = true;
          if (choice === question.answer) button.dataset.result = 'correct';
          else if (choice === chosen) button.dataset.result = 'incorrect';
        }
        button.addEventListener('click', () => {
          if (answers[index] !== null) return;
          answers[index] = choice;
          paint();
          saveProgress({ answers });
        });
        options.append(button);
      });
      item.append(el('p', 'quiz-question', question.question), options);
      if (chosen !== null) {
        const verdict = chosen === question.answer
          ? 'Correct.'
          : `Incorrect. Answer: ${LETTERS[question.answer]}. ${question.options[question.answer].replace(/[.!?]+$/, '')}.`;
        item.append(el('p', 'quiz-feedback', `${verdict} ${question.explanation}`.trim()));
      }
      return item;
    }));
  }

  container.append(score, list, actions);
  paint();
  return { dispose() { retake.dispose(); } };
}
