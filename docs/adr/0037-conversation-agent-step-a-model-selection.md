# ADR-0037: 端末内会話エージェント Step A の実装と、Native デフォルトモデルに Qwen2.5-1.5B-Instruct を選ぶ

- **Status**: Accepted。
- **Date**: 2026-07-23。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

[ADR-0036](./0036-on-device-conversation-agent.md) と
[端末内会話エージェント（Intro Card 版）の設計](../design/2026-07-23-on-device-conversation-agent.md)
が Step A（2 者間、テーマ・カタログ方式）の技術設計と、Bonsai 27B 採用を条件付き
follow-up にする判断を既に確定している。本 ADR はその設計に基づく実装（Issue 104）の
確定事項を記録する。

ADR-0036 は「v1.0 は 0.5B〜3B class の instruct model を owner が既存 GGUF Import
経路（Issue 18）でそのまま import する」と方向性だけを決め、具体的な Model 名は
保留していた。実装にあたり、依頼文が例示した 2 候補（Bonsai-8B-Q1_0 / Qwen2.5-1.5B
または 3B Instruct）を一次資料で確認した。

## Decision

### Step A の実装は設計文書のとおり、既存 Contract の再利用だけで完結させる

- `IntroCard.themeIds?: readonly ClueId[]`（`clue-catalog.ts` 再利用、最大 3 件、`INTRO_CARD_MAX_THEMES`）を `src/domain/intro-card.ts` に追加した。
- `src/protocol/intro-card-url.ts` に加算的な `m` key を追加した。`themeIds` が
  無い/空のカードは `m` を省略し、既存 QR と byte 一致する
 （`src/protocol/intro-card-url.test.ts` の回帰テストで固定）。`site/c/index.html`
  の allowlist・`scripts/intro-card-viewer-decoder-parity.test.ts` も同時対応した。
- `src/domain/conversation-session.ts`（新規）が受信した Intro Card を非永続の
  メモリだけに保持する（Storage Port を持たない）。
- `src/domain/conversation-agent-evidence.ts`（新規）が Intro Card を
  `PublicPassport` へ投影するアダプタと、`bridge-selection.ts` の N 者間
  Fairness・既存 2 者間 `AgentModelProvider` Contract への橋渡しをする。新しい
  Provider Contract・Prompt/Output Schema は作らない。
- UI は `ConversationAgentScreen.tsx`（新規）+ `use-conversation-agent-flow.ts`
 （新規 hook、`use-pilot-measurement-flow.ts` と同じ「複雑な flow を hook へ
  集約し `PassportApp.tsx` の Cognitive Complexity を抑える」既存方針を踏襲）。
  相手カードは QR 再スキャン・手動貼り付け・審査官向けサンプルカードの 3 経路で
  取り込む。到達導線は Settings 経由の 1 経路（quiz と同じ、控えめな入口）。
  `IntroCardEditScreen.tsx` は既存 `ClueSelector` component（Passport 作成画面と
  同じ）を再利用してテーマを選択する。

### Native のデフォルト Model は Qwen2.5-1.5B-Instruct（Q4_K_M GGUF、Apache-2.0）を推奨する

依頼文の 2 候補を一次資料で確認した結果は次のとおり。

| 候補 | 実在 | ライセンス | サイズ（Q4_K_M 相当） | llama.cpp/llama.rn 対応 |
| --- | --- | --- | --- | --- |
| Bonsai-8B-Q1_0 | 実在（`prism-ml/Bonsai-8B-gguf`, Hugging Face） | Apache-2.0 | 約 1.16 GB（Q1_0 量子化） | 量子化テンソル型（`Q1_0`）は mainline 対応済みだが、Bonsai 固有のモデルアーキテクチャ（hybrid-attention）が `llama.rn` の Metal backend で実際に Load・Completion まで動く一次資料は無い（ADR-0036 と同じ未検証の論点が 8B でも解消していない）。 |
| Qwen2.5-1.5B-Instruct | 実在（`Qwen/Qwen2.5-1.5B-Instruct-GGUF`, Hugging Face、Qwen 公式） | **Apache-2.0** | **1.12 GB** | **モデルカード自身が `llama.cpp`（`llama serve -hf ...`）での利用方法を明記**。Qwen2 系アーキテクチャは llama.cpp で長期間の実績があり、`llama.rn` は同じ mainline llama.cpp を追従するため、量子化テンソル型・モデルアーキテクチャの両方に一次資料の裏付けがある。 |
| Qwen2.5-3B-Instruct | 実在 | **qwen-research**（Apache-2.0 ではない） | 2.1 GB | 対応は同様だが、ライセンスが Apache-2.0 ではなく Alibaba の research license のため、依頼文の「Apache/MIT」要件を満たさない。 |

この根拠から、v1.0 の Native デフォルト推奨は **Qwen2.5-1.5B-Instruct（`Q4_K_M`
量子化、約 1.12 GB、Apache-2.0）** とする。`ADR-0014` の Resource Risk 式に
概算すると `estimatedWorkingSetBytes ≈ ceil(1.12GB * 1.2) + 2048 * 256KiB ≈ 1.86 GB`
であり、現行世代 iPhone の実効 Memory を分母にした `ratio` は `0.45` 以下の
`supported` に収まる見込みが高い（実測は owner の物理端末ゲートに委ねる）。

Qwen2.5-3B-Instruct は同じ Qwen2 系列でサイズに余裕がある端末向けの upsize 候補
として残すが、ライセンスが Apache-2.0 ではないため v1.0 のデフォルト推奨には採用しない。
Bonsai-8B-Q1_0 は ADR-0036 と同じ理由（`llama.rn` 実機実行の一次資料が無い）で
条件付き follow-up のまま残す。

### Model は既存の仕組みのままプラガブルにする。新しい選定コードは書かない

Model ID は既存の `EXPO_PUBLIC_LOCAL_MODEL_PATH` 環境変数（
`src/app/default-agent-model-provider.native.ts` /
`src/local-agent/configured-agent-model-provider.ts`）または Issue 18 の GGUF
Import（`src/local-agent/model-lifecycle.ts`）のどちらかで注入され、コードに
Model ID を直書きしない既存契約をそのまま維持する。会話エージェントは
`PassportApp.tsx` が保持する `localModels.provider`（Rules または Local Agent）を
Pet Interaction と同じ共有 instance としてそのまま再利用し、新しい Provider
選定ロジックは追加しない。上記の推奨 Model は owner が import する際の運用上の
推奨であり、コード側の分岐条件にはならない。

## Consequences

- **Good**: 依頼文が例示した 2 候補を実際に一次資料で確認したことで、
 「Apache/MIT ライセンスの小型 instruct GGUF」という要件を満たす具体的な
  推奨（Qwen2.5-1.5B-Instruct）を、根拠付きで残せた。
- **Good**: Model 選定はコードへ一切影響しない（推奨はドキュメントのみ）ため、
  将来推奨を変える場合も ADR の追記だけで済み、コード変更・審査影響が無い。
- **Bad**: Qwen2.5-3B-Instruct はサイズ・対応の両面で魅力的だったが、
  ライセンスの都合で不採用にした。将来 Apache-2.0 の 3B class instruct model が
  出た場合は本 ADR を追記・supersede して差し替えられる。
- **Tradeoff**: Bonsai-8B-Q1_0 は 27B 版よりはるかに小さく Resource Risk 上も
  有望だが、`llama.rn` 実機実行の一次資料が無い点は解消していない。ADR-0036 の
  Step C 条件（物理端末での Load・First Token・Completion 到達の証跡化）が
  Bonsai-8B にも適用される。

## References

- 関連設計: [端末内会話エージェント（Intro Card 版）の設計](../design/2026-07-23-on-device-conversation-agent.md)。
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)（本 ADR が前提とする
  Step A 設計・Bonsai 27B 保留判断）、[ADR-0014](./0014-private-gguf-lifecycle-and-resource-guard.md)、
  [ADR-0023](./0023-llama-provider-runtime-boundary.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/104 。
- 外部資料: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF 。
- 外部資料: https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF 。
- 外部資料: https://huggingface.co/prism-ml/Bonsai-8B-gguf 。
- 外部資料: https://github.com/mybigday/llama.rn 。
