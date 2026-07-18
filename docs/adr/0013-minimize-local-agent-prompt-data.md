# ADR-0013: Local Agent へは導出済み Evidence だけを渡す

- **Status**: Accepted。
- **Date**: 2026-07-18。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

ADR-0012 は System Instruction と Untrusted JSON を別 Message にしたが、Issue 17 の初期実装は
consented Public Passport 全体を User Message へ含めていた。`petName` と `ownerAlias` は Bridge の
Evidence 選択に不要であり、命令文、URL、Unicode 制御文字を含み得る。Delimiter や危険語句の
Blocklist だけでは、不要な攻撃入力を Model Context へ渡す事実を解消できない。

## Decision

Native Adapter は `AgentModelInput` を実行直前に strict schema で再検証し、Unicode
`Default_Ignorable_Code_Point` と `Cc` 制御文字を拒否して
表示文字列を NFC へ正規化する。その後、信頼側 Domain が導出した閉じた `allowedEvidence` だけを
版付き・4 KiB 以下の User JSON Message へ射影する。Public Passport の表示文字列、Owner Answer
本文、Raw Prompt、端末 Path、URL、Contact は Prompt へ含めない。

Output は JSON parse 前に UTF-8 4 KiB、parse 後に深度 4 へ制限し、引き続き strict JSON Schema と
Runtime Validator の二重境界を通して Evidence ID または `no-signal` 以外を表現させない。Tool Port は
定義しない。入力・出力の Safety Failure は内容を
反射しない `SCHEMA_ERROR` とし、同じ Encounter で Rules へ 1 回だけ切り替える。

## Consequences

- **Good**: Plain Text の攻撃語句を判別できなくても、不要な文字列は Model Context へ到達しない。
- **Good**: Prompt の byte 数と構造が Domain の列挙型で上限化され、深い JSON と巨大 Payload を
  Model が処理しない。
- **Good**: Error、Log、UI、再試行 Prompt へ攻撃文字列を反射する経路を減らせる。
- **Bad**: Model は Pet 名や Alias を使った自然な言い回しを作れない。
- **Tradeoff**: Human-facing Opener は信頼側固定 Renderer が作る。将来自由記述を許可する場合は、
  新しい Output Contract、意味検証、実機 Red Team 証跡を伴う新 ADR が必要である。

## References

- 関連設計: [Local Agent の入力・出力安全境界](../design/local-agent-input-output-safety.md)。
- 関連 ADR: [ADR-0012](./0012-llama-provider-runtime-boundary.md)。
- 脅威モデル: [TenkaCloud Passport 脅威モデル](../security/threat-model.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/19 。
