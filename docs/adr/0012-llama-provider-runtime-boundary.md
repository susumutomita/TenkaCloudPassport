# ADR-0012: llama.rn を Encounter 単位の遅延 Native Provider として隔離する

- **Status**: Accepted。
- **Date**: 2026-07-18。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Issue 16 で Rules と Local Agent が共有する Output Schema、Validator、Fallback-once、Runtime State を
確定したが、実際の Native module、Model Context、Streaming Cancel は未接続になっている。`llama.rn` は Expo Go /
Web では利用できず、Model Context は Passport Data と大きな Native Memory を保持し得る。Native Integration
を App 全体の singleton にすると、Encounter 終了後の Data と Memory の所有者が曖昧になる。

## Decision

`llama.rn` は iOS / Android Development Build 専用の Platform Composition Root から関数内 dynamic import
する。Web、Expo Go、Model 未設定環境は Native module を読まず Rules Provider を使う。Public Environment
Variable は Expo の bundle inline 契約どおり直接プロパティ参照する。通常 install の
`trustedDependencies` は空のままにし、ADR-0010 の `make setup-llama-native` だけが検証済み Native Artifact を
取得する。

Model Context は Encounter ごとに作成し、Completion の成功・失敗・Cancel の全経路で解放する。Runner の
Deadline、Lounge Exit / Expire、画面 Unmount は同じ `AbortSignal` へ収束させ、Completion 中は
`stopCompletion()` の後に `release()` する。Runner は Deadline の Rules Outcome を期限で返しつつ、Release
完了まで Native Lane の所有権を保持して前後の Context lifetime を重ねない。Model Output は strict JSON
Schema で Evidence ID だけに制限し、
共通 Runtime Validator が入力から再検証した後、既存の信頼側 Bridge constructor で Live Outcome を作る。

## Consequences

- **Good**: Web / Expo Go は Native module の Top-level import と初期化に巻き込まれない。
- **Good**: Encounter 終了と Native Context 解放の所有者が一致し、Passport Data を次の Encounter へ残さない。
- **Good**: Prompt Injection や不正 JSON が表示文・Tool・外部 Action へ到達する面を Schema から除外できる。
- **Bad**: Encounter ごとに Model を読み込むため、Context 再利用より開始が遅い。
- **Bad**: JavaScript / CI だけでは iPhone / Android arm64 実機の Offline 成功を証明できない。
- **Tradeoff**: Context 再利用は、KV Cache 分離、Native Memory 上限、明示的な所有権を実機で証明できた場合だけ
  新しい ADR で再検討する。

## References

- 関連設計: [llama.rn Provider と Development Build 統合の設計](../design/llama-provider-development-build.md)。
- 関連 ADR: [ADR-0008](./0008-expo-local-agent-foundation.md)。
- 関連 ADR: [ADR-0010](./0010-native-delivery-quality-gates.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/17 。
- 外部資料: https://github.com/mybigday/llama.rn 。
- 外部資料: https://docs.expo.dev/develop/development-builds/introduction/ 。
