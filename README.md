# SurfSense Studio for OpenChamber v2

An independent, optional OpenChamber extension bringing SurfSense-style Studio capabilities to selected sources: summaries, flashcards, quizzes, mind maps, slides, documents, spreadsheets, web pages, PDFs, podcasts, images, and infographics.

Read [SPEC.md](SPEC.md) for the high-level specification, platform packaging, and optional Kokoro download design, and [nextsteps.md](nextsteps.md) for the plan.

**Status:** Development build with 9 of 12 formats: Summary, Word, Slides, Spreadsheet, Web page, PDF, Mind map, Flashcards, and Quiz. Twenty focused tests pass. On Windows, the installed extension generated each format live from the complete `SPEC.md`; previews, study progress, history reopening, and exports were checked, and the Word, PowerPoint, and Excel exports opened in Microsoft Office without repair. Fedora is build-only and has not been runtime-tested.

## Install the development build

In OpenChamber **Settings > Extensions**, add the matching folder and approve project-file access and the local service:

- [Windows 11 x64](windows-11-x64/README.md)
- [Fedora amd64](linux-fedora-amd64/README.md), unverified on Fedora

The folders include built scripts and dependency licenses. Users do not install Node, Python, or a backend. Keep a folder installation in place; OpenChamber runs it from that folder. Do not install the repository root as an extension.

Open a project session, open **SurfSense Studio**, choose a format, load one `.md` or `.txt` source, review the model, and generate. History is stored per format under `.studio/` inside that project. Export creates a new file in the project root (`.md`, `.html`, `.docx`, `.pptx`, `.xlsx`, or `.pdf`) and refuses to overwrite an existing file. Document files are built once in the service, stored beside their record, and exported as those exact bytes.

| Format | Result | Limit |
|---|---|---|
| Summary | Structured Markdown brief | About 500 words requested |
| Flashcards | One card at a time with reveal and mark-known; progress is saved | 20 cards |
| Quiz | Four-option questions with scoring and explanations; progress is saved | 10 questions |
| Mind map | Zoomable, collapsible Markmap plus a text outline | 10 main branches, 6 levels |
| Web page | Self-contained HTML in an isolated, script-free preview; the export matches the preview | 10 sections |
| Word, PDF | Editable `.docx` or typeset `.pdf` with headings, paragraphs, bullets, and tables; outline preview | 12 sections; tables 8 columns x 50 rows |
| Slides | Editable 16:9 `.pptx` with a title slide and speaker notes; slide-card preview | 15 slides, 6 bullets each |
| Spreadsheet | `.xlsx` of tables taken from the source, missing values left empty, plus a Notes sheet; table preview | 10 sheets, 20 columns, 500 rows |

Podcast, Image, and Infographic appear as disabled tiles that state what they still need. They have no implementation yet.

### Current boundaries

- Built against OpenChamber 2.1.1 and OpenCode 2.0.22.
- The model adapter uses the current guest frame's **loopback OpenChamber proxy** and verifies the active session/directory. It reads no credentials and never starts or discovers an unrelated OpenCode server.
- Password-protected, remote, and relay hosts are not supported by this adapter. They need an authenticated extension broker; authentication is never disabled or bypassed.
- Stateless generation uses **OpenCode's base configuration**, not project-specific model overrides. Base models and the active session's model and variant are listed; there is no Small Model fallback.
- Sources are limited to 32,000 characters and requests to the host bridge's size limit. Oversized inputs are rejected, not truncated. There is no automatic retry of a failed model call.
- Structured replies are validated. Malformed JSON fails without saving; incomplete or excess items are omitted, and every omission is listed with the artifact.
- A live run with Claude Opus 5.5 at variant `max` returned no text through OpenCode's stateless route for all four structured formats. Studio reports this as an empty result. The same formats succeeded with GPT-6 Astra Ultrafast.
- Large mind maps are small in the side panel; zoom in, or open Studio as a full-screen extension page.
- Cancellation aborts Studio's request; a provider may still bill work already started. Closing the panel does not stop service-owned jobs.
- Document previews show the content the file was built from, not a rendering of the file. PDF characters the bundled DejaVu Sans font cannot draw appear as "?" and are listed in the notes.
- No Python is used. No image adapter or Kokoro download is included yet.

## Develop

Shared implementation is in `shared/`; `scripts/build.mjs` builds the two existing platform folders without duplicating source code. Node 22+ and npm are development tools only.

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache ./temp/npm-cache
npm test
npm run build
```

Run `npm run probe` from an OpenChamber agent shell for a read-only connection/model check. It does not generate text or print credentials. Unit tests use controlled transports; passing them does not establish live model or cross-platform compatibility.

Live Windows checks generated every implemented format from the complete `SPEC.md` through the installed extension. Source identity and exports were checked with MD5. Cancellation and no-overwrite behavior were checked with controlled transports; no billable call was made just to test cancellation.

Flashcards, Quiz, Mind map, and Web page adapt SurfSense's Apache-2.0 prompts (the document prompts are this project's own) and reply shapes; each adapted file names its source, and each package's `THIRD-PARTY-LICENSES.txt` carries the notice.

https://github.com/MODSetter/SurfSense
https://github.com/openchamber/openchamber

## Idea
- Incorporate the Studio from SurfSense into OpenChamber v2.
