# Command reference

## Store and authentication

```bash
sycmcli stores add shanju
sycmcli stores add shanju-attached --mode attached --cdp-url http://127.0.0.1:9223
sycmcli stores list
sycmcli stores use shanju
sycmcli auth login --store shanju
sycmcli auth status --store shanju
```

Managed mode assigns one Chrome profile and one loopback CDP port per alias. Attached mode references an existing loopback CDP endpoint. `auth status` binds the alias to the current shop identity on first success and rejects a different identity later.

## Data commands

```bash
sycmcli category search --store shanju --keyword 奶锅 --limit 20
sycmcli category tree --store shanju
sycmcli category main --store shanju

sycmcli item rank --store shanju --cate-id 50012082 --rank-type gmv --date-type recent7 --top 100
sycmcli price segments --store shanju --cate-id 50012082 --date-type recent7
sycmcli keyword rank --store shanju --cate-id 50012082 --rank-type hot --kw-type search --page-size 20

sycmcli word overview --store shanju --keyword 奶锅 --date-type day
sycmcli word trend --store shanju --keyword 奶锅 --date-type recent7
sycmcli word related --store shanju --keyword 奶锅 --page-size 20
sycmcli word category --store shanju --keyword 奶锅 --page-size 20
```

Supported automatic date types are `day`, `recent7`, and `recent30`. Before 08:00 local time, the default end date is T-2; otherwise it is T-1. For another date type, supply `--date-range START|END`.

## Export

JSON is written to stdout by default. Use:

```bash
sycmcli item rank --store shanju --cate-id 50012082 --top 100 --out ./rank.json
sycmcli item rank --store shanju --cate-id 50012082 --top 100 --out ./rank.csv
sycmcli item rank --store shanju --cate-id 50012082 --top 100 --out ./rank.xlsx
```

The extension selects the format, or pass `--format json|csv|xlsx`. Existing files are refused unless explicit replacement is authorized with `--force`.

## Structured errors

Errors are JSON on stderr with `ok: false`, a stable `error.code`, a message, and optional details/hint. Important stop codes include `AUTH_REQUIRED`, `AUTH_OR_RISK_CHALLENGE`, `STORE_IDENTITY_MISMATCH`, `BROWSER_UNAVAILABLE`, and `OUTPUT_EXISTS`.
