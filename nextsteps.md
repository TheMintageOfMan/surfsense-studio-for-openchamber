# Next steps

Plan for the next working session. Read [SPEC.md](SPEC.md), [README.md](README.md), and [AGENTS.md](AGENTS.md) first.

## 1. Where things stand

- `main` holds the specification (v0.2) and a development build with 5 of 12 formats: Summary, Flashcards, Quiz, Mind map, and Web page. The other 7 formats are disabled grid tiles.
- Verified on Windows 11 x64 with OpenChamber 2.1.1 and OpenCode 2.0.22: folder install, the service running on OpenChamber's runtime, live generation of all five formats from the complete `SPEC.md`, previews, study progress, history reopening, and exports. 15/15 focused tests pass.
- Fedora is build-only. Nothing has been tested on Linux or macOS.
- Settled: no self-packaged Python; Office and PDF files will come from JavaScript builders in the service. Text generation uses the local OpenChamber proxy, OpenCode's base model catalog, and its stateless route. Password-protected, remote, and relay hosts are out of scope.
- Merged pull requests: #1 (Summary), #2 (study formats and web page), and the change that adds this file.

## 2. Working setup

| Item | Value |
|---|---|
| Local clone | `C:\Users\xrahman\Downloads\open_chamber_working\surfsense-studio-for-openchamber_2026-10-06_1825` |
| GitHub | `TheMintageOfMan/surfsense-studio-for-openchamber`, default branch `main`; `gh` is authenticated |
| Dev tools | Node 24 and npm (development only), `esbuild` from `devDependencies` |
| OpenChamber backend | `http://127.0.0.1:57123` (desktop local port); OpenCode's own port changes on restart and is not used directly |
| Installed extension | Folder install of `windows-11-x64/`, id `surfsense-studio-v2`, grants `files` and `service` |

Routine:

1. `npm ci --ignore-scripts --no-audit --no-fund --cache ./temp/npm-cache`, then `npm test` and `npm run build`. Edit `shared/` only; the build rewrites both platform folders.
2. Panel changes load when the Studio panel reopens. Service changes need a service restart: back up `%USERPROFILE%\.config\openchamber\extensions.json`, then `PUT http://127.0.0.1:57123/api/guests/surfsense-studio-v2/enabled` with `{"enabled":false}` and then `{"enabled":true}`. The local helper `temp/restart-development-extension.ps1` does this; `temp/` is not committed, so recreate it in a fresh clone.
3. Read-only connection check: `npm run probe -- --origin http://127.0.0.1:57123 --session <session id> --directory <clone path>`.
4. Live generation check: `temp/live-format.mjs <format> [provider/model]` submits one job through `POST /api/guests/surfsense-studio-v2/service/request` and polls it. Its hard-coded session id is from the previous session; replace it with the new one (`OPENCODE_SESSION_ID` in an agent shell). The session must belong to the clone directory.
5. Panel checks: open `http://127.0.0.1:57123/?session=<id>` with the Chrome DevTools tools, click the **SurfSense Studio** rail button, and act on snapshot ids. Element screenshots of nodes inside the extension iframe come out blank; take viewport screenshots instead.

Model notes: `amazon-bedrock/us.openai.gpt-6-astra-ultrafast` worked for every format. `amazon-bedrock/us.anthropic.claude-opus-5-5` at variant `max` returned no text for all four structured formats (about 50 seconds each, probably billed). The stateless route has no output-budget control.

Approvals to request again next session: every live generation (billable), service restarts and other extension-registry changes, and every GitHub push, pull request, or merge. Commit and merge permission was given for this session only.

## 3. Pass 3: document formats with JavaScript builders

Goal: Word, Slides, Spreadsheet, and PDF produce real, editable files from one text source, with in-panel previews and non-overwriting export. Format count becomes 9 of 12.

### Step 1. Qualify the libraries before building features

1. Confirm current versions, licenses, and dependency trees for the proposed libraries: `docx` (DOCX), `pptxgenjs` (PPTX), `exceljs` (XLSX), and `pdfkit` (PDF). Prefer libraries with no native addons and no network access at runtime.
2. Write a throwaway spike under `temp/` that builds one small file per format from fixed data, bundled with esbuild for Node exactly as the service is.
3. Known risk: `pdfkit` loads its standard-font metric files from disk, which can break once bundled. Embed a Unicode font as a buffer from the start (model output contains curly quotes and dashes), for example Noto Sans regular and bold under the SIL Open Font License, and confirm no default font file is read.
4. Check the spike files independently with development-only tools: `python-docx`, `python-pptx`, and `openpyxl` on this machine, and a PDF parse. These tools never ship.
5. Rebuild and measure both platform folders: expanded bytes, compressed ZIP size, and file count against 40 MiB, 20 MiB, and 500 files.
6. Record the chosen libraries and fonts in `SPEC.md` section 4 and in the open-decisions list.

### Step 2. Shared format modules

Add `shared/common/docx.mjs`, `pptx.mjs`, `xlsx.mjs`, and `pdf.mjs`, following the existing modules: prompt, reply parsing, validation with disclosed caps and omissions, a Markdown body for history, and no model-written code. SurfSense's Office prompts ask for Python scripts, so write new structured prompts; its `SKILL.md` authoring guidance may be adapted with attribution if useful.

Proposed reply shapes and caps, to confirm during the pass:

| Format | Reply shape | Caps |
|---|---|---|
| Word, PDF | `{"title", "subtitle", "sections": [{"heading", "paragraphs": [str], "bullets": [str], "table": {"columns": [str], "rows": [[str]]} or null}]}` | 12 sections; tables at most 8 columns and 50 rows |
| Slides | `{"title", "subtitle", "slides": [{"title", "bullets": [str], "notes": str}]}` | 15 slides plus a generated title slide; 6 bullets per slide |
| Spreadsheet | `{"title", "tables": [{"name", "description", "columns": [str], "rows": [[string or number or null]]}]}` | 10 sheets; 20 columns; 500 rows |

Rules:

- Every value is plain text; builders apply all formatting.
- Spreadsheet tables must come from the source. Missing values stay empty (`null`), never invented. Row lengths must match the column count. Sheet names are sanitized to Excel's 31-character rule with disclosed renames. Add a notes sheet with the source path, model, and omissions.
- Keep caps modest: the route cannot raise the model's output budget, so an over-long reply ends as invalid JSON (reported as such, not truncated).

### Step 3. Builders in the service

1. Add `shared/service/builders/` with one deterministic builder per format, Node only. Use the record's `createdAt` for document metadata so rebuilding the same artifact gives the same content.
2. Store the generated file beside its record as `.studio/<folder>/<id>.<ext>` with atomic writes. Record its name, byte size, and MD5 in the record.
3. Export copies the stored bytes to a new project-root file by exclusive creation. Binary bytes never travel through the panel bridge for export.
4. Keep the record's public JSON under the 240,000-character bridge budget.

### Step 4. Panel previews

1. Render previews from the structured artifact: a document outline with tables, slide cards, sheet tables, and the same outline for PDF with page information from the builder.
2. Treat true file rendering (`pdf.js`, `docx-preview`, or similar) as optional. Add it only if the bundle size and the iframe policy (`worker-src` and `connect-src`) allow it, and stream bytes in bounded chunks.
3. Flip the four catalog entries to implemented and update their tile reasons.

### Step 5. Tests

Controlled replies only, no model calls:

- Valid and malformed replies; caps and disclosure notes; spreadsheet null handling, row-length checks, and sheet-name sanitizing.
- Generated files are valid packages: OOXML parts present in each ZIP, a PDF header and trailer, and identical bytes on rebuild.
- Export refuses overwrites and wrong extensions; history and public JSON stay within limits.
- A development-only script under `temp/` opens the test files with `python-docx`, `python-pptx`, and `openpyxl` as an independent check.

### Step 6. Live verification

1. Rebuild, re-measure package size, and restart the service (approval).
2. One live generation per format from `SPEC.md` with Astra Ultrafast (approval each). Run long checks in the background so the session does not block.
3. Check each preview in the panel, export each file, open the exports in Word, PowerPoint, Excel, and a PDF reader, and verify the exports by MD5 against the stored files.
4. Update README, the platform READMEs, AGENTS.md, and the SPEC status; commit; open a pull request and link it to the session.

## 4. Pass 4: media formats

### Image and Infographic

1. Choose the image provider first. OpenCode's stateless route returns text only, so Studio needs its own connection. Options to compare: an Amazon Bedrock image model through the AWS SDK credential chain, or an OpenAI-compatible images API through an OpenChamber extension integration with a token the panel never sees. Settle where credentials live before writing code.
2. Text model writes the brief or prompt; the image model renders it. Store image bytes beside the record, preview them in the panel, and export by exclusive creation. Never retry a billed image call automatically.

### Podcast with the optional Kokoro pack

1. Evaluate a Kokoro runtime that needs no per-platform native binaries (for example a JavaScript or WebAssembly build) for license, CPU speed, and memory. Fall back to per-platform native packs only if needed.
2. Define the pack: pinned version, weights, voices, phonemizer, licenses (eSpeak-ng is GPL if used), hosting such as GitHub Releases, and integrity and authenticity checks.
3. Build the download, verify, activate, remove, and health-check lifecycle from SPEC section 8, then two-speaker script generation, voicing, WAV assembly, transcript, and player.

## 5. Pass 5: release qualification

- Run the acceptance criteria in SPEC section 12 for all 12 formats on each advertised platform. Fedora needs its first runtime test on a real Fedora x64 machine; decide whether macOS is a target.
- Re-measure each package against the ZIP limits; choose ZIP or folder distribution.
- Clean-machine installs with no developer tools; upgrade with existing history; disable, re-enable, and uninstall behavior.
- Versioning and release archives per platform. `temp/package_development_builds.py` (local only) shows the archive check to move into `scripts/`.

## 6. Small backlog

- README and the service's remote-host error message still describe an authenticated broker; reword them to say these hosts are out of scope.
- Derive the service `/health` version from the build instead of the hard-coded `0.2.0`.
- Large mind maps are tiny in the side panel; consider a shallower initial expand level or a larger minimum scale.
- Surface the reasoning-variant hint in the panel when a model returns empty text.
- Delete the merged branches `feat/summary-first-pass`, `feat/study-formats`, and this pass's documentation branch, and remove the two test exports in the clone root (`summary-...md`, `webpage-...html`), but only with approval.
- Consider committing the restart and live-check helpers as documented development scripts.

## 7. Guardrails

- No forks of SurfSense or OpenChamber; no OpenChamber installer or core changes.
- No self-packaged Python; no model-written code executes.
- Never truncate sources, silently substitute models, bypass authentication, or retry billable calls automatically.
- Keep scratch work in `temp/` and generated history in `.studio/`, both out of commits.
- Distinguish controlled tests from live verification and build-only platforms in every status statement.
