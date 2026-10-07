# SurfSense Studio for OpenChamber v2

Turn your notes into study material and documents with one tap. SurfSense Studio is an independent, optional extension for [OpenChamber](https://github.com/openchamber/openchamber). It takes the documents in a project (text, Markdown, Word, PDF, PowerPoint, Excel, including the old 97-2003 formats, CSV, JSON, web pages and more) and, if you like, the current chat, and makes summaries, flashcards, quizzes, mind maps, web pages, Word reports, slide decks, spreadsheets, PDFs and infographics from them, using the AI models you already have in OpenChamber.

It is built for everyone. A curious ten-year-old should be able to use it, and so should a history professor who knows nothing about AI, or someone who is not comfortable with computers. Pick your files, tap a tile, open the result, save it. Studio uses plain words without talking down to anyone, chooses sensible defaults, and quietly recovers from most problems. Technical details are there for people who want them, under **About this**.

> **Status: development build, 10 of 12 formats.** Tested on Windows 11 x64 with OpenChamber 2.1.1 and OpenCode 2.0.22. The Fedora build is produced but has not been run on Linux. Podcast and Picture are planned. See [Project status](#project-status).

## Contents

- [What it reads](#what-it-reads)
- [What it makes](#what-it-makes)
- [Install](#install)
- [Use](#use)
- [How it works](#how-it-works)
- [Privacy and network use](#privacy-and-network-use)
- [Limits and known issues](#limits-and-known-issues)
- [Develop](#develop)
- [Project status](#project-status)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## What it reads

| Source | File types | How the text is read |
|---|---|---|
| Text and data | `.md`, `.markdown`, `.txt`, `.text`, `.csv`, `.tsv`, `.json`, `.jsonl`, `.xml`, `.yaml`, `.yml`, `.log`, `.ini`, `.toml` | As written (UTF-8) |
| Web pages | `.html`, `.htm` | Readable text only; scripts and styles are dropped |
| Word | `.docx` | [Mammoth](https://github.com/mwilliamson/mammoth.js) |
| PDF | `.pdf` | [PDF.js](https://github.com/mozilla/pdf.js) text, page by page |
| PowerPoint | `.pptx` | Slide text and speaker notes, in slide order |
| Excel | `.xlsx` | Every sheet, row by row; dates and times shown as dates, not day numbers |
| Office 97-2003 | `.doc`, `.xls`, `.ppt` | Studio's own reader for the old binary formats (no extra library): document text, every sheet with dates, slides with notes |
| This chat | The OpenChamber chat Studio is open beside | See below |

Studio looks in the project folder and up to two folders down, skipping tool folders such as `node_modules` and boilerplate such as license files. A file it cannot use is still listed, greyed out, with the reason: for example a scanned PDF with no text, a password-protected file or a damaged one.

**This chat.** The current chat (only this one, and only when ticked) can be a source. Studio reads the chat's words, not its tool output. A chat of up to 10,000 characters goes as it is. If OpenCode has already compacted the chat, Studio uses OpenCode's own summary plus the messages after it. A longer chat is shortened first: Studio asks OpenCode to summarize it from the session's context. That uses the chat's model, may be billed, and never changes the chat itself. **About this** says when this happened.

## What it makes

| Tile | Result | Options | Limits |
|---|---|---|---|
| Summary | Structured Markdown brief | Short, Standard, Long | About 500 words by default |
| Report (Word) | Editable `.docx` with headings, paragraphs, bullets and tables | Shorter, Standard, Longer | 12 sections; tables up to 8 columns x 50 rows |
| Slides | Editable 16:9 `.pptx` with a title slide and speaker notes | Short deck, Standard | 15 slides, 6 bullets each |
| Data table (Excel) | `.xlsx` of tables found in the source, missing values left empty, plus a Notes sheet | Focus only | 10 sheets, 20 columns, 500 rows |
| Web page | Self-contained `.html` page with no scripts | Shorter, Standard, Longer | 10 sections |
| PDF | Typeset `.pdf` ready to print | Shorter, Standard, Longer | 12 sections |
| Mind map | Zoomable, collapsible map plus a text outline | Simple, Detailed | 10 branches, 6 levels |
| Flashcards | One card at a time with reveal and "mark known"; progress is saved | Fewer, Standard, More | 20 cards |
| Quiz | Four-option questions with scoring and explanations; progress is saved | Easy, Medium, Hard | 10 questions |
| Infographic | One-page poster in one of 16 layouts (steps, timeline, roadmap, cycle, pyramid, funnel, cards, list, compare, SWOT, pie, columns, bars, tree); saved as PNG and SVG | Simple, Detailed | 8 items; long text is shortened and the cut is marked |
| Podcast | Planned: two-speaker audio with an optional Kokoro voice pack | | |
| Picture | Planned: an illustration from an image model | | |

Each tile's **Options** button also has an optional "What should it focus on?" box. Everything Studio makes uses one font, **Inter**, so the panel, previews and files look alike.

## Install

Studio is installed as a folder. Users do not install Node, Python, Office or any server.

1. Download or clone this repository.
2. In OpenChamber, open **Settings > Extensions** and choose **Add folder**.
3. Pick the folder for your computer:
   - [`windows-11-x64/`](windows-11-x64/README.md) (tested)
   - [`linux-fedora-amd64/`](linux-fedora-amd64/README.md) (built, not yet tested on Linux)
4. Approve project-file access and the local service when asked.

Keep the folder where it is: OpenChamber runs the extension from that location. Do not add the repository root as an extension.

## Use

1. Open a chat in a project, then open **SurfSense Studio** from the right-hand rail.
2. Under **Sources**, tick the files to use, and **This chat** if you want the conversation included. Studio ticks a sensible set of files for you and remembers your choice. It will not let you tick more text than it can send.
3. Tap a tile to make something with the default settings. Or tap the tile's **Options** button to choose one simple setting and, if you like, say what to focus on.
4. Your item appears under **Your creations** with a spinner, then a "ready" message. You can make up to three things at once.
5. Tap an item to open it. Tap **Save** to put a copy in the project folder, named after its title, such as `Planets quiz.md` or `How a seed grows.png`. Saving never overwrites a file; a second copy becomes `(2)`.
6. **About this**, under each item, shows the sources, the AI model and any changes Studio made, such as text it shortened or left out. The files themselves only say which sources they were made from and when; they never mention AI models or file paths.

The gear in the top corner chooses the AI model. **Automatic** is the default and the recommended choice.

## How it works

Studio has two parts, both shipped in the platform folder and run by OpenChamber:

- **Panel** (`panel/`): the screen you use. It runs in OpenChamber's sandboxed extension frame.
- **Service** (`service/`): a small JavaScript program that OpenChamber starts with its own runtime. It talks to the AI, checks the replies, builds the files and keeps the history.

When you tap a tile:

1. The panel sends the ticked file names, with your choice and focus, to the service. The service reads the files itself, so it can open PDFs and Office files that the sandboxed panel cannot. It also reads the chat if ticked, shortening it through OpenCode when it is long.
2. The service asks the AI model for a structured reply (JSON for most formats) through OpenChamber's local connection to OpenCode. It never reads or stores credentials.
3. The service checks the reply strictly. Anything incomplete or over a limit is dropped or shortened, and every change is listed under **About this**. Nothing the model writes is ever run as code.
4. If the reply is unusable, Studio quietly tries again: the chosen model twice, then the recommended model once. That is at most three AI calls per tap, and every try is recorded.
5. Trusted builders turn the checked content into the file:
   - Word: [docx](https://github.com/dolanmiu/docx), with Inter embedded.
   - Slides: [PptxGenJS](https://github.com/gitbrent/PptxGenJS).
   - Excel: [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file).
   - PDF: [PDFKit](https://github.com/foliojs/pdfkit), with Inter embedded.
   - Infographic: [AntV Infographic](https://github.com/antvis/Infographic), run in its own background thread.
   - Mind map: [Markmap](https://github.com/markmap/markmap).
   - Web page: a fixed template that escapes every piece of text.
6. History is saved per format under `.studio/` in the project, so it survives restarts and can be reopened, studied or saved again.

Infographic PNGs are drawn in the panel, because the library places text in a way only a browser can rasterize. The PNG is then sent to the service in pieces and saved.

## Privacy and network use

- **Your files and the chat** (only when ticked) go only to the AI model you chose (or Automatic picked), through your local OpenChamber and OpenCode connection. A long chat is first summarized by OpenCode with the chat's own model. Your model provider's terms and charges apply. Studio adds no telemetry.
- **Infographic icons** are looked up by keyword on AntV's icon service (`weavefox.cn`). Only the single icon word the model chose, such as `leaf`, is sent; your documents are not. Without a connection the infographic is drawn without icons.
- Studio works only with OpenChamber on the same computer. Password-protected, remote and relay hosts are not supported, and Studio never bypasses authentication.

## Limits and known issues

- Selected sources can total 200,000 characters of text (about 50,000 words), up to 50 files; the chat counts as at most 10,000. Studio refuses rather than cutting a source short.
- No OCR: a scanned PDF has no text to read. Files over 25 MB, encrypted files and pre-1997 Office formats are not read. In old `.doc` files only the main text is read (not headers, footnotes or comments). PDFs in East Asian scripts may lack text because PDF.js character maps are not bundled.
- **Automatic** uses a model verified with every format when one is available (GPT-6 Astra Ultrafast on the test machine). Otherwise it uses the chat's model without a reasoning variant. A Claude Opus 5.5 run at variant `max` returned empty text for structured formats through OpenCode's stateless route.
- PowerPoint and Excel files name the Inter font but cannot carry it, so those apps substitute a font where Inter is not installed. Word, PDF, web pages and infographics carry Inter with them.
- PDF characters Inter cannot draw, such as emoji, appear as `?` and are listed under **About this**.
- Document previews show the content the file was built from, not a pixel-perfect rendering of the file.
- Large mind maps are small in the side panel; zoom in or open Studio full screen.
- Stopping a job cancels Studio's request, but the AI provider may still charge for work already started.

## Develop

All source code is in `shared/`. `scripts/build.mjs` builds both platform folders from it, so never edit the platform folders by hand. Node 22 or later and npm are needed for development only.

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache ./temp/npm-cache
npm test        # controlled tests, no AI calls
npm run build   # rebuilds windows-11-x64/ and linux-fedora-amd64/
```

| Path | What it holds |
|---|---|
| `shared/common/` | Format definitions, prompts and reply checks, shared by panel and service |
| `shared/panel/` | Panel screen, viewers and styles |
| `shared/service/` | Service: HTTP bridge, jobs, storage, OpenCode adapter, file builders |
| `shared/fonts/` | Inter font files, license and text-measurement data |
| `shared/licenses/` | License notices for bundled packages that ship none |
| `scripts/` | Build, read-only connection probe, font-metrics generator |
| `tests/` | Controlled tests for every format, recovery, storage and the service |

`npm run probe`, run from an OpenChamber agent shell, makes a read-only connection and model check. It does not generate text or print credentials. Passing the controlled tests does not prove live model behaviour or other platforms. [SPEC.md](SPEC.md) holds the full specification and design decisions; [nextsteps.md](nextsteps.md) holds the working plan; [AGENTS.md](AGENTS.md) guides AI coding agents.

## Project status

**Checked live on Windows** through the installed extension:
- All ten formats generated from real project files, including PDF, Word, PowerPoint, CSV, HTML, the old `.doc`, `.xls` and `.ppt` formats, and the current chat (compressed by OpenCode).
- Previews, study progress, history, quiet recovery, and saving.
- Word, PowerPoint and Excel files opened in Microsoft Office without repair. Exported files matched the stored files byte for byte (MD5).
- Infographic PNG and SVG saving.

**Not yet done:**
- Podcast and Picture.
- Testing on Linux and macOS.
- Clean-machine install and upgrade tests.
- Release packaging.

## Acknowledgements

Studio stands on the work of many people. Thank you all.

**Inspiration and foundations**

- [SurfSense](https://github.com/MODSetter/SurfSense) by MODSetter and contributors: the Studio concept and its twelve formats. The prompt rules and reply shapes for Flashcards, Quiz, Mind map and Web page are adapted from SurfSense under the Apache License 2.0; each adapted file names its source.
- [OpenChamber](https://github.com/openchamber/openchamber): the host application, its extension SDK and UI kit (`@openchamber/sdk`, MIT).
- [OpenCode](https://github.com/sst/opencode): the agent runtime and model connection Studio generates through.
- [Google NotebookLM](https://notebooklm.google.com/): the design inspiration for the simple Studio panel of tiles and creations. No NotebookLM code or assets are used.

**Libraries bundled in the extension**

- [AntV Infographic](https://github.com/antvis/Infographic) by the AntV team at Ant Group (MIT), its icon service, and its dependencies:
  - [D3](https://github.com/d3/d3) by Mike Bostock and contributors (ISC).
  - [@antv/layout](https://github.com/antvis/layout) and [@antv/hierarchy](https://github.com/antvis/hierarchy) (MIT).
  - [linkedom](https://github.com/WebReflection/linkedom) by Andrea Giammarchi (ISC).
  - [measury](https://github.com/Aarebecca/measury) (MIT).
  - [Rough.js](https://github.com/rough-stuff/rough) by Preet Shihn (MIT).
  - [culori](https://github.com/Evercoder/culori) by Dan Burzo (MIT).
  - [PostCSS](https://github.com/postcss/postcss) by Andrey Sitnik (MIT).
  - [htmlparser2](https://github.com/fb55/htmlparser2) and related packages by Felix Boehm (MIT, BSD-2-Clause).
  - [lodash](https://github.com/lodash/lodash) (MIT).
  - [TinyColor](https://github.com/bgrins/TinyColor) (MIT).
- [docx](https://github.com/dolanmiu/docx) by Dolan Miu (MIT).
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS) by Brent Ely (MIT).
- [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file) by catamphetamine (MIT).
- [PDFKit](https://github.com/foliojs/pdfkit) and [fontkit](https://github.com/foliojs/fontkit) by Devon Govett and the foliojs contributors (MIT).
- [JSZip](https://github.com/Stuk/jszip) by Stuart Knightley (used under MIT) and [pako](https://github.com/nodeca/pako) (MIT and Zlib).
- [fflate](https://github.com/101arrowz/fflate) by Arjun Barrett (MIT).
- [Markmap](https://github.com/markmap/markmap) by Gerald Liu (MIT).
- [marked](https://github.com/markedjs/marked) by Christopher Jeffrey and the MarkedJS team (MIT).
- [DOMPurify](https://github.com/cure53/DOMPurify) by Mario Heiderich and Cure53 (used under Apache-2.0).
- [PDF.js](https://github.com/mozilla/pdf.js) by Mozilla and contributors (Apache-2.0).
- [Mammoth](https://github.com/mwilliamson/mammoth.js) by Michael Williamson (BSD-2-Clause), with its helpers [lop](https://github.com/mwilliamson/lop), [dingbat-to-unicode](https://github.com/mwilliamson/dingbat-to-unicode), [@xmldom/xmldom](https://github.com/xmldom/xmldom), [Underscore](https://github.com/jashkenas/underscore) and [xmlbuilder](https://github.com/oozcitak/xmlbuilder-js).
- [entities](https://github.com/fb55/entities) by Felix Boehm (BSD-2-Clause).
- Many smaller packages, each listed with its full license text in the platform folder's `THIRD-PARTY-LICENSES.txt`.

**Font**

- [Inter](https://github.com/rsms/inter) by Rasmus Andersson and the Inter Project Authors, under the SIL Open Font License 1.1.

**Development tools (not shipped)**

- [esbuild](https://github.com/evanw/esbuild) by Evan Wallace (MIT) builds the bundles.
- [python-docx](https://github.com/python-openxml/python-docx), [python-pptx](https://github.com/scanny/python-pptx), [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl) and [pypdf](https://github.com/py-pdf/pypdf) were used only to check generated files during development.

Product names are trademarks of their owners. This project is independent and is not affiliated with or endorsed by SurfSense, OpenChamber, OpenCode, Google or AntV.

## License

Copyright 2026 TheMintageOfMan.

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for attributions. Bundled third-party packages keep their own licenses, listed in each platform folder's `THIRD-PARTY-LICENSES.txt`. The Inter font stays under the [SIL Open Font License 1.1](shared/fonts/Inter-LICENSE.txt).
