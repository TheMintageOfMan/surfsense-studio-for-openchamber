// The one line that says where a file came from, used in every generated file. It names the
// sources plainly and leaves out model and file details, which stay under "About this".
import { displayName, joinNames } from './sources.mjs';

export function sourceNamesOf(record) {
  const files = (record.sources ?? (record.source ? [record.source] : [])).map((source) => displayName(source.path));
  return joinNames([...files, ...(record.chat ? ['this chat'] : [])]);
}

// A fixed locale keeps rebuilt files byte-identical on every machine.
export const madeOn = (createdAt) => new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export const provenanceLine = (names, createdAt) => `Made with SurfSense Studio from ${names} on ${madeOn(createdAt)}. Check it against the original before relying on it.`;
