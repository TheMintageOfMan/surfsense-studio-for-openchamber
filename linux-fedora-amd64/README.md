# Fedora amd64 development package

Built from the shared Summary implementation with a Linux x64 runtime guard. **Not runtime-tested on Fedora.** Do not treat a successful build as Linux qualification.

For an explicit development trial, add this folder through OpenChamber **Settings > Extensions** on a local Linux x64 host. The package uses OpenChamber's runtime, not a separately installed Node/Python or backend. Protected, remote, and relay connections are not supported by this first-pass adapter.

Load one project `.md` or `.txt` source of at most 32,000 characters. Generation uses OpenCode's base model configuration; export creates a new Markdown file and refuses to overwrite existing files. History is in `.studio/summaries/`.

Source and full specification: [GitHub repository](https://github.com/TheMintageOfMan/surfsense-studio-for-openchamber). Platform qualification and the other 11 Studio formats remain pending.
