# Contributing to TenkaCloud Passport

## Product Boundary

TenkaCloud Passport は Account、Cloud Backend、Participant Analytics、継続 Chat、人物 Score を追加しません。
Owner が今回公開を許可した手掛かりだけから、対面会話を始める Bridge を最大 1 つ提示して退きます。
Lounge 由来データは退出、Host 終了、20 分満了の最早契機で破棄します。

変更前に [CONCEPT](./CONCEPT.md)、[Product Contract](./docs/product/product-contract.md)、
[Privacy Data Inventory](./docs/privacy/data-inventory.md)、[Quality Bar](./docs/architecture/quality-bar.md)を読んでください。

## Setup

固定 Commit の clean checkout で実行します。

```bash
make install_ci
make before-commit
```

`make before-commit` は Harness、Scripts Test、Pre-release Check、Duplication Ratchet、Textlint、Biome、
Typecheck、100％ Functions / Lines、Web Export を実行します。失敗時はコードを修正し、設定、Invariant、Coverage を
緩めません。`npx`、`rm` command、Mock Data、Stub API、型 Escape、focused test は使いません。

## Issue と Pull Request

- Issue 番号は `#29` のように省略せず、`Issue 29` または完全な URL で記載する。
- 1 PR は 1 つの観察可能な Outcome に限定し、Scope 外の発見は別 Follow-up にする。
- Document / ADR / Plan、既存負債 Refactor、Feature の順に変更する。
- 日本語 BDD の Test を先に Red にし、実 File / API / DB 境界で Green にしてから Refactor する。
- PR Template の Regression、Rollback、未検証、Known Follow-ups を埋める。
- Physical Device、Browser、Assistive Technology を実行していない場合は `Not run` と記載する。

## Good First Issue

[Good First Issue candidates](./docs/contributing/good-first-issues.md) は Product Boundary 内に限定した準備済み Scope です。
Public OSS Alpha 前に Maintainer が重複を確認し、GitHub 上の実 Issue と `good first issue` Label を作ります。
文書内の候補だけを Public Release の受け入れ証拠にはしません。

Good First Issue では次を禁止します。

- Cloud Account / Backend、Telemetry、Ads、Participant Ranking、安定追跡 ID の導入。
- Model Weight、Token、Certificate、Participant Data の commit。
- Privacy、Schema、Harness、Coverage の緩和。
- `Not run` を `Verified` へ変更するための文言だけの編集。

## Security

脆弱性を Public Issue に書かず、[Security Policy](./SECURITY.md) の Private vulnerability reporting を使います。
