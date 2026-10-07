import { mountButton } from '@openchamber/sdk/ui';
import { el, slot } from './dom.js';

export function renderFlashcards(container, record, { saveProgress }) {
  const { cards } = record.artifact;
  const saved = record.progress;
  let position = Number.isInteger(saved?.position) && saved.position < cards.length ? saved.position : 0;
  const known = new Set((saved?.known ?? []).filter((index) => index < cards.length));
  let revealed = false;

  const counter = el('p', 'muted');
  const card = el('div', 'card');
  const front = el('p', 'card-front');
  const back = el('p', 'card-back');
  card.append(front, back);
  const actions = el('div', 'actions');
  const persist = () => saveProgress({ position, known: [...known] });
  const move = (delta) => { position += delta; revealed = false; paint(); persist(); };
  const buttons = {
    previous: mountButton(slot(actions), { label: 'Previous', variant: 'secondary', size: 'sm', onClick: () => move(-1) }),
    reveal: mountButton(slot(actions), { label: 'Reveal answer', size: 'sm', onClick: () => { revealed = !revealed; paint(); } }),
    next: mountButton(slot(actions), { label: 'Next', variant: 'secondary', size: 'sm', onClick: () => move(1) }),
    known: mountButton(slot(actions), { label: 'Mark known', variant: 'outline', size: 'sm', onClick: () => {
      if (known.has(position)) known.delete(position); else known.add(position);
      paint(); persist();
    } }),
    reset: mountButton(slot(actions), { label: 'Reset progress', variant: 'ghost', size: 'sm', onClick: () => {
      known.clear(); position = 0; revealed = false; paint(); persist();
    } }),
  };

  function paint() {
    counter.textContent = `Card ${position + 1} of ${cards.length} | Known: ${known.size} of ${cards.length}`;
    front.textContent = cards[position].front;
    back.textContent = cards[position].back;
    back.hidden = !revealed;
    buttons.reveal.update({ label: revealed ? 'Hide answer' : 'Reveal answer' });
    buttons.previous.update({ disabled: position === 0 });
    buttons.next.update({ disabled: position === cards.length - 1 });
    buttons.known.update({ label: known.has(position) ? 'Unmark known' : 'Mark known' });
  }

  container.append(counter, card, actions);
  paint();
  return { dispose() { Object.values(buttons).forEach((button) => button.dispose()); } };
}
