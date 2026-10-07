# Windows 11 x64 development package

Add this folder through OpenChamber **Settings > Extensions** and approve `files` and `service`. OpenChamber starts the bundled JavaScript service using its own runtime; no separate Node/Python installation is needed.

Open a project session, open **SurfSense Studio**, load a `.md` or `.txt` file, select the model, and generate a Summary. Export writes a new Markdown file in that project, without overwriting files. History is in `.studio/summaries/`.

This first pass targets a local loopback OpenChamber 2.1.1 / OpenCode 2.0.22 connection whose proxy permits the request as configured. Protected, remote, and relay hosts are not supported. Generation uses OpenCode's base model configuration, not project-specific overrides. Sources above 32,000 characters are rejected, not truncated. The other 11 Studio formats are not implemented.

Windows installation, live generation, history reopening, and export have been checked. Cancellation and no-overwrite checks used controlled transports. Source and full specification: [GitHub repository](https://github.com/TheMintageOfMan/surfsense-studio-for-openchamber).
