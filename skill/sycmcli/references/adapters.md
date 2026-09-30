# Platform adapters

## Codex and SealSeek

- Run the installed `sycmcli` through the Agent's local command surface.
- Use the default managed store mode. One alias maps to one sycmcli-owned persistent Chrome profile and one bound shop identity.
- Let sycmcli assign and persist one nonzero loopback port per store. Agents must not choose, remember, or guess a debugging port.
- Login and risk verification happen visibly in the store-specific Chrome. The Agent stops while user action is required.
- Use `browser list` to identify every managed window and `browser focus --store <alias>` to activate the requested one. Require `headless=false`, `interactive=true`, and `webdriver=false` before asking the user to complete a slider or risk challenge.
- Parse JSON stdout and structured JSON stderr. Return absolute, clickable paths for exports.
- Keep browser credentials inside the profile; only normalized identity and authorized business data enter CLI results.

Status: managed-profile launch, isolation, fixed-port startup, and manual slider completion were tested on macOS in Codex. Complete authenticated reads from SealSeek and Windows behavior remain pending validation.
