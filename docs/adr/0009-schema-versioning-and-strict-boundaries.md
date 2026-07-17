# ADR-0009: Schema Versioning と strict boundary を固定する

- **Status**: Accepted
- **Date**: 2026-07-17
- **Deciders**: Susumu Tomita (oyster880)

## Context

Local Private Profile、Public Passport、Lounge データ、Pet の判断、Peer Message、バックアップは、保存期間と
共有先が異なる。TypeScript の型だけでは QR、通信、モデル出力、バックアップ Import の実行時入力を拒否できず、
同じ object の再利用は個人情報や安定 ID の誤送信につながる。新しい依存を追加せず、Version、未知 field、
欠落、過大 payload、Migration 失敗を fail-closed にする境界が必要です。

## Decision

Domain のデータ種別を別の型にし、Public Passport は Local Private Profile から明示的な純粋 Projection
だけで生成する。Protocol 境界には allowlist key、必須 field、literal、配列件数、文字列長、UTF-8 byte 数、
ネスト深度を検証する依存なしの strict validator を置く。validator は入力をそのまま返さず、検証済みの
新しい object を組み立てる。

Peer Envelope は `protocolVersion.major` と `protocolVersion.minor` を必須にし、現行の `1.0` 以外を
拒否する。Lounge ID と Participant ID は Domain へ注入した乱数生成関数からセッションごとに生成し、
実行境界では Web Crypto の `crypto.getRandomValues` を使う。Migration は旧 schema を検証して変換する
純粋関数とし、失敗時に入力または既存データを変更しない。

比較した案は次のとおりです。

1. `zod`、Valibot、JSON Schema validator などの依存を追加する案である。宣言的な定義、error path、
   ecosystem を利用できるが、依存 tree と lifecycle を含む供給網境界が増え、依存追加禁止に反するため
   採用しない。
2. TypeScript の型 assertion と `JSON.parse` だけを使う案である。コード量は少ないが、実行時の未知 field、
   欠落、Version、byte 数、深度を検証できず、外部入力を信頼するため採用しない。
3. すべての型を 1 つの汎用 message と optional field で表す案である。serializer は共通化できるが、
   Local Private Profile と公開値、保存値と Lounge 値の混入を型で防げないため採用しない。
4. 別 Domain 型、依存なし strict validator、純粋 Migration、Web Crypto adapter を分離する案である。
   validator の保守と分岐テストが必要になるが、供給網を増やさず型と実行時境界を固定できるため採用する。

## Consequences

- **Good**: Local Private Profile の field は Projection の allowlist を通らなければ公開されない。
- **Good**: 未知 field、欠落、未知 Version、過大 payload、深すぎる JSON を利用前に拒否できる。
- **Good**: Peer Message に Raw LLM Prompt、Chain of Thought、安定 ID、連絡先を表す field が存在しない。
- **Good**: Migration 失敗で入力または既存の保存データを部分更新しない。
- **Bad**: schema ごとに parser と正常、異常、境界、互換性テストを保守する必要がある。
- **Bad**: forward-compatible な未知の Minor Version も、対応 schema を実装するまでは受理できない。
- **Tradeoff**: schema の種類と互換性 matrix が増え、依存なし validator の重複が保守負担になった場合は、
  lockfile、license、lifecycle、bundle を再評価する ADR を作成して schema library を再検討する。

## References

- 関連コード: [`src/domain/passport.ts`](../../src/domain/passport.ts)。
- 関連コード: [`src/protocol/`](../../src/protocol/)。
- 関連文書: [Data Model と Protocol Version](../architecture/data-model.md)。
- 関連 ADR: [ADR-0007](./0007-privacy-data-contract.md)。
- 関連 Issue: Issue 5。
