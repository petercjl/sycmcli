---
name: sycmcli
description: Use sycmcli to read authorized Shengyicanmou market categories, item rankings, price segments, keyword rankings, and search-word analytics for a user-selected Taobao or Tmall store. Trigger for 生意参谋市场数据、市场排行、搜索词分析、类目榜单、价格带、多店铺取数或导出。
---

# sycmcli

Use the installed `sycmcli` command as the only business-logic runtime. The npm package is the source of truth; never recreate its requests in an ad hoc script.

## Main line

1. Run `sycmcli doctor --json` when setup is uncertain.
2. Resolve the exact store with `sycmcli stores list`. Pass `--store <alias>` whenever the user names a store.
3. Follow the platform flow below to verify login and collect data.
4. Resolve an ambiguous category with `category search`.
5. Run the requested read command. Prefer JSON for analysis; use `--out` only for a requested export.
6. Check `ok`, identity, returned counts, pagination fields, warnings, and completeness.
7. Continue with the requested analysis.

## Codex flow

Codex uses the dedicated ecommerce Chrome at `http://127.0.0.1:9223`.

1. Configure the alias once: `sycmcli stores add <alias> --mode attached --cdp-url http://127.0.0.1:9223`.
2. Run `sycmcli auth status --store <alias>`.
3. If login is required, open the ecommerce browser, let the user sign in to Shengyicanmou, and retry.
4. Run the data command normally.

## SealSeek flow

SealSeek uses its native persistent browser and browser `evaluate`; it does not require port 9223.

1. Configure one browser profile per store: `sycmcli stores add <alias> --mode host --platform sealseek --browser-profile <profile>`.
2. Open `https://sycm.taobao.com/` with that exact SealSeek browser profile. Let the user sign in when needed.
3. Run the requested `sycmcli` data command. For a host-mode store it returns `action: browser.evaluate`, `browserProfile`, `url`, and a self-contained `script`.
4. Use SealSeek's native browser with the returned profile and URL, then pass the returned `script` unchanged to browser `evaluate`.
5. Pass the exact JSON evaluate result to `sycmcli host complete --store <alias>` on stdin. Add `--out` only when an export was requested.
6. Parse the normalized completion result. Never execute a host task in a different profile or bind it to a different alias.

If native browser `evaluate` is unavailable, return `CAPABILITY_UNAVAILABLE`; do not fall back to a guessed Chrome port.

## Safety boundary

- Read-only Shengyicanmou market data only. Do not edit ads, products, accounts, or settings.
- Authentication remains in the selected browser profile. Never request, print, export, or persist cookies, legality tokens, passwords, or browser storage.
- Stop on login, verification, risk-control, identity mismatch, or permission errors. The user completes first-party verification visibly.
- Each alias binds to one verified shop identity. `STORE_IDENTITY_MISMATCH` is a hard stop.
- Do not overwrite an export without explicit authorization and `--force`.

## Command routing

- Categories: `sycmcli category search|tree|main`
- Product rankings: `sycmcli item rank --rank-type gmv|growth|flow|add|newitm_ipv`
- Price bands: `sycmcli price segments`
- Keyword rankings: `sycmcli keyword rank`
- Search-word detail: `sycmcli word overview|trend|related|category --keyword <text>`
- Full inputs and outputs: [references/commands.md](references/commands.md)

## Pagination and completeness

Item ranking accepts at most 20 rows per request. For Top N, pass `--top N`. Inspect `fetchedPages`, `stoppedBy`, `returnedCount`, `recordCount`, and `warnings`. Do not claim complete coverage when collection stopped early.

## Updates

Automatic update is enabled by default and checks npm once every 24 hours. A successful update applies to the next command and the managed Skill links immediately follow the new package.

- Status: `sycmcli update status`
- Check now: `sycmcli update check`
- Install now: `sycmcli update install`
- Configure: `sycmcli update config --auto-update true --interval-hours 24`
- Managed Skill status/update: `sycmcli skill status` and `sycmcli skill update --agent <agent>`

Read [references/adapters.md](references/adapters.md) for platform evidence and verification status.
