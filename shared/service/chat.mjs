// The current chat as a source. Only the active session is ever read, and only when the user
// ticks it. Small chats go as they are; larger ones go as compressed context (see chatSource).
import { createHash } from 'node:crypto';
import { StudioError } from '../common/core.mjs';
import { CHAT_LIMIT } from '../common/sources.mjs';

const SUMMARY_TARGET = 8_000;

// Readable conversation text: the compaction summary, then user and assistant words.
// Reasoning, tool calls and tool output are left out; they are working notes, not the chat.
export function transcript(messages) {
  const lines = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.type === 'compaction' && message.status === 'completed') {
      const summary = [message.summary, message.recent].filter((text) => typeof text === 'string' && text.trim()).join('\n\n');
      if (summary) lines.push(`Earlier in this chat (summary):\n${summary.trim()}`);
    } else if (message?.type === 'user' && typeof message.text === 'string' && message.text.trim()) {
      lines.push(`User: ${message.text.trim()}`);
    } else if (message?.type === 'assistant' && Array.isArray(message.content)) {
      const text = message.content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text.trim()).filter(Boolean).join('\n');
      if (text) lines.push(`Assistant: ${text}`);
    }
  }
  return lines.join('\n\n').trim();
}

const SUMMARY_PROMPT = [
  'Write a compressed context of this whole conversation for someone who will turn it into study material.',
  'Keep every decision, fact, figure, name, open question and result that matters; drop chatter, tool output and repetition.',
  `Use plain text with short paragraphs or bullet points. Stay under ${SUMMARY_TARGET.toLocaleString('en-US')} characters.`,
  'Write only the summary.',
].join(' ');

// Measures the chat for the source list without any model call.
export async function measureChat(connection) {
  const text = transcript(await connection.chatContext());
  if (!text) return { available: false, reason: 'This chat has no messages yet.' };
  return { available: true, characters: Math.min(text.length, CHAT_LIMIT), compressed: text.length > CHAT_LIMIT };
}

// The text sent as the chat source, and how it was made:
// - full: the active context fits in CHAT_LIMIT. If OpenCode compacted the chat, that context
//   already starts with OpenCode's own summary.
// - compressed: OpenCode summarizes the session context (POST /api/session/:id/generate),
//   which uses the chat's model and may be billed, but never changes the chat.
export async function chatSource(connection, signal) {
  const full = transcript(await connection.chatContext());
  if (!full) throw new StudioError('EMPTY_CHAT', 'This chat has no messages yet.');
  const digest = createHash('md5').update(full).digest('hex');
  if (full.length <= CHAT_LIMIT) return { content: full, how: 'full', characters: full.length, md5: digest };
  let summary;
  try { summary = (await connection.summarizeChat(SUMMARY_PROMPT, signal))?.trim(); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new StudioError('CHAT_SUMMARY_FAILED', 'Studio could not shorten this chat. Try again, or untick the chat.');
  }
  if (!summary) throw new StudioError('CHAT_SUMMARY_FAILED', 'Studio could not shorten this chat. Try again, or untick the chat.');
  if (summary.length > CHAT_LIMIT) throw new StudioError('CHAT_SUMMARY_FAILED', 'The shortened chat was still too long. Try again, or untick the chat.');
  return { content: summary, how: 'compressed', characters: summary.length, md5: digest, fullCharacters: full.length };
}
