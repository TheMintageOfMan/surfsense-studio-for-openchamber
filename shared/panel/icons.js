// Fixed, trusted SVG markup (no model or user text), 24x24 line icons in currentColor.
const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  summary: svg('<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>'),
  docx: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  pptx: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>'),
  xlsx: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>'),
  webpage: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9 6.5h.01"/>'),
  pdf: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 17v-4h1.5a1.5 1.5 0 0 1 0 3H9"/>'),
  mindmap: svg('<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M10.2 10.2 6.4 6.4M13.8 10.2l3.8-3.8M10.2 13.8l-3.8 3.8M13.8 13.8l3.8 3.8"/>'),
  flashcards: svg('<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>'),
  podcast: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  infographic: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back: svg('<path d="M15 18 9 12l6-6"/>'),
  save: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5"/>'),
  retry: svg('<path d="M4 12a8 8 0 1 1 2.3 5.7M4 20v-5h5"/>'),
  file: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
};

// Friendly names, colors and one-line descriptions for the tiles. Grid order follows FORMATS.
export const TILES = {
  summary: { name: 'Summary', color: '#4f7cff', blurb: 'The key points' },
  docx: { name: 'Report', color: '#2b6cd8', blurb: 'Word document' },
  pptx: { name: 'Slides', color: '#e8743b', blurb: 'PowerPoint deck' },
  xlsx: { name: 'Data table', color: '#1f9d6b', blurb: 'Excel spreadsheet' },
  webpage: { name: 'Web page', color: '#8a5cf6', blurb: 'A page to share' },
  pdf: { name: 'PDF', color: '#d64545', blurb: 'Ready to print' },
  mindmap: { name: 'Mind map', color: '#0fa3b1', blurb: 'See how ideas connect' },
  flashcards: { name: 'Flashcards', color: '#e0a400', blurb: 'Practice and remember' },
  quiz: { name: 'Quiz', color: '#d6457a', blurb: 'Test yourself' },
  podcast: { name: 'Podcast', color: '#7a7f87', blurb: 'Coming soon' },
  image: { name: 'Picture', color: '#7a7f87', blurb: 'Coming soon' },
  infographic: { name: 'Infographic', color: '#f06d3a', blurb: 'One-page poster' },
};

// What a finished item is called in messages: "Your quiz is ready".
export const NOUNS = {
  summary: 'summary', docx: 'report', pptx: 'slides', xlsx: 'data table', webpage: 'web page', pdf: 'PDF',
  mindmap: 'mind map', flashcards: 'flashcards', quiz: 'quiz', infographic: 'infographic',
};
