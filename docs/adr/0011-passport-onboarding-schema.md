# ADR-0011: Passport 初回設定を Version 2 で表現する

- **Status**: Accepted
- **Date**: 2026-07-17
- **Deciders**: Susumu Tomita (oyster880)

## Context

Issue 7 では既存の手掛かりだけの Local Private Profile と Public Passport に、Pet Name、Pet Emoji、
任意の Owner Alias、Languages を追加する。既存の Schema Version 1 と Peer Protocol 1.0 のまま必須
field を追加すると、旧データを同じ Version として受理または拒否し、互換性判断ができない。明示保存した
Local Profile の Migration と、新旧 Peer の fail-closed な識別が必要です。

## Decision

Local Private Profile と Public Passport を Schema Version 2、バックアップを Schema Version 2、
Peer Protocol を Version 1.1 にする。Version 1 のバックアップは strict に検証してから、Pet Name を
「マイペット」、Pet Emoji を「🐾」、Owner Alias と Languages を空として Version 2 へ移行する。
Version 0 も同じ Version 2 へ一段で移行する。手掛かりが 0 件の旧 Profile は新しい有効条件を満たさない
ため、値を捏造せず Migration を拒否します。

比較した案は次のとおりです。

1. Version 1 のまま field を追加する案である。変更量は少ないが、旧 Version 1 と新 Version 1 を
   区別できず、ADR-0009 の互換性契約に反するため採用しない。
2. Pet の表示情報を app state だけに置く案である。既存 Schema を保てるが、再起動後に Local Profile を
   完全復元できず、Preview と Payload の一致を型で守れないため採用しない。
3. Local、Public、バックアップ、Peer の Version を明示的に上げ、旧バックアップだけを純粋 Migration する案である。
   parser とテストの更新は増えるが、保存と通信の境界を曖昧にしないため採用する。

## Consequences

- **Good**: 旧保存データと新しい必須 field を同じ Version として誤解釈しない。
- **Good**: Peer は Protocol Version 1.0 と 1.1 を通信前に区別し、未対応形を fail-closed にできる。
- **Good**: Migration は入力を変更せず、成功時だけ Version 2 の新しい object を返す。
- **Bad**: 旧 Public Passport と Peer Protocol 1.0 との通信互換性はなく、双方の更新が必要である。
- **Tradeoff**: 公開前のアプリで互換 shim を長期保持するより、Version 境界を明示して単一の現行 Schema を
  保守する。外部配布後に互換期間が必要になった場合は別 ADR で複数 Version の受理期間を定める。

## References

- 関連コード: [`src/domain/passport.ts`](../../src/domain/passport.ts)。
- 関連コード: [`src/protocol/schema.ts`](../../src/protocol/schema.ts)。
- 関連文書: [Passport 初回設定の設計](../design/passport-onboarding.md)。
- 関連 ADR: [ADR-0009](./0009-schema-versioning-and-strict-boundaries.md)。
- 関連 Issue: Issue 7。
