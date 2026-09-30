# sycmcli

`@petercjl/sycmcli` is a read-only CLI for retrieving authorized Shengyicanmou (生意参谋) market data from a logged-in Google Chrome profile. It supports separate browser authentication per store and ships one canonical portable Agent Skill for Codex and SealSeek.

## Install

```bash
npm install --global @petercjl/sycmcli
sycmcli skill install --agent codex
sycmcli doctor --json
```

Node.js 20 or newer and Google Chrome are required. On first use:

```bash
sycmcli stores add my-shop
sycmcli auth login --store my-shop
sycmcli auth status --store my-shop
```

Each managed alias has its own Chrome user-data directory. Browser cookies and site tokens stay inside Chrome; `store.json` contains only browser connection metadata and a shop identity binding.

To reuse an explicitly opened loopback CDP browser:

```bash
sycmcli stores add my-attached-shop --mode attached --cdp-url http://127.0.0.1:9223
```

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

## License

MIT
