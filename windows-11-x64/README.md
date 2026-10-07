# Windows 11 x64 development package

Add this folder through OpenChamber **Settings > Extensions** and approve `files` and `service`. OpenChamber starts the bundled JavaScript service using its own runtime; no separate Node/Python installation is needed.

Open a project session, open **SurfSense Studio**, tick the documents to use (text, Word, PDF, PowerPoint, Excel, old Office formats and more) or the current chat, and tap a tile. Save writes a new `.md`, `.html`, `.docx`, `.pptx`, `.xlsx`, or `.pdf` file in that project, without overwriting files. History is under `.studio/`.

This build targets a local loopback OpenChamber 2.1.1 / OpenCode 2.0.22 connection whose proxy permits the request as configured. Protected, remote, and relay hosts are not supported. Generation uses OpenCode's base model configuration, not project-specific overrides. Sources above 200,000 characters in total are rejected, not truncated. Podcast and Picture are not implemented.

Windows installation, live generation of all ten implemented formats, opening the Office exports in Microsoft Office, study progress, history reopening, and export have been checked. Cancellation and no-overwrite checks used controlled transports. Source and full specification: [GitHub repository](https://github.com/TheMintageOfMan/surfsense-studio-for-openchamber).

Licensed under the Apache License 2.0; see LICENSE and NOTICE in this folder. Bundled packages and the Inter font keep their own licenses (THIRD-PARTY-LICENSES.txt).
