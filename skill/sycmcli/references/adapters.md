# Platform adapters

## Codex

- Execute `sycmcli` in the terminal.
- Parse JSON stdout and structured JSON stderr.
- Use absolute paths for requested exports and return clickable local file links.
- If a visible login is needed, `sycmcli auth login` opens the store-specific Google Chrome profile.

Status: tested on macOS after package verification.

## SealSeek

- Execute the same `sycmcli` binary through SealSeek's shell/terminal capability.
- Preserve argument arrays and parse stdout/stderr as JSON; do not interpolate user strings into a shell command.
- The visible Chrome login remains a user action on the local machine.
- Load this canonical bundled Skill rather than maintaining a separate copy of business logic.

Status: implemented against the shared CLI contract; real SealSeek runtime test is pending user verification.
