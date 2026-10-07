# SurfSense Studio for OpenChamber v2

## High-level product and architecture specification

**Version:** 0.2  
**Date:** 2026-10-06  
**Status:** Draft specification. A Windows development build implements 10 of 12 formats: Summary, Word, Slides, Spreadsheet, Web page, PDF, Mind map, Flashcards, Quiz, and Infographic. See [README.md](README.md) for what has been validated. The media and audio formats and cross-platform runtime validation have not been completed.

**Changes in 0.2:** Office and PDF files are built by trusted JavaScript builders inside the Studio service; Studio no longer plans a self-packaged Python runtime. The model connection route is settled for local hosts, and password-protected, remote, and relay hosts are out of scope.

## 1. Purpose

Create an independently distributed, optional OpenChamber extension that turns selected sources into the 12 Studio formats offered by SurfSense. Reuse suitable SurfSense concepts and code without requiring the SurfSense application or embedding its entire backend.

The extension should feel native to OpenChamber while owning its generation workflow, interactive viewers, artifact history, and runtime components.

## 2. Agreed requirements

1. **Optional extension, not an OpenChamber feature bundled at setup.** Install, version, release, enable, and disable Studio independently. No OpenChamber installer changes, core fork, or mandatory inclusion in OpenChamber.
2. **Platform-specific distribution.** Produce separate packages for supported OS/CPU combinations, sharing one codebase, extension identity, version scheme, and feature contract.
3. **Self-contained means no separately installed software prerequisites.** Users must not install Python, Node, Docker, Microsoft Office, LibreOffice, SurfSense, a separate OpenCode plugin, or a separately managed backend to use Studio.
4. **Networked models are expected.** Text and image generation can use configured external model endpoints. Self-contained does not mean offline, anonymous, or free of provider credentials and usage charges.
5. **Dependencies are Studio-owned.** Bundle required components or, where explicitly supported, download complete runtime packs through Studio itself. No user-run package-manager commands or compilation.
6. **Kokoro is an optional post-install download.** Do not include its runtime/model payload in the base extension. A user chooses when to install the complete audio pack through Studio.
7. **All 12 formats remain in scope.** A missing model or optional runtime disables only the affected formats, with an actionable explanation.
8. **No application modification is authorized by this specification.** Implementation, installation, and configuration are separate work.
9. **No self-packaged Python.** DOCX, PPTX, XLSX, and PDF files are built by trusted JavaScript builders that run in the Studio service on OpenChamber's own runtime.
10. **Local hosts only.** Studio supports a local OpenChamber desktop host whose proxy accepts the extension's requests as configured. Password-protected, remote, and relay hosts are not supported, and Studio never bypasses authentication to reach them.

## 3. Scope and boundaries

### Included

- A right-rail Studio panel with the 12-format grid, source selection, optional generation instructions, job status, artifact history, and previews.
- A larger/full-screen extension view for reading or interacting with artifacts.
- Explicit source selection from supported project files and OpenChamber message/session actions.
- Text-model and image-model integration, JavaScript document builders, and optional local Kokoro speech generation.
- Saving/exporting real artifacts, regeneration, cancellation, and persistent flashcard/quiz progress.
- Independent platform packages and extension-managed runtime lifecycle.

### Not included

- A full SurfSense installation, notebook database, crawler, connector catalog, embedding system, or retrieval platform.
- Full Word, PowerPoint, or Excel editing inside OpenChamber. Editable output files and previews are required; an embedded Office suite is not.
- Bundled text-generation or image-generation model weights, GPU drivers, or a new general-purpose model server.
- A bundled Python runtime or frozen Python worker.
- Password-protected, remote, and relay OpenChamber hosts.
- A separately installed OpenCode plugin or MCP server as a prerequisite. Agent-callable Studio tools can be considered later without blocking the graphical extension.
- Mobile or VS Code extension support, which the inspected OpenChamber extension host does not currently provide.
- Guaranteed support for every OS release, Linux distribution, CPU, or GPU.

## 4. Formats and expected results

Every generation uses the selected sources and model configuration. Outputs must not be replaced by screenshots of otherwise editable documents. Library names for unbuilt formats are proposed choices; confirm license, bundling, and output quality when each format is built.

| ID | Format | Required result and interaction | Required components | Status |
|---|---|---|---|---|
| F01 | Summary | Structured Markdown brief, readable in Studio and exportable as text/Markdown. | Text model. | Built |
| F02 | Flashcards | Validated question/answer deck, one card at a time, with reveal and persistent study progress. | Text model and deck viewer. | Built |
| F03 | Quiz | Multiple-choice questions, correct answers, explanations, scoring, and persistent progress. | Text model and quiz viewer. | Built |
| F04 | Mind map | Zoomable, collapsible Markmap with a readable/exportable outline. | Text model and bundled Markmap. | Built |
| F05 | Slides | Editable `.pptx` with actual slide content, plus preview and file export. | Text model and the `pptxgenjs` 4.0.1 PPTX builder. | Built |
| F06 | Document | Editable `.docx` report with structured headings, paragraphs, and supported tables. | Text model and the `docx` 9.9.0 DOCX builder. | Built |
| F07 | Spreadsheet | Editable `.xlsx` containing tables extracted from sources; missing values remain missing or explicitly identified. | Text model and the `write-excel-file` 4.1.1 XLSX builder. | Built |
| F08 | Web page | Self-contained `.html` with bundled/inline presentation assets and isolated preview. | Text model and trusted HTML builder. | Built |
| F09 | PDF | Typeset `.pdf`, with preview and file export. | Text model and the `pdfkit` 0.20.2 PDF builder with bundled Inter 4.1. | Built |
| F10 | Podcast | Two-host spoken conversation, transcript, audio player, and exported audio. WAV is the baseline; MP3/ffmpeg is not required. | Text model and optional downloaded Kokoro audio pack. | Planned |
| F11 | Image | An illustration based on the selected material, with preview and image-file export. | Text model for the brief/prompt and a configured image model. | Planned |
| F12 | Infographic | A single-panel visual summary based on a factual brief, with preview and image-file export. | Text model and `@antv/infographic` 0.2.20, drawn in a service worker thread; no image model. | Built |

Office previews may differ from Microsoft Office's rendering. Exported files must nevertheless be structurally valid and editable in compatible applications. Image and infographic outputs are not promised to be editable diagrams or to reproduce text perfectly.

**Document builder choices (pass 3).** All four libraries are MIT-licensed, pure JavaScript, and make no network calls when given text only. `exceljs` 4.4.0 was rejected: last published in 2024 with deprecated dependencies, and much heavier than `write-excel-file`, whose only dependency is `fflate`. Noto Sans and Open Sans were rejected because they lack glyphs for common symbols such as U+2192; Inter 4.1 (SIL OFL) has 2,852 characters including arrows and math symbols, and replaced DejaVu Sans so that every output uses one font. pdfkit's standard fonts are never loaded (`font: null`), so no metric file is read from disk after bundling. Characters the font cannot draw become "?" and are disclosed in the artifact notes. fontkit's WOFF2 decoder (`brotli`) is replaced at build time by a stub because only TrueType fonts are embedded. Builders rewrite ZIP entry times and `docProps/core.xml` dates from the record's `createdAt`, so rebuilding an artifact gives identical bytes; Word's embedded-font key is derived from the font bytes for the same reason. Previews render the validated artifact, not the file; `pdf.js` or `docx-preview` rendering was not added.

## 5. User workflow

### Installation and setup

1. Obtain the package for the OS/architecture of the OpenChamber host running Studio.
2. Install through Settings > Extensions, using ZIP installation only when the base package meets the host's limits. Otherwise, extract the distribution archive and use Add folder.
3. Approve the declared capabilities, including the local service where required.
4. Select/configure text and image model connections as needed. Never require a system-wide runtime installation.
5. Leave Kokoro uninstalled unless podcast generation is wanted.

Folder installs run from their selected location, so that location must remain available. Independent releases do not imply automatic updates: folder-based installations follow OpenChamber's folder-install behavior.

### Generation

1. Open Studio, or invoke its action on a message/session.
2. Select sources and a format; optionally provide focus, length, or format-specific instructions.
3. Review the selected model, source scope, and any missing prerequisite.
4. Start generation explicitly. Do not make billable generation calls merely because the panel opens.
5. View job status, then open, export, or regenerate the result. Cancel a running job when needed.

A podcast additionally requires the audio pack and a two-speaker brief/voice selection. If the pack is absent, show Download Kokoro instead of a generation failure.

### Job and artifact behavior

- Capture the project/session, source selection, options, and model at submission. Switching projects must not redirect an existing job.
- Show queued, running, completed, failed, cancelled, and interrupted states as applicable.
- Keep work independent of panel visibility. Host shutdown or service failure must leave an explicit interrupted/failed state, not a permanently running entry.
- Persist enough metadata to explain the result and regenerate it. Regeneration produces a new generation record and resets associated study progress.
- Recover quietly within a fixed budget. Each request makes at most three model calls: the chosen model twice, then the recommended known-good model once. Every try is recorded in the artifact's details. There is no other automatic retry. Image and audio calls are not retried automatically.
- Require confirmation before overwriting an existing user file or deleting artifacts/runtime data.

## 6. Sources and grounding

The source contract is normalized text plus a source locator. Implemented inputs: project files read by the service (text and data formats, HTML, DOCX via Mammoth, PDF via PDF.js with no OCR, PPTX and XLSX via the bundled ZIP reader) and the current chat only. A chat over 10,000 characters is sent as compressed context: OpenCode's own compaction summary when it fits, otherwise a summary from OpenCode's non-mutating session generation (POST /api/session/:id/generate). Arbitrary PDF/Office ingestion is not implied by support for generating those output formats; additional input parsers must be explicitly included and packaged.

- Read only sources the user selected or explicitly granted to the extension. Opening a panel does not grant unrestricted conversation access.
- Use OpenChamber's message/session actions and conversation capability for session content. Detect and disclose incomplete or truncated host snapshots.
- Record which sources and source versions were used. Preserve readable source references in artifacts where the format permits.
- Do not silently apply SurfSense's current 24,000-character excerpting policy and describe the result as full-document coverage.
- When sources exceed supported context, use a disclosed multi-pass strategy or require a narrower selection. Report processed versus selected coverage and any omissions.
- Treat source text as material to analyze, not instructions authorizing execution or additional access. Do not fabricate source data or fill spreadsheet gaps with invented values.

## 7. Architecture

### A. OpenChamber extension UI

A prebuilt browser bundle using `@openchamber/sdk` and its UI kit, with host styling. Owns the format grid, source picker, job/artifact views, study interactions, model settings, and runtime-download controls.

Ship browser code in the host-supported bundled format, including required viewer libraries, fonts, icons, and styles. No runtime compilation or CDN-hosted executable code. Custom file-editor contributions are optional; core viewing must work within Studio.

### B. Bundled service coordinator

A JavaScript service declared in the extension manifest and launched through OpenChamber's own runtime. No separate Node installation, manually launched server, administrator service registration, or fixed public port.

Responsibilities: authenticated host communication, jobs, model adapters, document builders, artifact storage, runtime downloads, and worker lifecycle. Start optional heavy workers only when required; explicitly clean up owned subprocesses on cancellation, shutdown, and failure.

### C. Document builders

Trusted JavaScript builders inside the service render validated structured model output into DOCX, PPTX, XLSX, and PDF files with bundled libraries and fonts. There is no Python runtime, Office automation, LibreOffice conversion, Docker, or model-written code. Do not copy SurfSense's unsandboxed Office/PDF `exec()` runner.

- The model returns JSON in a format-specific shape. Studio validates it, discloses omitted or capped items, and fails without saving when the reply is unusable.
- Builders are deterministic for a given artifact. Generated files live in the project's Studio history and are exported by exclusive creation, never overwriting user files.
- Builder libraries and fonts are bundled into the base package and must carry license notices. Measure the package against the host's ZIP limits; Add folder remains the fallback.

### D. Model adapters

- **Text (settled for local hosts):** Studio uses the guest frame's local OpenChamber origin as a proxy to the active OpenCode v2 instance. It verifies the active session and its directory, lists models from OpenCode's base configuration, and calls OpenCode's stateless generation route with the selected model. It reads no credentials, never starts or discovers another OpenCode server, and refuses hosts that require authentication.
- Default to an automatic model choice, with an override in settings. Do not assume the host's Small Model API is sufficient. A switch to the fallback model is recorded in the artifact's details.
- **Images (open):** configure a separate image-generation connection. A text or vision-input model is not automatically an image-output model, and OpenCode's generation route returns text only.
- Keep credentials in an appropriate host/server-side credential store, never in release archives, source bundles, artifact files, or iframe messages.

### E. Optional Kokoro pack

Package the audio runtime together with Kokoro model weights, voice assets, phonemizer dependencies, and applicable licenses. CPU-capable operation is the baseline; no CUDA or dedicated GPU requirement. Prefer a runtime that needs no per-platform native binaries where its speed and memory are acceptable; otherwise ship platform-specific packs.

## 8. Kokoro download and lifecycle

1. Default state is Not installed. Podcast explains the requirement; the other 11 formats do not depend on it.
2. On Download Kokoro, show the applicable platform, actual download size, required disk space, publisher/source, and destination before proceeding.
3. Download the complete version-pinned pack directly through Studio's service to its private data area. Do not transfer the binary payload through the iframe message bridge or OpenChamber's extension ZIP importer.
4. Verify release authenticity and integrity, extract safely, and run a bounded compatibility/health check before marking the pack Ready.
5. Show progress and useful failures, with cancellation/retry. Partial or incompatible downloads must not be executed or marked ready.
6. Retain valid packs across extension upgrades and restarts. A pack update must not silently discard the last usable version.
7. Start and stop the audio process automatically when needed. Provide explicit, confirmed removal of downloaded audio data without deleting generated artifacts.

This is an extension-managed component installation, not an external software prerequisite. No Python installation, compiler, package manager, PATH change, or user-managed audio server is involved.

## 9. Platform distribution and portability

Windows, Linux, and macOS are release goals. The exact architecture and minimum OS matrix must be published after runtime validation; support for one architecture must not be represented as support for all architectures of that OS.

Without a Python worker, the base extension is JavaScript running on OpenChamber's runtime. One shared build produces every platform folder; each folder carries a platform guard and is a separate distribution. Every advertised platform still needs runtime qualification of paths, fonts, file writes, and process cleanup. Platform-specific native work applies only to optional runtime packs, if one needs native code.

Use one source repository and consistent extension identity across platform distributions. Test the actual shipped payload, not only the development environment.

Release archives must contain prebuilt application components. End users must not run `pip`, `npm`, `uv`, `apt`, `brew`, a compiler, or an OS dependency installer. Build-machine dependencies are not end-user dependencies.

Select optional runtime packs using the executing host's OS/architecture. Reject a mismatched package clearly before starting native code. Use relative application paths and a stable, user-writable data location; do not depend on a developer machine's paths or working directory.

## 10. Host constraints and packaging decisions

These are observations from the inspected repository revisions, not promised limits for every future OpenChamber release.

| Observed constraint | Design consequence |
|---|---|
| Local-path/URL extension ZIPs: 20 MiB archive limit. ZIP extraction: 40 MiB expanded and 500 files. Browser uploads have a separate upload limit but use the same extractor. | Measure each base package's compressed size, expanded size, and file count. With document builders, the infographic renderer and fonts, each platform folder is about 4.6 MB expanded in 13 files and about 2.0 MB as a ZIP. |
| Folder installs do not use the extension ZIP extractor. | Complete extracted-folder distributions are the supported fallback without modifying OpenChamber. |
| `host.generate`: Small Model, 64,000-character prompt, 4,000 output tokens, 90-second wait. | Not used for Studio generation. Studio uses OpenCode's stateless route with an explicit model. |
| Panel service requests: 64,000-character request body, 256,000-character text response, normal 20-second timeout. | Submit asynchronous jobs and exchange bounded status/metadata. Keep binary files on the service side; use bounded chunk transfer only where a preview needs file bytes. |
| Standard SDK file methods are text-oriented; extension storage is bounded. | Keep binary artifacts and runtime packs on disk. Small host storage is not a model or artifact store. |
| Extension services have full user privileges, while the iframe is sandboxed. | Request explicit service approval and enforce Studio's own file/network boundaries. Declared service permissions are not an OS sandbox. |
| Extensions run on desktop/web, not current mobile/VS Code hosts. | State these limits in distribution and compatibility information. |
| OpenCode's stateless generation route takes one prompt and returns text, with no output-budget control. A live Claude Opus 5.5 run at variant `max` returned no text for structured formats. | Report empty replies clearly, never retry automatically, and let the user choose another model or no variant. |

Large-file preview/export must use a proven host-compatible path, such as service-backed files and bounded transfers, while respecting iframe policy. A universal native binary-streaming API is not assumed to exist.

**Packaging decision:** Prefer normal independent ZIP installation when the measured base fits; otherwise retain Add folder as the no-host-change path. An OpenChamber installer change is not a prerequisite or part of this project.

## 11. Data, safety, and licensing

- Separate immutable application files, downloaded runtime packs, settings/job metadata, and generated artifacts. Extension updates must not overwrite user artifacts or unnecessarily redownload valid packs.
- Keep artifact identity, source references, generation options, model identity, status, output paths, and study progress. Make the artifact library portable through ordinary files and exportable metadata; do not transfer provider secrets with it.
- Make storage locations visible. Disabling Studio stops its processes; deleting generated content or packs requires explicit user confirmation.
- Send source material only to model endpoints selected for the operation. Do not expose service tokens, credentials, or source text in diagnostic logs. No unrelated telemetry is required.
- Validate model output and escape/sandbox generated HTML. Do not execute source-supplied commands or model-written code. Missing optional capabilities must fail locally to that feature, not prevent Studio from opening.
- Studio is licensed under Apache-2.0 (LICENSE, NOTICE; copyright TheMintageOfMan). Preserve relevant Apache-2.0 notices and modification attribution for reused SurfSense Studio code and applicable OpenChamber/SDK notices. Exclude unrelated proprietary SurfSense code.
- Ship license text for every bundled library and font; the build fails when a bundled package lacks it. Review redistribution rights for every model and voice. Retaining eSpeak-ng introduces GPL distribution obligations; permissive licensing of Studio source does not eliminate those obligations.

## 12. Acceptance criteria

Release qualification must cover every advertised OS/architecture and all 12 formats; do not infer platform coverage from a development-machine test.

| Area | Required evidence |
|---|---|
| Independent installation | Install and run as an optional extension on a clean supported OpenChamber host, without modifying OpenChamber setup or core code. |
| No external installations | No system Python, separate Node installation, Docker, Office, LibreOffice, SurfSense, separately installed plugin, or manually managed backend is required. |
| Platform packaging | Correct platform guard and optional pack selection, declared OS/CPU compatibility, bundled fonts, and working paths on each advertised target. |
| Format coverage | F01-F12 each produce the specified real result from supplied sources. Office files are editable and open in compatible applications, not slide/page screenshots; interactive viewers behave as specified. |
| Models | Text and image routes use intended providers with correct authentication. Long-job behavior is not falsely represented as supported by the Small Model shortcut alone. |
| Sources | Only intended sources are read; coverage and omissions are visible; truncated session/source input is not presented as complete. |
| Optional audio | Without Kokoro, Studio and unrelated formats work. Download, verification, activation, failure handling, and subsequent podcast generation work through the extension alone. |
| Jobs and files | Long jobs avoid bridge timeouts; cancellation/interruption is visible; large artifacts can be retrieved/exported without truncation. |
| Persistence and lifecycle | Restart/update preserves artifacts, study state, and compatible runtime packs; owned subprocesses are cleaned up. |
| Safety and licenses | No arbitrary generated-code execution or secret leakage; runtime authenticity checks and applicable redistribution materials are present. |

Acceptance is not yet proven. No performance, installation-size, or "works everywhere" claim should be published before measurement on the release payloads.

## 13. Delivery sequence and open decisions

### Implementation sequence

1. **Qualify boundaries:** done on Windows for local-host model access, the host-launched service, source handoff, and artifact transfer. Package sizes must be re-measured as libraries are added.
2. **Core Studio:** done on Windows: panel, format grid, sources, jobs/history, Summary, Flashcards, Quiz, Mind map, and Web page.
3. **Documents:** done on Windows: JavaScript DOCX, PPTX, XLSX, and PDF builders with previews and exports.
4. **Media (next):** image/infographic adapters and the optional Kokoro download, activation, and podcast workflow.
5. **Release qualification:** run the acceptance criteria across the complete advertised platform matrix.

This sequence does not remove any format from the complete product scope.

### Settled decisions

- Studio is an optional, independently distributed extension with no OpenChamber fork or installer change.
- No self-packaged Python; document formats use JavaScript builders in the service.
- Text generation uses the local OpenChamber proxy, OpenCode's base model catalog, and its stateless route. Password-protected, remote, and relay hosts are out of scope.
- Document builders: `docx`, `pptxgenjs`, `write-excel-file`, and `pdfkit`; panel previews render the validated artifact (see section 4).
- One font everywhere: Inter 4.1 (OFL), replacing DejaVu Sans. Embedded in the panel, previews, PDF, Word, web pages and infographic SVG/PNG; named only in PPTX and XLSX, which these libraries cannot embed.
- Infographics are drawn by AntV Infographic from a model-chosen layout on a checked allowlist, not by an image model. Icons come from AntV's keyword icon service; PNG is rasterized in the panel because the library sets text in SVG `foreignObject`.

### Decisions still open

- Exact supported CPU architectures, minimum OS/libc versions, and minimum OpenChamber/OpenCode versions.
- Whether true file rendering (`pdf.js`, `docx-preview`) is worth its bundle size and iframe-policy cost.
- The image-generation provider and how its credentials are held.
- The Kokoro runtime (pure JavaScript/WebAssembly or native packs), pack hosting, and signing.
- Additional source input formats, if any, beyond text/Markdown and selected conversation snapshots.
- Release artifact naming, dependency redistribution materials, and upgrade/data-retention behavior.

## 14. Source basis

Source inspection used SurfSense commit `7fb479c361414e1ffd180860eb0b5eb5afb0c4e3` and OpenChamber commit `de84da29e9a742e10a64af102119f125fb4471af`. The requirements above include intentional design changes; they are not a claim that upstream already implements this extension.

- [SurfSense Studio architecture and all 12 formats](https://github.com/MODSetter/SurfSense/blob/7fb479c361414e1ffd180860eb0b5eb5afb0c4e3/docs/architecture/studio.md)
- [SurfSense native packaging and audio dependencies](https://github.com/MODSetter/SurfSense/blob/7fb479c361414e1ffd180860eb0b5eb5afb0c4e3/docs/architecture/packaging.md)
- [SurfSense Office runner being replaced](https://github.com/MODSetter/SurfSense/blob/7fb479c361414e1ffd180860eb0b5eb5afb0c4e3/surfsense_local/backend/worker/studio/office/runner.py)
- [SurfSense license](https://github.com/MODSetter/SurfSense/blob/7fb479c361414e1ffd180860eb0b5eb5afb0c4e3/LICENSE) and [OpenChamber license](https://github.com/openchamber/openchamber/blob/de84da29e9a742e10a64af102119f125fb4471af/LICENSE)
- [OpenChamber extension SDK](https://docs.openchamber.dev/sdk/) and [Host API](https://docs.openchamber.dev/sdk/host/)
- [OpenChamber local-service contract](https://github.com/openchamber/openchamber/blob/de84da29e9a742e10a64af102119f125fb4471af/packages/sdk/GUEST_SERVICES.md)
- [SDK request/generation limits](https://github.com/openchamber/openchamber/blob/de84da29e9a742e10a64af102119f125fb4471af/packages/sdk/src/contract.ts)
- [ZIP extraction limits](https://github.com/openchamber/openchamber/blob/de84da29e9a742e10a64af102119f125fb4471af/packages/web/server/lib/guests/extract-zip.js) and [installation paths/archive limits](https://github.com/openchamber/openchamber/blob/de84da29e9a742e10a64af102119f125fb4471af/packages/web/server/lib/guests/install.js)
- [OpenCode V2 authenticated client/service API](https://opencode.ai/v2/docs/build/client) and [stateless generation implementation, v2.0.22](https://github.com/anomalyco/opencode/blob/v2.0.22/packages/core/src/generate.ts)
