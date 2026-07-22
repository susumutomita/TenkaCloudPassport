# ADR-0030: ライセンスを MIT から Apache License 2.0 へ変更する

- Status: Accepted
- Date: 2026-07-22
- Deciders: Susumu Tomita

## Context

本リポジトリは MIT License で公開してきたが、owner が保有する他の TenkaCloud
プロジェクト群（`susumutomita/TenkaCloud` 本家、`TenkaCloudChallenge`）は
Apache License 2.0 で統一されている。Issue 105 の本文（訂正込みの全体が正本）で、
owner はライセンス統一のため本リポジトリも Apache-2.0 へ変更すると決定した。

本家 `susumutomita/TenkaCloud` の `LICENSE` を
`gh api repos/susumutomita/TenkaCloud/contents/LICENSE --jq .content | base64 -d`
で取得して確認したところ、Apache License 2.0 の標準全文であり、末尾 APPENDIX の
"How to apply" テンプレートの著作権行 `Copyright [yyyy] [name of copyright owner]`
は未編集のまま残っていた。NOTICE ファイルも存在しない。当初案はこの未編集状態を
本リポジトリでもそのまま踏襲することだったが、Issue 105 の訂正コメントで owner から
「本リポジトリは個人リポジトリであり、`package.json` の `author` が
`Susumu Tomita <oyster880@gmail.com>` と既に確定しているため、著作権行は
`Copyright 2024 Susumu Tomita` に埋める（現行 LICENSE の著作権者表記 `bull` を
置き換える）」という指示に改められた。

## Decision

1. **`LICENSE` を Apache License 2.0 の標準全文へ差し替える。** 本文は本家
   `susumutomita/TenkaCloud` の `LICENSE` と完全に一致させ、末尾 APPENDIX の
   著作権行のみ `Copyright 2024 Susumu Tomita` へ埋める。それ以外の 1 文字も
   本家との差分を作らない。NOTICE ファイルは本家に倣い作成しない。
2. **`package.json` の `"license"` を SPDX 識別子 `"Apache-2.0"` へ変更する。**
   `author` は既に `Susumu Tomita <oyster880@gmail.com>` であり変更不要。
3. **`site/index.html` と `site/en/index.html` のフッター表記を追従させる。**
   `MIT License — ...` を `Apache-2.0 License — ...` へ、MRZ 帯
   （`class="mrz-footer"`）の `<<MIT<<` を `<<APACHE2<<` へ、日英両方で変更する。
4. **`scripts/source-release.ts` は変更しない。** `ALLOWED_SPDX_LICENSE_EXPRESSIONS`
   は既に `Apache-2.0` を含んでおり、Source Release の SPDX SBOM 生成は
   ライセンス変更後もそのまま通る。`scripts/source-release.test.ts` の fixture
   内の `MIT` はテスト用の値であり、プロダクトの `package.json` の `license` とは
   独立しているため変更不要である。
5. **`docs/evidence/nearby-transport-static-screening.json` の
   `baseline.packageJsonSha256` を再ピンする。** この baseline は
   `package.json` の内容全体を SHA-256 で固定したサプライチェーン drift 検出値
   （Issue 22 / ADR-0023）であり、`license` フィールドの変更だけでも
   `package.json` のバイト列が変わるため追従が必須になる。`bun.lock` は
   `license` フィールドの影響を受けないため `bunLockSha256` は変更しない。
   `bun scripts/nearby-transport-static-screening.ts
   docs/evidence/nearby-transport-static-screening.json` で SHA-256 不一致が
   発生しないことを確認する。

## Consequences

- Good: `susumutomita/TenkaCloud` 本家・`TenkaCloudChallenge` とライセンス表記が
  統一され、TenkaCloud プロジェクト群を横断して参照する利用者・Contributor が
  ライセンス条件の差異を確認するコストを負わなくなる。
- Good: Apache-2.0 の第 3 条（Patent License）と第 3 条後段の特許訴訟提起時の
  ライセンス終了条項により、MIT にはない明示的な特許保護が利用者に及ぶ。
- Bad: 既存の Contributor・Fork・派生物は MIT の条件下で受け取った履歴を持つ。
  本 ADR は今後のリポジトリ全体を Apache-2.0 に切り替えるものであり、過去に
  MIT 表記で配布された Git 履歴上のスナップショット自体を遡って書き換えるもの
  ではない。
- Tradeoff: 著作権者表記を本家同様「テンプレート未編集のまま」にする案を
  当初検討したが、本リポジトリは個人リポジトリであり著作権者を明示する方が
  利用者・Contributor にとって明確なため、Issue 105 の訂正に従い
  `Copyright 2024 Susumu Tomita` を明示する方針を採った。将来 owner 名義や
  設立年に変更が生じた場合は、この判断を再検討するトリガーとする。

## References

- 関連コード: `LICENSE`、`package.json`、`site/index.html`、`site/en/index.html`、
  `docs/evidence/nearby-transport-static-screening.json`。
- 関連 Issue: Issue 105（本 ADR の詳細設計・訂正の正本）。
- 関連 ADR: [ADR-0023](./0023-nearby-transport-evidence-gate.md)（`package.json`
  の SHA-256 baseline を持つ Static Screening Gate 自体の由来）、
  [ADR-0024](./0024-reproducible-source-release.md)（SPDX SBOM 生成が
  `Apache-2.0` を既に許可 SPDX 式として含む Source Release の正本）。
- 外部資料: <https://www.apache.org/licenses/LICENSE-2.0>、
  `gh api repos/susumutomita/TenkaCloud/contents/LICENSE`（本家 LICENSE 全文の
  取得元）。
