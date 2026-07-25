# ADR-0041: 端末内会話エージェント Step B（N 者間の全ペア評価）

- **Status**: Accepted
- **Date**: 2026-07-25
- **Deciders**: リポジトリメンテナ (susumutomita)

## Context

[ADR-0036](./0036-on-device-conversation-agent.md) は端末内会話エージェントを
Step A（2 者間）→ Step B（N 者間 UI）→ Step C（Bonsai、条件付き）の順で
進めると決めた。Step A は実装済みで、`docs/design/2026-07-23-on-device-conversation-agent.md`
のとおり Domain 層（`conversation-session.ts` /
`conversation-agent-evidence.ts`）は最初から `MAX_BRIDGE_SELECTION_PARTICIPANTS`
までの N 者間セッションを扱える形になっている。

しかし Step A の UI は相手 1 名で取り込み導線を隠し、`use-conversation-agent-flow.ts`
の `addPeer` も `peers.length > 0` で 2 人目以降を無言で拒否していた。この結果、
Issue 104 の受入基準「複数参加者の全ペアを端末内で評価し、最も根拠の強い 1 組へ
会話理由と最初の質問を提示する」が満たせていなかった。

さらに `onStart` には、既に根拠があるのに結果を出さない欠陥があった。
`bridge-selection.ts` は 3 名を 1 つの Bridge へ統合することがあり、そのとき
2 者間専用の `AgentModelInput` は組み立てられず `buildConversationAgentModelInput`
が `null` を返す。Step A の実装はこれを `no-signal`（共通点が見つからなかった）
として扱っていたため、Rules が Reason / Opener を計算済みでも画面には
「共通点が見つかりませんでした」と表示されていた。

## Decision

Step B を次の 3 点で実装する。Domain の Fairness Rule・Confidence 判定・
Provider Contract は一切変更せず、UI と配線だけを N 者間へ広げる。

1. **参加者上限を Domain と一致させる**。`addPeer` の 2 人目拒否を外し、
   `addConversationSessionPeer` が持つ `MAX_BRIDGE_SELECTION_PARTICIPANTS`
   （自分を含めて 6 名）を唯一の上限にする。上限超過は `SESSION_FULL` を
   投げて理由を表示し、無言で落とさない。画面は取り込み済みの相手を全件
   リスト表示し、1 名ずつ削除ボタンを持つ。PR-132 の blocker（見えない
   2 人目が個別に消せなくなる）は、この全件表示によって構造的に解消する。

2. **3 名以上へ統合された Bridge は Rules の結果をそのまま提示する**。
   ADR-0036 の「N 者間の Evidence 抽出は Rules で全ペア同期計算し、Local Agent は
   最終選定後の 1 組にだけ適用する」を、`no-signal` へ落とさず
   `bridge.reason` / `bridge.opener` を表示する経路として実装する。

3. **選ばれた組を名前で示す**。3 名以上のセッションでは「どの 1 組が選ばれたか」が
   分からないと Reason / Opener を使えないため、
   `conversationBridgePartnerNames` が返す自分以外の Bridge 参加者名を
   Reason・Opener より先に読み上げる位置へ置く。

`onStart` の 3 分岐（`no-signal` / `rules-bridge` / `provider-run`）は
`conversation-agent-flow-controller.ts` の純関数 `planConversationAgentStart` へ
切り出す。この repo は React render harness を持たないため、hook 本体に判断を
残すとテストできない。既存の `performConversationAgentCleanup` /
`resolveScannedPeer` と同じ「間違えやすい判断だけを DI 可能な純関数へ出し、
hook は配線に留める」流儀をそのまま踏襲する。

### 採らなかった選択肢

- **N 者間専用の Provider Contract を新設する**。`AgentModelInput` を 3 者以上へ
  拡張すれば Local Agent を統合 Bridge にも適用できるが、Pet Interaction と
  共有している 2 者間 Contract を破ることになり、Rules / Local Agent の
  両実装と Native Lane の直列実行制御まで波及する。Rules の結果を提示すれば
  受入基準は満たせるため、Contract は据え置く。再検討のトリガーは Step C
  （Bonsai）で統合 Bridge の文面品質が問題になったとき。
- **未達成の前提を持つ相手を UI で lock する**。参加者が増えるほど「誰を選ぶか」
  を UI 側で絞りたくなるが、選定は Domain の Fairness Rule の責務であり、
  UI が二重に絞ると根拠と表示が食い違う。UI は上限と削除だけを持つ。

## Consequences

- **Good**: Issue 104 の受入基準（全ペア評価 → 最も根拠の強い 1 組の提示）が
  満たされる。根拠があるのに `no-signal` を表示していた欠陥が解消する。
  `onStart` の判断が純関数になり、3 分岐すべてがテストで固定される。
- **Bad**: 統合 Bridge（3 名以上）では Local Agent が使われず、Rules の
  定型文がそのまま出る。文面の質は 2 者間より劣る。
- **Tradeoff**: 参加者が増えるほど 1 画面のリストは長くなる。上限 6 名までは
  スクロールで足りると判断し、グルーピングやフィルタは持たない。上限を
  引き上げる要求が出たときに再検討する。

## References

- 関連コード: `src/app/conversation-agent-flow-controller.ts`,
  `src/app/use-conversation-agent-flow.ts`,
  `src/domain/conversation-agent-evidence.ts`,
  `src/screens/ConversationAgentScreen.tsx`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/104
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md),
  [ADR-0037](./0037-conversation-agent-step-a-model-selection.md),
  [ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)
- 関連設計文書: `docs/design/2026-07-23-on-device-conversation-agent.md`
