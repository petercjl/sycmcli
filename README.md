# sycmcli

`@petercjl/sycmcli` is a read-only CLI for retrieving authorized Shengyicanmou (生意参谋) market data. Codex uses the dedicated Chrome CDP session; SealSeek uses its native persistent browser. Each store keeps a separate identity binding and browser profile.

## Install

```bash
npm install --global @petercjl/sycmcli
sycmcli skill install --agent codex
sycmcli doctor --json
```

Node.js 20 or newer is required.

Codex setup:

```bash
sycmcli stores add my-shop --mode attached --cdp-url http://127.0.0.1:9223
sycmcli auth status --store my-shop
```

SealSeek setup:

```bash
sycmcli skill install --agent sealseek
sycmcli stores add my-shop --mode host --platform sealseek --browser-profile my-shop
```

SealSeek opens `https://sycm.taobao.com/` in that native browser profile, executes the CLI-returned browser task, then passes the result to `sycmcli host complete`. Browser cookies and tokens never leave the browser.

If the same machine already has that alias configured for Codex, keep the alias and add `--transport host --browser-profile <name>` to SealSeek data commands. The two Agents share the identity binding but use different browser transports.

## Examples

```bash
sycmcli category search --store my-shop --keyword 奶锅
sycmcli item rank --store my-shop --cate-id 50012082 --rank-type gmv --top 100
sycmcli word related --store my-shop --keyword 奶锅 --page-size 20
```

JSON is the default output. Use `--out result.csv`, `--out result.xlsx`, or `--out result.json` to export.

## Safety

The package exposes only read operations. It stops on login or risk challenges and never bypasses verification. It refuses store identity mismatches and does not export cookies or legality tokens. Treat platform access, subscription entitlements, and retrieved data according to the applicable service terms and your organization's policy.

## Agent Skill

The npm package is the single source of truth:

```bash
sycmcli skill source
sycmcli skill status --agent codex
sycmcli skill install --agent codex
sycmcli skill install --agent sealseek
sycmcli skill update --agent codex
```

Managed installations use links on macOS/Linux and refuse to overwrite an unmanaged Skill directory.

## Automatic updates

Automatic daily update checks are enabled by default. When a newer public npm release exists, `sycmcli` installs the exact registry tarball globally; the next command uses it and linked Agent Skills follow it automatically.

```bash
sycmcli update status
sycmcli update check
sycmcli update install
sycmcli update config --auto-update true --interval-hours 24
```

## License

MIT
