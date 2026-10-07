# Next steps

Plan for the next working session. Read [SPEC.md](SPEC.md), [README.md](README.md), and [AGENTS.md](AGENTS.md) first.

## 1. Where things stand

- `main` plus branch `feat/document-formats` (pass 3, pending pull request) hold a development build with 9 of 12 formats: Summary, Word, Slides, Spreadsheet, Web page, PDF, Mind map, Flashcards, and Quiz. Podcast, Image, and Infographic are disabled grid tiles.
- Verified on Windows 11 x64 with OpenChamber 2.1.1 and OpenCode 2.0.22: folder install, the service on OpenChamber's runtime, live generation of all nine formats from the complete `SPEC.md` with Astra Ultrafast, panel previews, history reopening, and exports. Pass 3 exports matched their stored files by MD5, re-export was refused with `FILE_EXISTS`, and the Word, PowerPoint, and Excel files opened read-only in Microsoft Office without repair. 20/20 focused tests pass.
- Simple UI pass (branch `feat/simple-ui`): NotebookLM-style panel with source tick boxes, colored tiles that create on tap, a pencil for one choice plus focus, a creations list, a full-panel viewer with **Save**, and a gear for the model (Automatic by default). Quiet recovery: the chosen model twice, then the recommended model once. Checked live in the panel: Quiz, a short Summary, and two-source Flashcards completed, and Save wrote a title-named file. 25/25 tests pass.
- Package: about 3.27 MB expanded in 10 files and 1.29 MB zipped per platform folder.
- Fedora is build-only. Nothing has been tested on Linux or macOS.
- Settled: no self-packaged Python; `docx`, `pptxgenjs`, `write-excel-file`, and `pdfkit`; Inter is the one font (SPEC section 4). Text generation uses the local OpenChamber proxy, OpenCode's base model catalog, and its stateless route. Password-protected, remote, and relay hosts are out of scope.
- Merged pull requests: #1 (Summary), #2 (study formats and web page), #3 (this plan).

- Pass 4a (branch `feat/infographic`, pushed, no pull request yet): Infographic tile (10 of 12) and Inter as the one font everywhere. Live in the panel: a compare layout and a simple roadmap generated from two sources; Save wrote SVG and PNG; Word showed embedded Inter where it is not installed. 28/28 tests pass. Package about 4.6 MB expanded, 13 files, 2.0 MB zipped.
- Pass 4b (branch `feat/more-sources`): the service reads sources by path: text and data types, HTML, DOCX (Mammoth), PDF (PDF.js, no OCR), PPTX, XLSX, plus the current chat (compressed by OpenCode above 10,000 characters). Live: a PDF quiz, DOCX+CSV+HTML flashcards, and a PPTX + long-chat summary (chat 36,983 -> 7,065 characters). 34/34 tests pass. Package about 6.7 MB expanded, 15 files.
- Pass 4c (branch `feat/legacy-office`): source limit raised to 200,000 characters and 50 files; `.doc`, `.xls` and `.ppt` read by Studio's own Compound File Binary reader (`shared/service/legacy*.mjs`); Excel dates (`.xlsx` and `.xls`) shown as dates.
- Plain-language pass (branch `feat/plain-language`): generated files name sources plainly and never mention models or paths; "About this" notes rewritten in plain words (no MD5 or byte counts); visible **Options** button on tiles; clearer tile, flashcard and creation-list wording. Audience is everyone, not only children (SPEC requirement 11).
- Possible follow-ups: PDF.js character maps for East Asian PDFs; OCR; headers and footnotes in `.doc`.
- Next: Picture (needs an image model) and Podcast (Kokoro pack), per section 4.

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

## 3. Pass 3: document formats (done, pending merge)

Delivered: `shared/common/documents.mjs` (prompts, validation, disclosed caps), `shared/service/builders/` (deterministic builders; files stored as `.studio/<folder>/<id>.<ext>` with name, bytes, and MD5 in the record; export copies those bytes service-side), `shared/panel/viewers/documents.js` (outline, slide-card, and sheet previews), `tests/documents.test.mjs`, and bundled DejaVu Sans with license notices. Development-only checks in `temp/` (not committed): `check_files.py` (python-docx, python-pptx, openpyxl, pypdf), `office-open.ps1` (read-only Office COM open), `live-export.mjs`.

Follow-ups:

- True file rendering in the panel (`pdf.js`, `docx-preview`) was not added; decide whether it is worth the bundle and iframe-policy cost.
- Long Office layout is unchecked beyond opening: slide text uses shrink-to-fit, and very wide tables may need landscape pages.

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
- Delete the merged branches `feat/summary-first-pass`, `feat/study-formats`, and `docs/js-builders-plan`, and remove the two test exports in the clone root (`summary-...md`, `webpage-...html`), but only with approval.
- Consider committing the restart and live-check helpers as documented development scripts.

## 7. Guardrails

- No forks of SurfSense or OpenChamber; no OpenChamber installer or core changes.
- No self-packaged Python; no model-written code executes.
- Never truncate sources or bypass authentication. Text generation may make at most three calls per request (chosen model twice, then the recommended model once), each recorded; nothing else retries billable calls.
- Keep scratch work in `temp/` and generated history in `.studio/`, both out of commits.
- Distinguish controlled tests from live verification and build-only platforms in every status statement.
