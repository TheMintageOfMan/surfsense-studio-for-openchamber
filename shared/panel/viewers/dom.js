export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// SDK UI controls mount into an element they own.
export const slot = (parent) => parent.appendChild(document.createElement('div'));
