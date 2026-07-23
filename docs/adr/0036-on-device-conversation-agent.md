# ADR-0036: 端末内会話エージェントは既存 Provider Contract を再利用し、Bonsai 27B 採用は条件付き follow-up にする

- **Status**: Accepted。
- **Date**: 2026-07-23。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Owner は Issue 104（端末内会話エージェントを自己紹介カードへ追加する）を起票し、
自己紹介カード同士の確認済み会話テーマから最も根拠の強い 1 組へ会話理由と最初の質問を
提示する機能を App Store v1.0 の native な目玉にしたいと考えている。owner は PrismML の
Bonsai 27B（1-bit 3.9 GB 相当 / Ternary 5.9 GB 相当、Apache-2.0）を推論モデルの候補として
希望した。この Repo は既に `llama.rn` 0.12.6（`ggml-org/llama.cpp` commit `b9982` 相当）を
唯一の Native 推論経路として [ADR-0023](./0023-llama-provider-runtime-boundary.md) に
固定し、[ADR-0014](./0014-private-gguf-lifecycle-and-resource-guard.md) が保守的な
Resource Risk Gate と物理端末の完了ゲートを既に定めている。[Agent Model Provider
Contract](../design/agent-model-provider-contract.md) は Rules / Local Agent が同じ
`evidenceIds` 閉集合だけを扱う Provider Contract を、[Local Model Safety
Boundary](../design/model-safety-boundary.md) は Passport の自由記述を Model へ渡さない
境界を、それぞれ既に確定している。

一次資料を調査した結果、PrismML Bonsai 27B は実在し（2026-07-14 公開）、1-bit 版の
量子化テンソル型（`Q1_0`, group 128）は mainline `llama.cpp` へ取り込み済みだが、Ternary
版（`Q2_0`）は PrismML 独自 fork でしか動かず、かつ PrismML 自身が「Ternary は約 7.2 GB
で iOS の per-app memory budget（約 6 GB）を超えるため phone では 1-bit 版を使う」と
明言している。React Native binding（`llama.rn`）・実機での Bonsai 動作実績を示す一次資料は
見つからず、1-bit 版単体でも本 Repo の既存 Resource Risk 式（`ratio > 0.60` で
`blocked`）に当てはめると `ratio ≈ 0.79` となり、production entitlement が development
限定に絞られている現状（follow-up VW8T2M）ではさらに悪化する。詳細な出典と計算は
[端末内会話エージェント（Intro Card 版）の設計](../design/2026-07-23-on-device-conversation-agent.md)
に記す。

## Decision

### 会話エージェントの Provider 境界は新設せず、既存 Contract をそのまま再利用する

新しい Provider Contract・Prompt Schema・Output Schema は作らない。会話エージェントは
`AgentModelProvider`（Rules 基準実装 + 既存 `llama-agent-model-provider.ts`）を、Evidence
の出所が Lounge Passport からこの新しい `ConversationSession`（後述）へ変わるだけで
そのまま再利用する。Native 境界を横切るのは既存どおり閉じたカタログ ID
（`evidenceIds`）だけであり、氏名・連絡先・URL・自己紹介自由文は投影しない。

### Intro Card は `themeIds`（既存カタログ再利用、最大 3 件）を持つ

`IntroCard.themeIds?: readonly ClueId[]` を追加し、Passport が使う既存
`clue-catalog.ts` をそのまま再利用する。専用の新しいカタログは作らない。自己紹介ページ
URL（`src/protocol/intro-card-url.ts`）は `q`（クイズ進捗、Issue 110）と同じ
all-or-nothing・fail-closed 検証パターンを踏襲した新しい任意 key（`m`）を追加し、
`v: 1` のまま後方互換を維持する。

### 受信カードは非永続のメモリ限定セッションとして扱い、ADR-0026 の受信禁止を会話エージェントの範囲に限り supersede する

新設する `ConversationSession`（2〜6 名、`bridge-selection.ts` の既存上限を再利用）は、
QR 再スキャンまたは URL 貼り付けで取り込んだ他者の Intro Card をプロセス生存中の
メモリだけに保持し、Storage Port を持たない。明示的なセッション終了操作・画面遷移・
アプリ終了で即時に破棄され、ディスク・バックアップのどこにも書き込まない。
[ADR-0026](./0026-intro-card-pivot.md) の「アプリ側は相手の情報を受信・保存・パースしない。
相互交換は Step 1 のスコープ外である」という記述は、この会話エージェントが明示的に
受信する Intro Card の範囲に限り supersede する。ADR-0007 が定める Lounge / Public
Passport / Pet Message の匿名性契約と、Intro Card 自体の「Owner が自分自身について
明示入力する」という ADR-0026 のそれ以外の契約は一切変更しない。

### N 者間の Evidence 抽出は Rules で全ペア同期計算し、Local Agent は最終選定後の 1 組にだけ適用する

`bridge-selection.ts` の `selectBridges` / Fairness ロジックをそのまま使い、
全ペアの Evidence 抽出は Rules（純関数・同期・決定的）で行う。Local Agent（任意）は
ADR-0023 の「単一 Native Lane」制約を尊重し、Rules が既に選び終えた 1 組にだけ適用する。
N 者間の全ペアへ Local Agent を逐次呼び出す設計は採用しない。

### Bonsai 27B の採用は次の 3 条件をすべて満たすまで保留する

1. `llama.rn` が Bonsai 1-bit GGUF を物理 iPhone / Android arm64 実機で Load・First
   Token・Completion まで到達することを、ADR-0014/0023 の物理端末完了ゲートで証跡化する。
2. `llama.rn` の memory entitlement を production へ復元し（follow-up VW8T2M 解消）、
   App Store 提出可能な状態であることを確認する。
3. 本機能の narrow task（閉じたカタログ ID の部分集合選定）における品質を、
   0.5B〜3B class の baseline Model と比較し、追加の Footprint・Latency に見合う
   差があることを確認する。

3 条件を満たすまでは v1.0・以降の運用で 0.5B〜3B class の Model を owner が Issue 18 の
既存 GGUF Import 経路でそのまま import する。この決定はコードへの変更を要求しない
（Resource Risk Gate がデフォルトで保守的に `blocked/caution` 側へ倒れる設計のため、Bonsai を
未検証のまま import しても既存の fail-closed 挙動がそのまま安全側で機能する）。

## Consequences

- **Good**: 新しい Provider Contract・Prompt/Output Schema・Native スタックを増やさず、
  既存の Safety Boundary・Context lease 規律・Resource Risk Gate をそのまま転用できる。
- **Good**: 会話テーマのカタログを Passport と共有することで、同じ関心事が 2 つの ID
  体系に分裂するドリフトを避けられる。
- **Good**: Bonsai 27B 採用を条件付き follow-up にすることで、「動くかどうか分からない
  ものを唯一の入口にする」リスクを避けつつ、根拠が揃った時点でコード変更なしに
  運用切り替えできる設計を残す。
- **Bad**: 受信カードのメモリ限定保持は ADR-0026 の受信禁止の記述を部分的に supersede
  する必要があり、Privacy ドキュメント（`docs/privacy/data-inventory.md`）の更新が
  実装 Issue 側で追加作業として発生する。
- **Bad**: v1.0 が Bonsai を採用しないため、「App Store 4.2 への native な回答」という
  owner の当初イメージ（27B 級モデルが目玉）とは異なる、より小さいモデルでの初期
  リリースになる。
- **Tradeoff**: Bonsai 1-bit の再検討は、`llama.rn` 実機証跡・production entitlement
  復元・narrow task での品質比較の 3 条件がそろった時点で、新しい ADR により本 ADR を
  supersede する形で行う。

## References

- 関連設計: [端末内会話エージェント（Intro Card 版）の設計](../design/2026-07-23-on-device-conversation-agent.md)。
- 関連設計: [Agent Model Provider Contract](../design/agent-model-provider-contract.md)。
- 関連設計: [Local Model Safety Boundary](../design/model-safety-boundary.md)。
- 関連設計: [根拠付き Bridge 選定アルゴリズム](../design/bridge-selection.md)。
- 関連設計: [GGUF Import・Resource Guard・Benchmark](../design/gguf-model-lifecycle.md)。
- 関連 ADR: [ADR-0007](./0007-privacy-data-contract.md)（Lounge / Public Passport /
  Pet Message の匿名性契約、本 ADR では変更しない）。
- 関連 ADR: [ADR-0014](./0014-private-gguf-lifecycle-and-resource-guard.md)。
- 関連 ADR: [ADR-0023](./0023-llama-provider-runtime-boundary.md)。
- 関連 ADR: [ADR-0026](./0026-intro-card-pivot.md)（受信禁止の記述を会話エージェントの
  範囲に限り追加 supersede）、[ADR-0027](./0027-intro-card-url-viewer.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/104 。
- 関連 follow-up: `.claude/state/follow-ups.jsonl` の `01KY4W8FE17WMR049WB3VW8T2M`。
- 外部資料: https://docs.prismml.com/models/bonsai-27b 。
- 外部資料: https://docs.prismml.com/run/llamacpp 。
- 外部資料: https://huggingface.co/prism-ml/Bonsai-27B-gguf 。
- 外部資料: https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf 。
- 外部資料: https://github.com/ggml-org/llama.cpp/discussions/22019 。
- 外部資料: https://github.com/mybigday/llama.rn/releases 。
