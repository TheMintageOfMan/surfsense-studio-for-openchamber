# Fedora amd64 development package

Built from the shared implementation with a Linux x64 runtime guard. **Not runtime-tested on Fedora.** Do not treat a successful build as Linux qualification.

For an explicit development trial, add this folder through OpenChamber **Settings > Extensions** on a local Linux x64 host. The package uses OpenChamber's runtime, not a separately installed Node/Python or backend. Protected, remote, and relay connections are not supported.

It offers Summary, Word, Slides, Spreadsheet, Web page, PDF, Mind map, Flashcards, and Quiz from one project `.md` or `.txt` source of at most 32,000 characters. Generation uses OpenCode's base model configuration; export creates a new file and refuses to overwrite existing files. History is under `.studio/`.

Source and full specification: [GitHub repository](https://github.com/TheMintageOfMan/surfsense-studio-for-openchamber). Platform qualification, including PDF font loading on Linux, and the Podcast, Image, and Infographic formats remain pending.
