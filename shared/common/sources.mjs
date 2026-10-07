// File types Studio can read, shared by the panel (to list files) and the service (to read them).
export const SOURCE_KINDS = Object.freeze({
  text: { extractor: 'text', extensions: ['md', 'markdown', 'txt', 'text', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'log', 'ini', 'toml'] },
  html: { extractor: 'html', extensions: ['html', 'htm'] },
  docx: { extractor: 'docx', extensions: ['docx'] },
  pdf: { extractor: 'pdf', extensions: ['pdf'] },
  pptx: { extractor: 'pptx', extensions: ['pptx'] },
  xlsx: { extractor: 'xlsx', extensions: ['xlsx'] },
});

const BY_EXTENSION = new Map(Object.entries(SOURCE_KINDS).flatMap(([kind, entry]) => entry.extensions.map((extension) => [extension, kind])));
export const SOURCE_EXTENSIONS = Object.freeze([...BY_EXTENSION.keys()]);

export function sourceKind(path) {
  const extension = String(path).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? BY_EXTENSION.get(extension) ?? null : null;
}

// The current chat is offered as a source under this reserved name; it is not a file.
export const CHAT_SOURCE = 'chat:current';
// Larger chats are sent as compressed context instead (shared/service/chat.mjs).
export const CHAT_LIMIT = 10_000;
