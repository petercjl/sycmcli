---
name: sycmcli
description: Use the sycmcli CLI to read authorized Shengyicanmou market categories, item rankings, price segments, keyword rankings, and search-word analytics from a user-selected Taobao or Tmall store session. Trigger when the user asks for 生意参谋市场数据、市场排行、搜索词分析、类目榜单、价格带，or multi-store SYCM authentication and exports.
---

# sycmcli

Use the installed `sycmcli` command as the only business-logic execution surface. The npm package is the source of truth; do not recreate its requests in ad hoc scripts.

## Main line

1. Run `sycmcli doctor --json` when setup or browser state is uncertain.
2. Resolve the requested store. Use `sycmcli stores list`; if the user names a store, pass its exact alias with `--store`. Do not silently use a different store.
3. Run `sycmcli auth status --store <alias>`. If authentication is missing, run `sycmcli auth login --store <alias>`, ask the user to finish the visible login, then retry status.
4. Resolve a category with `category search` when no unambiguous `cateId` is already known.
5. Run the relevant read command. Prefer JSON for analysis; use `--out` only when the user requests a file.
6. Check `ok`, selected store identity, returned counts, pagination fields, warnings, and completeness before analyzing or presenting results.
7. Return to the requested business analysis after data collection.

## Safety boundary

- This Skill authorizes read-only Shengyicanmou market-data access. It does not authorize edits, advertising changes, purchases, messages, or account administration.
- Authentication remains inside the dedicated Chrome profile. Never request, print, export, or persist raw cookies, legality tokens, passwords, or browser storage.
- Stop when the CLI reports login, verification, risk-control, identity mismatch, or permission errors. Let the user complete the visible site flow; do not bypass it.
- Each store alias is bound to one verified shop identity. Treat `STORE_IDENTITY_MISMATCH` as a hard stop.
- Do not overwrite an existing export unless the user explicitly authorizes replacement and the command uses `--force`.

## Command routing

- Categories: `sycmcli category search|tree|main`
- Product rankings: `sycmcli item rank --rank-type gmv|growth|flow|add|newitm_ipv`
- Price bands: `sycmcli price segments`
- Keyword rankings: `sycmcli keyword rank`
- Search-word detail: `sycmcli word overview|trend|related|category --keyword <text>`
- Full option examples and result contracts: read [references/commands.md](references/commands.md).

## Pagination and completeness

The item-ranking endpoint allows at most 20 rows per request. For a requested Top N, pass `--top N`; inspect `fetchedPages`, `stoppedBy`, `returnedCount`, `recordCount`, and `warnings`. Do not claim complete coverage when the response stopped early, returned fewer rows than requested, or the site limited access.

## Multi-store setup

Use `stores add <alias>` for a dedicated managed Chrome profile. Use `--mode attached --cdp-url http://127.0.0.1:<port>` only when the user intentionally wants an already running loopback Chrome session. Configuration stores metadata and identity binding only, never cookies.

## Capability and update discovery

Before depending on an unfamiliar command contract, run `sycmcli capabilities --json` and `sycmcli help`. Discover the canonical Skill with `sycmcli skill source`; check or refresh managed installations with `sycmcli skill status`, `skill install`, and `skill update`.

## Platform adapters

Codex uses terminal execution and local files; see [references/adapters.md](references/adapters.md). SealSeek uses the same CLI contract through its shell capability. The SealSeek adapter is implemented from the public contract but must be reported as untested until a real SealSeek run succeeds.
