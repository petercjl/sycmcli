# sycmcli

`@petercjl/sycmcli` retrieves authorized Taobao/Tmall business data through the user's logged-in browser session. It catalogs 37 Business Manager-compatible data and analysis abilities, exposes a growing allowlist of real Shengyicanmou, Alimama, and DMP read operations, and protects registered write workflows with plan/apply confirmation. Codex and SealSeek use the same managed-browser model: every store owns one persistent Chrome profile and one bound shop identity.

## Install

```bash
npm install --global @petercjl/sycmcli
sycmcli skill install --agent codex
sycmcli doctor --json
```

Node.js 20 or newer is required.

Store setup in Codex or SealSeek:

```bash
sycmcli stores add my-shop --display-name "My Shop"
sycmcli auth login --store my-shop
# Complete login in the visible Chrome, then:
sycmcli auth bind --store my-shop
```

The browser can be closed normally. Future commands wake the same store profile on demand. Chrome assigns a private ephemeral DevTools port per launch; users and Agents do not configure or reuse a fixed port.

Useful checks:

```bash
sycmcli browser status --store my-shop
sycmcli browser open --store my-shop
sycmcli browser stop --store my-shop
sycmcli doctor --json
```

Legacy attached or Agent-native stores can be converted with `sycmcli stores migrate <alias> --mode managed`. Login is completed once in the new profile; cookies are not copied from the old browser.

## Examples

```bash
sycmcli category search --store my-shop --keyword 奶锅
sycmcli item rank --store my-shop --cate-id 50012082 --rank-type gmv --top 100
sycmcli word related --store my-shop --keyword 奶锅 --page-size 20
sycmcli business list
sycmcli data operations
sycmcli data run competitor.search --store my-shop --params-json '{"keyWord":"奶锅"}'
```

JSON is the default output. Use `--out result.csv`, `--out result.xlsx`, or `--out result.json` to export.

Guarded write workflow:

```bash
sycmcli mutation plan search-recommend-publish --store my-shop --params-json ./publish.json
sycmcli mutation apply <plan-id> --store my-shop --confirm <confirmation-code>
```

`plan` only creates a local preview. `apply` validates the short-lived plan and returns the registered Agent execution task. The Agent must execute it in the bound store profile and read back the changed object.

## Safety

Read operations are limited to packaged endpoint descriptors; callers cannot supply arbitrary URLs. The package stops on login or risk challenges and never bypasses verification. It refuses store identity mismatches and does not export cookies or legality tokens. Registered write workflows require a short-lived plan, payload integrity check, confirmation code, idempotency key, identity binding, and post-write readback. Treat platform access, subscription entitlements, and retrieved data according to the applicable service terms and your organization's policy.

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

Automatic daily update checks are enabled by default. When a newer public npm release exists, `sycmcli` installs the exact registry tarball into the same global npm prefix as the running package; the next command uses it and linked Agent Skills follow it automatically.

The updater derives that prefix from the installed package path and passes it explicitly to npm. This keeps a Homebrew development install, a SealSeek-managed Node installation, and a Windows npm global installation in their own environments without creating a shadow copy.

```bash
sycmcli update status
sycmcli update check
sycmcli update install
sycmcli update config --auto-update true --interval-hours 24
```

## Release process

New versions are published through the repository's GitHub Actions workflow using npm Trusted Publishing (OIDC). The release workflow runs checks and tests, updates the version, creates the Git tag and GitHub Release, and publishes to npm without storing a long-lived npm write token.

Use `npm-release-kit` to start a release:

```bash
# Stable release
npm-release-kit publish --release patch --tag latest --yes

# Prerelease
npm-release-kit publish --release prerelease --tag next --yes
```

The npm registry and intended dist-tag must show the new version before the release is considered complete.

## License

MIT
