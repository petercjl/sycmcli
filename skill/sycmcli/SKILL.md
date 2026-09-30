---
name: sycmcli
description: Use sycmcli for authorized Taobao/Tmall business data and analysis across Shengyicanmou, Alimama, DMP, shops, items, categories, competitors, promotion and reports, with guarded plan/apply workflows for registered publishing or modification actions. Trigger for 生意参谋、市场排行、商品/店铺/竞品分析、万相台、达摩盘、营销数据、多店铺取数、报表、发布或修改。
---

# sycmcli

Use the installed `sycmcli` command as the only business-logic runtime. The npm package is the source of truth; never recreate its requests in an ad hoc script.

## Main line

1. Run `sycmcli doctor --json` when setup is uncertain.
2. Resolve the exact store with `sycmcli stores list`. Pass `--store <alias>` whenever the user names a store.
3. Resolve the request with `sycmcli business list` or `business show <id>` when routing is uncertain.
4. Follow the platform flow below to verify login and collect data.
5. Use a friendly command when available; otherwise select a packaged operation from `sycmcli data operations` and run it with `data run`. Never construct an unregistered endpoint.
6. Prefer JSON for analysis; use `--out` only for a requested export. Check identity, counts, pagination, warnings, and completeness.
7. For a registered external write, create a mutation plan, show the preview and confirmation code to the user, then run `mutation apply` only after the user confirms that exact plan. Execute the returned Agent task in the bound browser and read back the changed object.

## Unified browser flow

Codex and SealSeek use the same sycmcli-managed Google Chrome model. Each store alias owns one persistent Chrome profile; browser runtime ports are allocated by Chrome and remain an internal implementation detail.

1. Create the store once: `sycmcli stores add <alias> --display-name "<shop name>"`.
2. Run `sycmcli auth login --store <alias>`. sycmcli opens or wakes that store's visible Chrome.
3. Let the user complete first-party login or verification, then run `sycmcli auth bind --store <alias>`.
4. Run every later data or mutation command with the exact `--store <alias>`. sycmcli wakes the same profile automatically.
5. If the session is logged out, stop and tell the user to finish login in the visible store browser. Retry only after the user confirms completion.
6. If the live shop identity differs from the bound identity, stop on `STORE_IDENTITY_MISMATCH`; never switch, rebind, or continue implicitly.

Use `sycmcli browser status --store <alias>` for a read-only runtime check and `sycmcli browser open --store <alias>` to wake the visible browser without running a data request. A dormant browser is normal because its profile persists on disk. Run `sycmcli browser stop --store <alias>` only when the user explicitly asks to close that store browser.

Legacy `attached` and `host` stores remain readable for migration only. Convert one with `sycmcli stores migrate <alias> --mode managed`, then complete login once in the new managed profile. Do not copy cookies from an Agent-native or shared browser.

## Safety boundary

- Read requests may use only packaged operation IDs. Never accept a caller-supplied URL or copy a token into a shell request.
- External writes are limited to registered mutation capabilities and require `mutation plan` followed by confirmation of that exact, unexpired plan. Do not treat general approval as approval for a later concrete mutation.
- After a write, verify the current shop identity and read the changed object back. Report partial or unverified outcomes explicitly.
- Deletion, refund, cancellation, account, permission, credential, and payment operations are outside this Skill.
- Authentication remains inside the selected local Chrome profile. Never request, print, export, copy, or persist cookies, legality tokens, passwords, or browser storage outside that profile.
- Stop on login, verification, risk-control, identity mismatch, or permission errors. The user completes first-party verification visibly.
- Each alias binds to one verified shop identity. `STORE_IDENTITY_MISMATCH` is a hard stop.
- Do not overwrite an export without explicit authorization and `--force`.

## Command routing

- Categories: `sycmcli category search|tree|main`
- Product rankings: `sycmcli item rank --rank-type gmv|growth|flow|add|newitm_ipv`
- Price bands: `sycmcli price segments`
- Keyword rankings: `sycmcli keyword rank`
- Search-word detail: `sycmcli word overview|trend|related|category --keyword <text>`
- All 37 business abilities: `sycmcli business list` and `sycmcli business show <capability-id>`
- Registered raw reads: `sycmcli data operations` and `sycmcli data run <operation-id> --params-json <json-or-file>`
- Deterministic local analysis: `sycmcli analyze run <capability-id> --input-json <json-or-file>`
- Guarded publishing/modification: `sycmcli mutation plan|show|apply`
- Full inputs and outputs: [references/commands.md](references/commands.md)

## Pagination and completeness

Item ranking accepts at most 20 rows per request. For Top N, pass `--top N`. Inspect `fetchedPages`, `stoppedBy`, `returnedCount`, `recordCount`, and `warnings`. Do not claim complete coverage when collection stopped early.

## Updates

Automatic update is enabled by default and checks npm once every 24 hours. A successful update applies to the next command and the managed Skill links immediately follow the new package.
The updater derives the active global npm prefix from the installed package path and updates that same installation. This supports development installs and Agent-managed Node environments without hard-coding a machine path.

- Status: `sycmcli update status`
- Check now: `sycmcli update check`
- Install now: `sycmcli update install`
- Configure: `sycmcli update config --auto-update true --interval-hours 24`
- Managed Skill status/update: `sycmcli skill status` and `sycmcli skill update --agent <agent>`

Read [references/adapters.md](references/adapters.md) for platform evidence and verification status.
