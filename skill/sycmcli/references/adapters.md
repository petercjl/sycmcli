# Platform adapters

## Codex and SealSeek

- Run the installed `sycmcli` through the Agent's local command surface.
- Use the default managed store mode. One alias maps to one sycmcli-owned persistent Chrome profile and one bound shop identity.
- Let sycmcli discover Chrome's per-launch loopback endpoint from that profile. Agents must not choose, remember, or guess a debugging port.
- Login and risk verification happen visibly in the store-specific Chrome. The Agent stops while user action is required.
- Use `browser list` to identify every managed window and `browser focus --store <alias>` to activate the requested one. Require `headless=false` and `interactive=true` before asking the user to complete a slider or risk challenge.
- Parse JSON stdout and structured JSON stderr. Return absolute, clickable paths for exports.
- Keep browser credentials inside the profile; only normalized identity and authorized business data enter CLI results.

Status: managed-profile launch and isolation were exercised on macOS from SealSeek. Complete authenticated reads through the new unified flow and Windows behavior remain pending validation.
