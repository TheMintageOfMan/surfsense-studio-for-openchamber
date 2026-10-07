# SurfSense Studio for OpenChamber v2

## High-level product and architecture specification

**Version:** 0.1  
**Date:** 2026-10-06  
**Status:** Draft specification based on the agreed discussion and source inspection. No implementation, package-size measurement, or cross-platform runtime validation has been completed.

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

## 3. Scope and boundaries

### Included

- A right-rail Studio panel with the 12-format grid, source selection, optional generation instructions, job status, artifact history, and previews.
- A larger/full-screen extension view for reading or interacting with artifacts.
- Explicit source selection from supported project files and OpenChamber message/session actions.
- Text-model and image-model integration, document generation workers, and optional local Kokoro speech generation.
- Saving/exporting real artifacts, regeneration, cancellation, and persistent flashcard/quiz progress.
- Independent platform packages and extension-managed runtime lifecycle.

### Not included

- A full SurfSense installation, notebook database, crawler, connector catalog, embedding system, or retrieval platform.
- Full Word, PowerPoint, or Excel editing inside OpenChamber. Editable output files and previews are required; an embedded Office suite is not.
- Bundled text-generation or image-generation model weights, GPU drivers, or a new general-purpose model server.
- A separately installed OpenCode plugin or MCP server as a prerequisite. Agent-callable Studio tools can be considered later without blocking the graphical extension.
- Mobile or VS Code extension support, which the inspected OpenChamber extension host does not currently provide.
- Guaranteed support for every OS release, Linux distribution, CPU, or GPU.

## 4. Formats and expected results

Every generation uses the selected sources and model configuration. Outputs must not be replaced by screenshots of otherwise editable documents.

| ID | Format | Required result and interaction | Required components |
|---|---|---|---|
| F01 | Summary | Structured Markdown brief, readable in Studio and exportable as text/Markdown. | Text model. |
| F02 | Flashcards | Validated question/answer deck, one card at a time, with reveal and persistent study progress. | Text model and deck viewer. |
| F03 | Quiz | Multiple-choice questions, correct answers, explanations, scoring, and persistent progress. | Text model and quiz viewer. |
| F04 | Mind map | Zoomable, collapsible Markmap with a readable/exportable outline. | Text model and bundled Markmap. |
| F05 | Slides | Editable `.pptx` with actual slide content, plus preview and file export. | Text model and document worker using `python-pptx`. |
| F06 | Document | Editable `.docx` report with structured headings, paragraphs, and supported tables. | Text model and document worker using `python-docx` and `lxml`. |
| F07 | Spreadsheet | Editable `.xlsx` containing tables extracted from sources; missing values remain missing or explicitly identified. | Text model and document worker using `openpyxl`. |
| F08 | Web page | Self-contained `.html` with bundled/inline presentation assets and isolated preview. | Text model and trusted HTML builder. |
| F09 | PDF | Typeset `.pdf`, with preview and file export. | Text model and document worker using ReportLab. |
| F10 | Podcast | Two-host spoken conversation, transcript, audio player, and exported audio. WAV is the baseline; MP3/ffmpeg is not required. | Text model and optional downloaded Kokoro audio pack. |
| F11 | Image | An illustration based on the selected material, with preview and image-file export. | Text model for the brief/prompt and a configured image model. |
| F12 | Infographic | A single-panel visual summary based on a factual brief, with preview and image-file export. | Text model and a configured image model. |

Office previews may differ from Microsoft Office's rendering. Exported files must nevertheless be structurally valid and editable in compatible applications. Image and infographic outputs are not promised to be editable diagrams or to reproduce text perfectly.

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
- Do not silently repeat billable image/audio work after an ambiguous failure. Retrying is an explicit user action.
- Require confirmation before overwriting an existing user file or deleting artifacts/runtime data.

## 6. Sources and grounding

The initial source contract is normalized text plus a title and source locator. The proposed initial inputs are text/Markdown project files and explicitly selected message/session snapshots. Arbitrary PDF/Office ingestion is not implied by support for generating those output formats; additional input parsers must be explicitly included and packaged.

- Read only sources the user selected or explicitly granted to the extension. Opening a panel does not grant unrestricted conversation access.
- Use OpenChamber's message/session actions and conversation capability for session content. Detect and disclose incomplete or truncated host snapshots.
- Record which sources and source versions were used. Preserve readable source references in artifacts where the format permits.
- Do not silently apply SurfSense's current 24,000-character excerpting policy and describe the result as full-document coverage.
- When sources exceed supported context, use a disclosed multi-pass strategy or require a narrower selection. Report processed versus selected coverage and any omissions.
- Treat source text as material to analyze, not instructions authorizing execution or additional access. Do not fabricate source data or fill spreadsheet gaps with invented values.

## 7. Architecture

### A. OpenChamber extension UI

A prebuilt TypeScript/React panel using `@openchamber/sdk`, with appropriate host styling. Owns the format grid, source picker, job/artifact views, study interactions, model settings, and runtime-download controls.

Ship browser code in the host-supported bundled format, including required viewer libraries, fonts, icons, and styles. No runtime compilation or CDN-hosted executable code. Custom file-editor contributions are optional; core viewing must work within Studio.

### B. Bundled service coordinator

A JavaScript service declared in the extension manifest and launched through OpenChamber's own runtime. No separate Node installation, manually launched server, administrator service registration, or fixed public port.

Responsibilities: authenticated host communication, jobs, model adapters, artifact storage, runtime downloads, and worker lifecycle. Start heavy workers only when required; explicitly clean up owned subprocesses on cancellation, shutdown, and failure.

For remote instances, service execution, source access, storage, and runtime downloads occur on the selected server, not necessarily the desktop showing the panel.

### C. Document worker

A slim, platform-specific frozen Python distribution containing its interpreter, document libraries, native dependencies, templates, and fonts. A PyInstaller directory-style build is the proposed packaging approach; copying a development virtual environment is not acceptable.

Use validated structured model output and trusted builders. Do not copy SurfSense's unsandboxed Office/PDF `exec()` runner. Generate files directly, without Office automation, LibreOffice conversion, or Docker.

Bundle the document worker in the base distribution by default. A separately downloaded, Studio-managed document pack is a contingency only if measured package size requires it; that decision remains open.

### D. Model adapters

- Reuse configured OpenChamber/OpenCode text providers through supported authenticated APIs where possible.
- Support an explicit generation-model selection appropriate to the job; do not assume the host's Small Model API is sufficient for every format.
- Configure a separate image-generation connection. A text or vision-input model is not automatically an image-output model.
- Keep credentials in an appropriate host/server-side credential store, never in release archives, source bundles, artifact files, or iframe messages.
- Connect to the correct selected OpenCode instance. Do not assume a default port, start an unrelated server, or silently change global provider settings.

Authenticated generation from the extension's service to the selected OpenCode instance is an implementation gate, not a connection already proven by this research. No mandatory separately installed plugin may be introduced without revising this specification.

### E. Optional Kokoro pack

Package the platform-specific audio executable and native libraries together with Kokoro model weights, voice assets, phonemizer dependencies, and applicable licenses. CPU-capable operation is the baseline; no CUDA or dedicated GPU requirement.

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

Windows, Linux, and macOS are release goals. The exact architecture and minimum OS matrix must be published after build validation; support for one architecture must not be represented as support for all architectures of that OS.

| Platform | Required packaging work |
|---|---|
| Windows | Build for each supported CPU architecture; include required DLLs/runtimes; validate paths and child-process cleanup; sign native releases as appropriate. |
| Linux | Build for each supported CPU architecture; declare a minimum libc/OS baseline; preserve executable permissions and required libraries. Musl support is a separate target, not implied by a glibc build. |
| macOS | Build independently for supported Apple Silicon/Intel targets; include compatible native libraries; define a minimum OS version and signing/notarization process. |

Use one source repository and consistent extension identity across platform distributions. Produce artifacts on suitable platform build machines and test the actual shipped payload, not only the development environment.

Release archives must contain prebuilt application components. End users must not run `pip`, `npm`, `uv`, `apt`, `brew`, a compiler, or an OS dependency installer. Build-machine dependencies are not end-user dependencies.

Select runtime packs using the executing host's OS/architecture. Reject a mismatched package clearly before starting native code. Use relative application paths and a stable, user-writable data location; do not depend on a developer machine's paths or working directory.

## 10. Host constraints and packaging decisions

These are observations from the inspected repository revisions, not promised limits for every future OpenChamber release.

| Observed constraint | Design consequence |
|---|---|
| Local-path/URL extension ZIPs: 20 MiB archive limit. ZIP extraction: 40 MiB expanded and 500 files. Browser uploads have a separate upload limit but use the same extractor. | Measure the base package's compressed size, expanded size, and file count. Optional Kokoro removes its payload, but does not prove the Python worker/viewers fit. |
| Folder installs do not use the extension ZIP extractor. | Complete extracted-folder distributions are the supported fallback without modifying OpenChamber. |
| `host.generate`: Small Model, 64,000-character prompt, 4,000 output tokens, 90-second wait. | Use it only where suitable. Prove a supported generation route for larger jobs and explicit model selection. |
| Panel service requests: 64,000-character request body, 256,000-character text response, normal 20-second timeout. | Submit asynchronous jobs and exchange bounded status/metadata. Use bounded chunk transfer where necessary; never send an entire podcast or large binary as one response. |
| Standard SDK file methods are text-oriented; extension storage is bounded. | Keep binary artifacts and runtime packs on disk. Small host storage is not a model or artifact store. |
| Extension services have full user privileges, while the iframe is sandboxed. | Request explicit service approval and enforce Studio's own file/network boundaries. Declared service permissions are not an OS sandbox. |
| Extensions run on desktop/web, not current mobile/VS Code hosts. | State these limits in distribution and compatibility information. |

Large-file preview/export must use a proven host-compatible path, such as service-backed files and bounded transfers, while respecting iframe policy. A universal native binary-streaming API is not assumed to exist.

**Packaging decision:** Prefer normal independent ZIP installation if the measured base fits. Otherwise retain Add folder as the no-host-change path. An optional document-worker download may be evaluated; an OpenChamber installer change is not a prerequisite or part of this project.

## 11. Data, safety, and licensing

- Separate immutable application files, downloaded runtime packs, settings/job metadata, and generated artifacts. Extension updates must not overwrite user artifacts or unnecessarily redownload valid packs.
- Keep artifact identity, source references, generation options, model identity, status, output paths, and study progress. Make the artifact library portable through ordinary files and exportable metadata; do not transfer provider secrets with it.
- Make storage locations and remote-host behavior visible. Disabling Studio stops its processes; deleting generated content or packs requires explicit user confirmation.
- Send source material only to model endpoints selected for the operation. Do not expose service tokens, credentials, or source text in diagnostic logs. No unrelated telemetry is required.
- Validate model output and escape/sandbox generated HTML. Do not execute source-supplied commands or model-written Python. Missing optional capabilities must fail locally to that feature, not prevent Studio from opening.
- Preserve relevant Apache-2.0 notices and modification attribution for reused SurfSense Studio code and applicable OpenChamber/SDK notices. Exclude unrelated proprietary SurfSense code.
- Review redistribution rights for every native library, model, voice, and font. Retaining eSpeak-ng introduces GPL distribution obligations; permissive licensing of Studio source does not eliminate those obligations.

## 12. Acceptance criteria

Release qualification must cover every advertised OS/architecture and all 12 formats; do not infer platform coverage from a development-machine test.

| Area | Required evidence |
|---|---|
| Independent installation | Install and run as an optional extension on a clean supported OpenChamber host, without modifying OpenChamber setup or core code. |
| No external installations | No system Python, separate Node installation, Docker, Office, LibreOffice, SurfSense, separately installed plugin, or manually managed backend is required. |
| Platform packaging | Correct worker/pack selection, declared OS/CPU compatibility, native-library availability, and working paths on each advertised target. |
| Format coverage | F01-F12 each produce the specified real result from supplied sources. Office files are editable, not slide/page screenshots; interactive viewers behave as specified. |
| Models | Text and image routes use intended providers with correct authentication. Long-job behavior is not falsely represented as supported by the Small Model shortcut alone. |
| Sources | Only intended sources are read; coverage and omissions are visible; truncated session/source input is not presented as complete. |
| Optional audio | Without Kokoro, Studio and unrelated formats work. Download, verification, activation, failure handling, and subsequent podcast generation work through the extension alone. |
| Jobs and files | Long jobs avoid bridge timeouts; cancellation/interruption is visible; large artifacts can be retrieved/exported without truncation. |
| Persistence and lifecycle | Restart/update preserves artifacts, study state, and compatible runtime packs; owned subprocesses are cleaned up. |
| Safety and licenses | No arbitrary generated-code execution or secret leakage; runtime authenticity checks and applicable redistribution materials are present. |

Acceptance is not yet proven. No performance, installation-size, or "works everywhere" claim should be published before measurement on the release payloads.

## 13. Delivery sequence and open decisions

### Implementation sequence

1. **Qualify boundaries:** prove host/authenticated model access, worker startup/cleanup, source handoff, artifact transfer, and base-package sizes on the intended platforms.
2. **Core Studio:** panel, sources, jobs/history, Summary, Flashcards, Quiz, Mind map, and Web page.
3. **Documents:** trusted DOCX, PPTX, XLSX, and PDF builders with previews/exports and self-contained packaging.
4. **Media:** image/infographic adapters and optional Kokoro download, activation, and podcast workflow.
5. **Release qualification:** run the acceptance criteria across the complete advertised platform matrix.

This sequence does not remove any format from the complete product scope.

### Decisions to settle during qualification

- Exact supported CPU architectures, minimum OS/libc versions, and minimum OpenChamber/OpenCode versions.
- The authenticated generation route for the selected OpenCode instance and initial image-provider protocol(s).
- Actual base-package sizes and whether the document worker remains bundled or needs a Studio-managed pack.
- Additional source input formats, if any, beyond text/Markdown and selected conversation snapshots.
- Release artifact naming, runtime-pack publishing/signing, dependency redistribution materials, and upgrade/data-retention behavior.

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
- [OpenCode V2 authenticated client/service API](https://opencode.ai/v2/docs/build/client)
