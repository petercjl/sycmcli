# Platform adapters

## Codex

- Run `sycmcli` in the terminal.
- Use store mode `attached` with `http://127.0.0.1:9223`.
- Parse JSON stdout and structured JSON stderr.
- Return absolute, clickable paths for exports.

Status: tested on macOS with category, item-ranking, price, keyword, and related-word reads.

## SealSeek

- Run `sycmcli` through the local shell.
- Use store mode `host` and one named native browser profile per store.
- Open Shengyicanmou in that profile, execute the CLI-returned function with native browser `evaluate`, then send its JSON result to `sycmcli host complete`.
- Keep browser credentials inside SealSeek; only normalized identity and market data cross the adapter boundary.
- Do not substitute global OpenClaw gateway commands or port 9223 for SealSeek's Agent-native browser.

Status: adapter implemented against the installed OpenClaw native-browser contract. The updater recognizes both POSIX global npm layouts and Windows npm global layouts. Real SealSeek conversation tests on macOS and Windows remain pending user verification.
