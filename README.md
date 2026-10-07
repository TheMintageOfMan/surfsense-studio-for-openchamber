# SurfSense Studio for OpenChamber v2

An independent, optional OpenChamber extension bringing SurfSense-style Studio capabilities to selected sources: summaries, flashcards, quizzes, mind maps, slides, documents, spreadsheets, web pages, PDFs, podcasts, images, and infographics.

Read [SPEC.md](SPEC.md) for the high-level specification, platform packaging, and optional Kokoro download design.

**Status:** Summary-only development build (1 of 12 formats implemented). Eight focused tests pass. On Windows, the installed extension, host-owned runtime, real model generation, history reopening after reload, and Markdown export are verified. Fedora is build-only and has not been runtime-tested.

## Install the development build

In OpenChamber **Settings > Extensions**, add the matching folder and approve project-file access and the local service:

- [Windows 11 x64](windows-11-x64/README.md)
- [Fedora amd64](linux-fedora-amd64/README.md), unverified on Fedora

The folders include built scripts and dependency licenses. Users do not install Node, Python, or a backend. Keep a folder installation in place; OpenChamber runs it from that folder. Do not install the repository root as an extension.

Open a project session, open **SurfSense Studio**, load one `.md` or `.txt` source, review the model, and generate. History is stored in `.studio/summaries/` inside that project. **Export Markdown** creates a new file in the project root and refuses to overwrite an existing file.

### Current boundaries

- Built against OpenChamber 2.1.1 and OpenCode 2.0.22. Only Summary is implemented; there are no placeholder implementations of the other formats.
- The first-pass model adapter uses the current guest frame's **loopback OpenChamber proxy** and verifies the active session/directory. It reads no credentials and never starts or discovers an unrelated OpenCode server.
- Password-protected, remote, and relay hosts are not supported by this adapter. They need an authenticated extension broker; authentication is never disabled or bypassed.
- Stateless generation uses **OpenCode's base configuration**, not project-specific model overrides. The selected model and active-session variant are shown; there is no Small Model fallback.
- Sources are limited to 32,000 characters and requests to the host bridge's size limit. Oversized inputs are rejected, not truncated. There is no automatic retry of a failed model call.
- Cancellation aborts Studio's request; a provider may still bill work already started. Closing the panel does not stop service-owned jobs.
- No Python/document worker, image adapter, or Kokoro download is included in this pass.

## Develop

Shared implementation is in `shared/`; `scripts/build.mjs` builds the two existing platform folders without duplicating source code. Node 22+ and npm are development tools only.

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache ./temp/npm-cache
npm test
npm run build
```

Run `npm run probe` from an OpenChamber agent shell for a read-only connection/model check. It does not generate text or print credentials. Unit tests use controlled transports; passing them does not establish live model or cross-platform compatibility.

The Windows live check summarized the complete `SPEC.md` with the model and variant selected in OpenChamber. Source identity and exported Markdown were checked with MD5. Cancellation and no-overwrite behavior were checked with controlled transports; no additional billable call was made just to test cancellation.

https://github.com/MODSetter/SurfSense
https://github.com/openchamber/openchamber

## Idea
- Incorporate the Studio from SurfSense into OpenChamber v2.
