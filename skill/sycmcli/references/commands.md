# Command reference

## Store setup

```bash
# Same commands in Codex and SealSeek
sycmcli stores add my-shop --display-name "示例店铺"
sycmcli auth login --store my-shop
sycmcli auth bind --store my-shop

sycmcli browser status --store my-shop
sycmcli browser list
sycmcli browser focus --store my-shop

# Add or change the visible store name for an existing alias
sycmcli stores label my-shop --display-name "示例店铺"

# Convert a legacy attached or host store to a dedicated managed profile
sycmcli stores migrate my-shop --mode managed

sycmcli stores list
sycmcli stores use my-shop
sycmcli auth login --store my-shop
sycmcli auth status --store my-shop
```

Managed stores always launch full interactive Chrome. `browser list` returns the alias, display name, runtime port, safe page path, visible title, focus state, and `headless`/`interactive` status for every configured store. `browser focus` wakes and activates the exact selected store window. Slider and risk verification remain manual user actions in that visible window.

## Data commands and result shape

| Function | Required input | Main result |
|---|---|---|
| Category search | `--keyword` | Matching category IDs, names, full paths |
| Category tree | none | Available market categories |
| Main category | none | Current shop's main category |
| Item ranking | category or auto-resolution; optional rank type | Ranked products, metrics, pages, completeness |
| Price segments | category or auto-resolution | Price-band IDs and labels |
| Keyword ranking | category or auto-resolution | Ranked search words and metrics |
| Word overview | `--keyword` | Search, click, and conversion summary |
| Word trend | `--keyword` | Time-series trend data |
| Related words | `--keyword` | Related terms and metrics |
| Word categories | `--keyword` | Category distribution for the term |

```bash
sycmcli category search --store my-shop --keyword 奶锅 --limit 20
sycmcli category tree --store my-shop
sycmcli category main --store my-shop
sycmcli item rank --store my-shop --cate-id 50012082 --rank-type gmv --date-type recent7 --top 100
sycmcli price segments --store my-shop --cate-id 50012082 --date-type recent7
sycmcli keyword rank --store my-shop --cate-id 50012082 --rank-type hot --page-size 20
sycmcli word overview --store my-shop --keyword 奶锅
sycmcli word trend --store my-shop --keyword 奶锅 --date-type recent7
sycmcli word related --store my-shop --keyword 奶锅 --page-size 20
sycmcli word category --store my-shop --keyword 奶锅 --page-size 20
```

Automatic date types: `day`, `recent7`, and `recent30`. For another period, pass `--date-range START|END`.

## Business capability routing

```bash
sycmcli business list
sycmcli business show sycm-item-data-fetch
```

The catalog contains 37 data, analysis, workflow, knowledge, and report abilities. `kind=fetch` means the main result is source data; `analysis`, `workflow`, and `report` mean the Agent composes registered reads and performs local analysis.

## Registered data operations

```bash
sycmcli data operations
sycmcli data run competitor.search --store my-shop --params-json '{"keyWord":"奶锅"}'
sycmcli data run item.sale-overview --store my-shop --params-json ./item-query.json
sycmcli data run alimama.campaigns --store my-shop --params-json ./campaign-query.json
sycmcli data run dmp.shop-overview --store my-shop --params-json ./dmp-query.json
```

`--params-json` accepts an inline JSON object or a JSON file. Use only operation IDs returned by `data operations`; arbitrary URLs are rejected. sycmcli wakes the selected store profile and executes the operation on its registered first-party page.

## Guarded writes

```bash
sycmcli mutation plan search-recommend-publish --store my-shop --params-json ./publish.json
sycmcli mutation show <plan-id>
sycmcli mutation apply <plan-id> --store my-shop --confirm <confirmation-code>
```

`plan` binds the payload digest, store identity, expiry and idempotency key. It does not change external data. `apply` authorizes only the same unexpired plan and returns an Agent execution task. Execute that task in the same store profile, then read the changed object back. Supported mutation capability IDs are returned by `business list`.

## Local analysis

```bash
sycmcli analyze run category-price-band-analysis --input-json ./top-items.json
sycmcli analyze run shop-core-potential-item-analysis --input-json ./shop-items.json
sycmcli analyze run item-traffic-fluctuation-analysis --input-json ./traffic-series.json
sycmcli analyze run weekly-or-monthly-store-performance-reports --input-json ./period-summary.json --out ./report.json
```

The analyzer never calls a model or external service. It accepts JSON collected by friendly commands or `data run` and returns reproducible metrics. If a capability has no deterministic analyzer, the CLI returns `ANALYSIS_NOT_IMPLEMENTED`; the Agent then follows the capability workflow and clearly separates source data from its own interpretation.

## Export

```bash
sycmcli item rank --store my-shop --top 100 --out ./rank.json
sycmcli item rank --store my-shop --top 100 --out ./rank.csv
sycmcli item rank --store my-shop --top 100 --out ./rank.xlsx
```

Existing files are refused unless the user explicitly authorizes `--force`.

## Structured errors

Errors use JSON stderr with a stable `error.code`. Stop codes include `AUTH_REQUIRED`, `AUTH_OR_RISK_CHALLENGE`, `STORE_IDENTITY_MISMATCH`, `CAPABILITY_UNAVAILABLE`, `BROWSER_UNAVAILABLE`, `CHROME_PROFILE_INVALID`, `OUTPUT_EXISTS`, `PLAN_EXPIRED`, `PLAN_TAMPERED`, and `CONFIRMATION_FAILED`.
