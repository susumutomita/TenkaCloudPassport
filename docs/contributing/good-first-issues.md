# Good First Issue Candidates

この 3 件は Public OSS Alpha 前に重複を再確認し、GitHub 上で実在する Open Issue として作る Candidate です。
現時点の文書だけを Issue 29 の「3 Open Issues」達成証拠にしません。

## 1. Relative Link Contract を追加する

- Outcome: README、Release、Contributor 文書の相対 Link と Fragment が Source Archive 内で解決する。
- In scope: 実 File I/O の Link parser、欠損 File / Fragment / absolute local path の Negative Test。
- Out of scope: Network crawler、外部 URL の可用性判定、文書内容の書換え。
- Acceptance: 日本語 BDD Test、`make before-commit`、壊した実 Link が Red になる証拠。

## 2. Release Evidence Expiry Validator を追加する

- Outcome: Device Matrix の `Verified` 行が Commit、Build、Environment、Date、Evidence、Limitation を欠くと拒否する。
- In scope: Markdown Table の構造検査、空欄、期限切れ、未知 Status の Negative Test。
- Out of scope: 実機実行、Evidence の捏造、`Not run` から `Verified` への変更。
- Acceptance: `Verified / Not run / Blocked` の閉じた集合と、実文書を危険変形した Red Test。

## 3. Source Candidate Inventory Reader を追加する

- Outcome: `release-manifest.json` と展開 Archive の File 集合が一致し、未知 File を拒否する。
- In scope: Source-only Artifact パス containment、duplicate entry、case collision の実 Archive Test。
- Out of scope: APK / IPA、Model Weight、署名鍵、Cloud Release publication。
- Acceptance: 実 `git archive` / File I/O、型付き Error、全 Gate、禁止 Artifact を含む Fixture の Red Test。

各 GitHub Issue には本ページ、[Product Contract](../product/product-contract.md)、
[Contributing](../../CONTRIBUTING.md)への Link、検証 Command、Known limitation を貼ります。
