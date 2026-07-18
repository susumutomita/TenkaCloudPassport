# ADR-0022: Local Champion 運用を中央人物台帳から分離する

- Status: Accepted
- Date: 2026-07-18
- Deciders: Susumu Tomita

## Context

Core Team が現地へ移動せず対面 Lounge を広げるには、地域で進行する Local Champion と再利用可能な
Facilitator Kit が必要になる。一方、中央 CRM、認定制度、開催数による評価を導入すると、Product が避ける
人物検索、安定追跡、ランキングを運用側で作り直してしまう。文書を渡すだけでは、Product / Research Consent、
QR、20 分削除境界の誤説明を初回 Event 前に検出できない。

## Decision

Facilitator Kit は Repository 内の JA / EN 版管理文書を正本とし、外部 Contributor が Pull Request で
改訂できる。Local Champion Lifecycle は発見、招待、30 分以内の Orientation、第三者 Dry Run、初回開催、
内容を持たない Feedback、再開催または辞退に限定する。

候補者の発見には OSS、Cloud、CTF、教育 Community の公開 Contribution、公開 Event、公開 Talk、公開 Organizer
情報だけを使う。本人との会話では関心、2〜6 名を開催できる可能性、地域との接続、継続意思を確認するが、
数値 Score、順位、比較表、認定資格、中央 Ambassador Database を作らない。

招待は雇用、報酬、義務を意味しない。本人はどの段階でも理由なしに辞退でき、招待 Channel の管理者へ、
招待のために保持した任意 Contact と手動 Note の削除を依頼できる。情報を中央 Registry へ複製しない。
公開 Source 自体と、すでに非識別 Aggregate へ混合した件数は個別に削除できないことを過大に約束しない。

比較した案を次に示す。

1. 中央 CRM と認定制度は、個人追跡、Score、削除対象を増やすため採用しない。
2. 非同期の文書配布だけにする案は、Privacy 誤説明を初回 Event 前に検出できないため採用しない。
3. Repository Kit、短い Orientation、実在者の Dry Run を組み合わせ、中央台帳なしで段階 Gate を置く。

## Consequences

- Good: Product の人物非評価と安定 ID 不使用を運用側でも維持できる。
- Good: Kit の変更理由と差分を公開 Review でき、企業や特定 Platform に依存しない。
- Good: Champion は理由なしに辞退でき、削除要求の対象が既存招待 Channel に限定される。
- Bad: Core Team は誰が何回開催したかを中央集計できず、全地域を一括で比較できない。
- Bad: 初回 Orientation と実在者 Dry Run の時間が必要であり、Repository Test だけでは完了できない。
- Tradeoff: Privacy Incident の安全な対応に本人連絡が不可欠になった場合は、この ADR に Contact Database を
  追加せず、別の承認済み Incident Process と Data Contract を先に設計する。

## References

- 関連仕様: [Facilitator Kit と Local Champion 運用仕様書](../specs/2026-07-18-facilitator-kit-and-local-champion.md) である。
- 関連設計: [Facilitator Kit と Local Champion 運用設計](../design/facilitator-kit-and-local-champion.md) である。
- 関連 Product Contract: [TenkaCloud Passport プロダクト契約](../product/product-contract.md) である。
- 関連 Privacy ADR: [ADR-0007](./0007-privacy-data-contract.md) である。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/27 である。
