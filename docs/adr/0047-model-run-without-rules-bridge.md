# ADR-0047: Rules bridge が無くても、1 対 1 で自由記述が揃っていればモデルを走らせる

- **Status**: Accepted
- **Date**: 2026-07-27
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md) は Consequences
の Good として「checkbox（`IntroCard.themeIds`）の一致が 1 件も無いペアでも、自己紹介文
が重なっていれば共通点を提示できる」ことを約束したが、実際には未実装だった。owner は
実機で、自分のカード（テーマ `local-tournament` のみ・自己紹介文なし）を使うと会話
エージェントが繰り返し no-signal になることを観測し、Issue 152 として報告した。

原因は `planConversationAgentStart`（`src/app/conversation-agent-flow-controller.ts`）
にあった。

```ts
const bridgeResult = selectConversationBridge(session); // themeIds のみで判定
if (bridgeResult.kind === 'no-signal') return { kind: 'no-signal' }; // ここで終了
```

`selectConversationBridge` は `themeIds` の一致（`bridge-selection.ts` の Fairness /
Evidence 抽出）だけを見て Bridge を選ぶ。Bridge が無ければ `planConversationAgentStart`
はモデルを一度も呼ばずに `no-signal` を確定させ、ADR-0043 が実装した
`grounded-bridge`（自己紹介文の引用による共通点提示）に出番が回らない。実際に確認した
結果は次のとおりである。

- owner の実カード（テーマ `local-tournament` のみ・自己紹介文なし）→ `no-signal`。
- owner に selfIntro を追加（テーマは不一致のまま）→ 依然として `no-signal`
  （モデルは未到達のまま）。
- テーマを一致させた場合のみ → `provider-run`（`ownerProfileText` /
  `encounteredProfileText` の両方が入る）。

この Repo が持つ下流の 3 契約（`validateAgentModelProviderOutput` の
`grounded-bridge` 検証、`model-safety-boundary.ts` の Local Model Request 組み立て、
`provider-fallback.ts` の Fallback-once）を実際にコードを読んで確認したところ、
いずれも「Rules bridge（共有 clue）の有無」を前提にしていなかった。
`validateGroundedBridgeOutput` は `buildEncounterEvidence`（Rules 由来 Evidence）を
経由せず `verifyGroundedQuoteBridge`（引用が入力文の部分文字列かどうかの照合）だけで
検証する。`model-safety-boundary.ts` の `responseFormatForEvidenceIds` も、両者の
自己紹介自由記述が揃っているか（`quotable`）だけで `grounded-bridge` Schema 変種を
追加するかを決めており、共有 clue の件数（`evidenceOptions.length`）には依存しない。
つまり下流は実装済みで、欠けていたのは `planConversationAgentStart` が Rules bridge
無しでもこの経路へ入る分岐だけだった。

## Decision

### `selectConversationBridge` が `no-signal` のとき、1 対 1 かつ両者の自由記述が揃っていればモデルを走らせる

`planConversationAgentStart` に第 2 の分岐 `planWithoutRulesBridge` を追加する。
`selectConversationBridge` が `no-signal` を返し、かつ `session.peers` がちょうど
1 名で、かつ `introCardProfileText(session.self.introCard)` と
`introCardProfileText(peer.introCard)`（`title` / `organization` / `selfIntro` を
連結した 1 人分のテキスト、`selfIntro` だけではない）の両方が定義されるときだけ、
Rules bridge 無しで `provider-run` プランを返す。どちらか一方でも欠ければ、従来どおり
`no-signal` のままにする。

Bridge 無しで `AgentModelInput` を組み立てる入口として
`buildConversationAgentModelInputWithoutBridge`（`src/domain/conversation-agent-evidence.ts`）
を新設する。既存の `buildConversationAgentModelInput`（`SelectedBridge` 前提）と
Passport 投影・profile text 同梱・deadline・language の組み立てロジックを共有する
private helper（`assembleAgentModelInput`）へ抽出し、複製しない。`encounterKey` の
組み立て（`conversation-agent:` + participantId の昇順 join）も 1 箇所へ集約し、
Bridge 経路・Bridge 無し経路の両方から呼ぶ。

新しい `ConversationAgentStartPlan` の種別は増やさない。Bridge 無しの成功も既存の
`provider-run` へ合流させ、UI 側（`use-conversation-agent-flow.ts`）は無変更で動く。

### N 者間（peers が 2 名以上）はこの経路の対象外のままにする

peers が 2 名以上のセッションで、全ペアに Rules bridge が無い場合は、全員に自己紹介の
自由記述があっても `no-signal` のままにする。[ADR-0036](./0036-on-device-conversation-agent.md)
が「N 者間の Evidence 抽出は Rules で全ペア同期計算し、Local Agent は最終選定後の
1 組にだけ適用する」と定めた範囲を、Bridge が無い経路にも一貫して適用するためである。
`buildConversationAgentModelInputWithoutBridge` は 2 者間専用の `AgentModelInput` を
組み立てる関数であり、これを N 者間の全ペアへ総当たりで適用する設計は採用しない
（ADR-0023 の単一 Native Lane 制約に反し、どの組を根拠として選ぶかという Fairness の
問題も新たに生む）。

### 失敗時は既存の Fallback-once を経由してそのまま no-signal へ倒れる

この経路が生む `AgentModelInput` は共有 clue が 0 件になりうる（themeIds が
不一致のため）。Local Agent が Timeout / Schema Error 等で失敗した場合、
`runProviderOnce` の Fallback-once が Rules へ 1 回だけ切り替わるが、Rules は
`buildEncounterEvidence` が Evidence 0 件を返すため `no-signal` になる。Local Agent
を持たない端末（Expo Go / Web / 未導入、v1.0 では consumer 経路がこれに当たる。
ADR-0038 参照）では `RULES_MODEL_PROVIDER` が Primary としてそのまま呼ばれ、同じ理由で
`no-signal` になる。いずれの経路も本 ADR のために新しく作った分岐ではなく、既存の
Fallback-once・Rules 基準実装をそのまま通す。

### no-signal の文言に、自由記述でも見つかることを追記する

`messages.ts` の `conversationAgent.noSignalMessage`（ja/en）に、会話テーマを増やす
以外に自己紹介文を書く手掛かりも見つかりやすくなる旨を追記する。オンデバイス AI が
必要である旨は書かない。Rules 端末でも Bridge 無し経路自体は動く（結果が no-signal に
なりやすいだけ）ため、文言を Provider の種類で分けない。

## 選択肢

1. **自由記述をカタログ clue へ投影し `selectBridges` に見せる（不採用）**: `clues` は
   閉じたカタログ ID が前提で、自由記述はカタログに存在しない ID になる。無理に投影
   すると `bridge-selection.ts` の Fairness / Confidence 計算（カタログ ID の集合演算）
   を壊すか、意味の無い偽 ID を発明することになる。ADR-0043 が引用を「Rules Evidence
   とは別の検証経路」として明確に切り分けた設計意図にも反する。
2. **自由記述の有無に関係なく 1 対 1 なら常にモデルを呼ぶ（不採用）**: 自由記述が
   両者に無ければ `grounded-bridge` の材料が無く、Rules も Evidence 0 件で
   `no-signal` になるため、モデルを呼んでも結果は変わらない。ADR-0023 が単一
   Native Lane 制約を置いている以上、結果が変わらない呼び出しで Native Lane を
   無駄に占有する理由が無い。
3. **`selectConversationBridge` が `no-signal` で、peers がちょうど 1 名で、両者の
   自由記述が揃うときだけ Bridge 無しでモデルを走らせる（採用）**: 新しい plan
   種別を増やさず、既存の 3 分岐（`no-signal` / `rules-bridge` / `provider-run`）の
   `provider-run` へ合流させる。

## Consequences

- **Good**: ADR-0043 が約束した「checkbox 一致が 1 件も無いペアでも、自己紹介文が
  重なっていれば共通点を提示できる」が実際に動くようになる。
- **Good**: 下流の 3 契約（Validator・Safety Boundary・Fallback-once）はコードの
  修正を要さず、実行テストで固定するだけで済んだ。Rules bridge の有無を前提にした
  実装がそもそも無かったためである。
- **Bad**: Rules bridge が無く、かつ Local Agent も持たない端末（Expo Go / Web /
  未導入）では、この経路に入っても `RULES_MODEL_PROVIDER` が Evidence 0 件のまま
  `no-signal` を返すだけで、最終的な結果は変わらない。ただし従来は
  `selectConversationBridge` が `no-signal` を返した時点で即 `no-signal` が確定して
  いたのに対し、この経路では `onStart` が `running` 状態を経てから Provider
  （Rules）の実行結果を待って `no-signal` を確定する形に変わる。Rules の実行は
  同期的でネットワークを越えないため体感の遅延は無視できるが、状態遷移の回数自体は
  増える。この遷移が実機でユーザーに視認される瞬間表示（flash）を作るかどうかは
  未確認であり、確認できていないことをここに明記する。
- **Tradeoff**: N 者間（peers 2 名以上）はこの ADR の対象外のまま残す。将来 N 者間へ
  拡張する場合、「どの組を Bridge 無しの根拠として選ぶか」という新しい Fairness の
  問題を別途設計する必要がある。

## References

- 関連コード: `src/app/conversation-agent-flow-controller.ts`、
  `src/domain/conversation-agent-evidence.ts`、`src/domain/agent-model-provider.ts`、
  `src/local-agent/model-safety-boundary.ts`、`src/domain/provider-fallback.ts`、
  `src/app/i18n/messages.ts`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152 、
  https://github.com/susumutomita/TenkaCloudPassport/issues/147 、
  https://github.com/susumutomita/TenkaCloudPassport/issues/104
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)（N 者間の Local Agent
  適用範囲、本 ADR では維持）、[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)
  （本 ADR が実装ギャップを埋める約束の出所）、
  [ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)（v1.0 consumer 経路が
  Rules 固定である前提）
