# Agent Model Provider Contract の設計

本書は Issue 13 の設計を定める。Rules Provider を「劣化 Demo」ではなく、Local LLM
未導入端末・Expo Go・Web・Model Error 時でも同じ Privacy Contract と Encounter Outcome を
保証する基準実装へ引き上げる。Rules Provider と将来の `llama.rn` Local Agent（Issue 17）が
同じ入出力契約を実装できる、単一の Provider Contract（`AgentModelProvider`）を新設する。
Issue 16 で追加した Runtime Output Schema、共通 Validator、5 状態の実行時 State Machine は
[Agent Model Provider Runtime の設計](./agent-model-provider-runtime.md) を正本とする。同設計は、
本書の `AgentModelDecision` を Provider が自由記述として直接返す先行形を置き換え、Provider
自身は `no-signal` または既知の `evidenceIds` だけを返し、Decision の表示文を信頼側で
再構築する境界へ強化した。
用語は [用語集](../product/glossary.md)、既存の 2 者間 Live 経路は
[Pet の短時間・制限付き交流 State Machine の設計](./pet-interaction-protocol.md)・
[Owner Question の段階的開示・Consent Flow の設計](./owner-question-consent-flow.md)・
[根拠付き Bridge 選定アルゴリズムの設計](./bridge-selection.md) を正本とする。本書はこれらを
**拡張** する差分であり、それらが固定した状態機械・Fairness Rule・Evidence 判定を
重複実装しない。

## 目的と対象範囲

- 目的: Rules Provider と将来の Local Agent (`llama.rn`, Issue 17) が同じ Contract を実装し、
  Provider が入れ替わっても Encounter Outcome（Bridge / `no-signal`）と Privacy Contract が
  変わらないことを保証する。Local LLM 未導入・Expo Go・Web・Model Error のいずれでも、
  Rules 実装だけで Passport → Bridge/`no-signal` → Exit を完走できることを固定する。
- 対象: 新規モジュール `src/domain/agent-model-provider.ts`（Contract 型 + Rules 基準実装）、
  `src/domain/provider-fallback.ts`（Fallback-once の純粋な Runner）、
  `src/domain/__fixtures__/agent-model-provider/`（Golden Contract Fixture）、
  `src/app/provider-status-notice.ts`（内容を含まない UI Status）。
- 対象外: 実際の `llama.rn` 接続（Issue 17）、この Contract へ既存の 2 者間 Live 経路
 （`rules-provider.ts` / `interaction-discovery-provider.ts` / `pet-interaction-flow.ts`）を
  配線し直すこと、Fallback UX の仕上げ（Issue 16）。既存 Live 経路とその 100％ カバレッジ済み
  テストは変更しない。

## 既存 2 系統の Rules 判定との関係

この repo には Rules による判定が実質 2 系統ある。

1. `rules-provider.ts` の `RULES_PROVIDER.decide()` — Issue 4 由来。Owner Question を経由せず、
   Public Passport が既に持つ確認済み手掛かりからその場で Bridge を確定する同期判定。
   `evaluateLounge`（`lounge.ts`）が使うが、Issue 11 以降 `PassportApp.tsx` の実行経路からは
   外れている。
2. `interaction-discovery-provider.ts` の `RULES_INTERACTION_PROVIDER.discover()` — Issue 10/11
   由来。bounded protocol の `discovering` フェーズが使う。同じ確認済み手掛かりを見つけても、
   `clarifying` で Owner Question の同意（`answer === 'yes'`）を経てからでないと Bridge
   Evidence へ昇格しない、より保守的な経路。`pet-interaction-flow.ts` を介して実際に稼働する
   Live 経路。

Issue 13 はこの 2 系統をどちらも置き換えず、**両方を包含するより完全な Contract** を新設する。
`AgentModelProvider` の Rules 基準実装は、両 Passport が既に公開している確認済み手掛かり
（Topic 共通・Offer/Need 相互補完・共通 Language）と、bounded protocol が得た Owner の
追加同意（Owner Answer）を **両方組み合わせて** Evidence を作る。将来 Issue 17 が Local Agent を
この Contract へ接続したとき、`pet-interaction-flow.ts` をこの Contract の上へ再配線するか
どうかは Known follow-ups とする（今回は 2 者間 Live 経路を壊さない）。

## Contract: `AgentModelInput` → `AgentModelDecision` | 型付き失敗

| 要素 | 型 | 説明 |
| --- | --- | --- |
| Input | `AgentModelInput` | `ownerPassport` / `encounteredPassport`（consented `PublicPassport`）、任意の `ownerAnswer`（consented `ConsentedOwnerAnswer`）、`language?: LanguageCode`（デフォルト `ja`）、`deadlineAtWallClockMs: number`。 |
| Provider Output | `AgentModelProviderOutput` | `{ kind: 'bridge'; evidenceIds }` または `{ kind: 'no-signal' }`。自由記述や外部 Action を表現しない。 |
| 検証済み Output | `AgentModelDecision` | 共通 Validator が Evidence から再構築する `{ kind: 'bridge'; reason; opener; evidenceIds; confidence }` または `{ kind: 'no-signal' }`。 |
| 失敗 | `AgentModelProviderError` | `code: 'TIMEOUT' \| 'CANCELLED' \| 'SCHEMA_ERROR' \| 'LOAD_ERROR'` を持つ型付き例外。Rules 実装は同期・決定的で **絶対に投げない**。 |
| Port | `AgentModelProvider` | `{ kind: 'rules' \| 'local-agent'; provide(input): unknown \| Promise<unknown> }`。Native 境界の実値は型注釈を信用せず共通 Validator へ渡す。 |
| Rules 実装専用の狭い型 | `RulesAgentModelProvider` | `provide()` が同期で `AgentModelProviderOutput` を返すことを型で保証し、`rulesAgentModelDecision()` が Local Agent と同じ Validator を通す。 |

`deadlineAtWallClockMs` は Rules 実装が内部で判定に使わない（Rules は Network / Clock /
Randomness を直接参照しない）。締切は将来の非同期 Local Agent が「あとどれだけ待てるか」を
知るための入力であり、Contract の形として両実装が同じ Input 形状を受け取れることを保証する
ためにここへ含める。

既存の `AgentDecision`（`src/domain/agent-decision.ts`）・`Bridge`・`MatchEvidence`（Wire
Protocol、`schema.ts` の `parseBridge` / `parseMatchEvidence` が検証する）は変更しない。
`AgentModelDecision` はこれらとは独立した、この Contract 専用の新しい型とする。理由は次の
「代替案」で述べる。

## Evidence: Topic・Offer/Need・Language・Owner Answer を組み合わせる

Rules 基準実装 (`RULES_MODEL_PROVIDER`) は 4 種類の Evidence を集める。Topic・Offer/Need・
Language は [`bridge-selection.ts`](../../src/domain/bridge-selection.ts) の Layer 1 純粋関数
（`findFirstSharedConfirmedClue` は `shared-clue-match.ts` から、`firstOfferNeedComplementMatch`・
`sharedLanguage` は `bridge-selection.ts` から）をそのまま再利用し、重複実装しない。

| 種別 | 判定 | 単独時の Confidence |
| --- | --- | --- |
| `shared-topic` | 既存の `findFirstSharedConfirmedClue`。 | `possible` |
| `offer-need-complement` | 既存の `firstOfferNeedComplementMatch`（Owner 側だけでなく双方向の先頭 1 件）。 | `promising` |
| `shared-language` | 既存の `sharedLanguage`。 | `possible` |
| `owner-confirmed` | `input.ownerAnswer.answer === 'yes'` のときの `candidateClue`。 | `promising` |

Confidence 規則は [`bridge-selection.md`](./bridge-selection.md) と同じ形（Evidence 2 件以上で
`promising`、1 件なら「双方が今すぐ動ける具体的な理由」になる種別だけ `promising`）を 4 種別へ
拡張する。`offer-need-complement` と `owner-confirmed` はどちらも「一方または Owner が明示的に
動ける／同意した」具体的な理由のため単独でも `promising`、`shared-topic` / `shared-language`
単独は `possible` のままとする。

### Owner Answer は既存 Evidence を上書きしない加算方式

`ownerAnswer.answer === 'yes'` の `candidateClue` が、既に `shared-topic` /
`offer-need-complement` として計上済みの `ClueId` と同じ場合、`owner-confirmed` Evidence は
**追加しない**（`bridge-selection.ts` の 3 人 Bridge 去重と同じ「同じ事実を二重に数えない」
原則）。`answer !== 'yes'`（`'no'` / `'decline'`、いわゆる Owner Pass）は Evidence を
**1 件も追加しない**が、他の Evidence（Topic・Offer/Need・Language）を打ち消しもしない。
Owner が今回の候補を辞退しても、既に両者が独立に公開している Topic 等はそのまま有効な
Evidence として残る。捏造せず、かつ既にある根拠を無根拠に消さない、という 2 つの no-signal
原則をどちらも満たす。

## 失敗の 4 種類と Fallback-once

`src/domain/provider-fallback.ts` が、Primary Provider（将来の Local Agent）の失敗を Rules
Provider へ 1 回だけ切り替える純粋な Runner を提供する。

- `attemptProvider(provider, input)`: Primary を 1 回呼び出し、共通 Runtime Validator を通す非同期境界。
  `AgentModelProviderError` だけを型付き失敗（`ProviderSwitchReason`:
  `'timeout' | 'cancelled' | 'schema-error' | 'load-error'`）へ正規化し、それ以外の未知の例外は
  無言で握り潰さず再送出する（fail loudly）。
- `runProviderOnce(ledger, encounterKey, attempt, computeRulesFallback)`: 同期・純粋な
  Runner 本体。`encounterKey`（Lounge / Encounter を一意に指す文字列）ごとの `ledger`
 （`ReadonlyMap`）に既に確定した Outcome があれば、新しい `attempt` の中身に関わらず
  その Outcome をそのまま返す（二重送信・Cancel 後の遅延イベントで Bridge を重複生成しない
  idempotency）。まだ確定していなければ、成功時はそのまま採用し、失敗時だけ
  `computeRulesFallback()`（Rules Provider を呼ぶ thunk）を呼んで Fallback する。Primary が
  成功する経路では Rules Provider は一度も呼ばれない。
- `createAgentProviderSessionRunner()`: 実行中 Promise と確定済み Ledger を同じ Closure で所有し、
  同一 `encounterKey` の同時呼び出しを Provider 開始前に去重する。Local Provider が期限までに
  完了しなければ Runner 自身が `timeout` へ分類し、期限後の遅延完了は確定済み Outcome を
  上書きしない。

`ProviderSwitchReason`（`'timeout' | 'cancelled' | 'schema-error' | 'load-error'`）は内容を
持たない閉じた enum とする。Runtime State Machine がこれを `falling-back` 状態にだけ保持し、
`src/app/provider-status-notice.ts` の `providerStatusNotice()` は 5 状態を UI 向けの固定文言へ
変換する（`interaction-status-notice.ts` と同じ、内容を持たない状態表示専用の mapper）。

## Golden Contract Fixture と比較契約

`src/domain/__fixtures__/agent-model-provider/*.json` に、カタログ ID・Language・Owner
Answer から組み立てる Input と、期待する `AgentModelDecision` を対で記録する。各 JSON は
`ownerClueIds` / `encounteredClueIds` / `ownerLanguageCodes` / `encounteredLanguageCodes` /
`ownerAnswer` / `language` / `deadlineAtWallClockMs` という、Catalog Version に依存しない
安定した参照だけで Input を表現する（`PublicPassport` を直接埋め込むと `catalogVersion`
が変わるたびに Fixture が壊れるため、テストが `publicPassportWithClues` で都度組み立てる）。

**比較契約**: `RULES_MODEL_PROVIDER.provide()` の Output は共通 Runtime Validator を通し、
Fixture の `expected`（検証済み `AgentModelDecision`）と **Byte-for-byte（deep-equal）** で
一致しなければならない。将来の `llama.rn`（Issue 17）も文面を返さず Evidence ID だけを選ぶ。
その Output を同じ Validator が検証し、`reason` / `opener` / `confidence` を固定 Renderer で
再構築するため、Model の言い回しを理由に比較契約を緩めない。

## JA/EN 固定表現

`language` は `LanguageCode`（`ja | en`、`clue-catalog.ts` の既存カタログと同じ 2 値）を
再利用し、未指定時は `ja` をデフォルトにする。カタログの `label`（手掛かり・言語の表示名）自体は
まだ日本語のみで、英語翻訳は本 Issue の対象外（Issue 15 の「groundwork」として、文の
組み立て側だけを bilingual にする）。そのため `language: 'en'` の出力は、英語の文の中に
日本語のカタログ label がそのまま埋め込まれる（例: `You both have published the confirmed
shared topic "オープンソース".`）。この制限は許容し、カタログ自体の翻訳は Issue 15 の
Known follow-up とする。

## 代替案

### 既存 `Bridge` / `MatchEvidence` / `AgentDecision`（Wire 型）をそのまま Contract の出力にする案

`agent-decision.ts` の `AgentDecision` は既に `{ kind: 'bridge'; bridge: Bridge } | { kind:
'no-signal'; reason }` という「Agent Input Schema から Bridge Output Schema または no-signal
を返す」に近い形を持つため、これを直接再利用する案を検討した。しかし `Bridge.evidence:
MatchEvidence` は `clues: ConfirmedClue[]` だけを運び、`LanguageCode` を表現できない
（`bridge-selection.md` が明記した既存の制約）。Language Evidence をこの Contract の
Evidence 組み合わせへ含めるには、`MatchEvidence` に `languages?: LanguageCode[]` を足すか、
`parseBridge` / `parseMatchEvidence`（Wire 境界）を拡張する必要があり、まだ M3 で実際に
Peer 間へ送信されていない Wire 型に「使われる予定のない bilingual 文面」まで持たせることに
なる。この Issue の本来の目的（Contract の形と Rules 基準実装、Fallback-once、Golden
Fixture）に対して不釣り合いに大きい Wire 変更になるため、`AgentModelDecision` という
この Contract 専用の新しい型を採用し、既存の Wire 型は変更しない。両者を統合するかどうかは
M3 で実際に Peer 送信を配線する時点の Known follow-up とする。

### `bridge-selection.ts` の `BridgeEvidence` / `SelectedBridge` をそのまま拡張する案

Topic・Offer/Need・Language の判定と Confidence 規則は `bridge-selection.ts` に既にあるため、
`owner-confirmed` を 4 番目の `BridgeEvidence` として追加し、`SelectedBridge` をそのまま
Contract の出力にする案も検討した。しかし `SelectedBridge.participantIds:
readonly ParticipantId[]` は N 者間 Fairness 選定（Issue 12, M3 専用）のための必須フィールドで
あり、この Contract の Input（`ownerPassport` / `encounteredPassport` の 2 者間、
`ParticipantId` を持たない）には存在しない概念を持ち込むことになる。加えて
`bridge-selection.ts` の `evidenceNarrative` は日本語専用・`ParticipantId` を前提にしており、
bilingual 化するには Issue 12 で既にレビュー済みの安定コードを書き換える必要がある。この
Contract 専用の、`ParticipantId` を持たない Evidence 型と Narrative 関数を新設する方が、
Issue 12 の既存契約を壊さずに済む。JA の文面は意図的に `bridge-selection.ts` と同じ言い回しに
揃え、読み手に一貫した体験を保つ。

ただし Confidence の判定規則（Evidence 2 件以上なら `promising`、1 件なら特定種別だけ
`promising`）自体は `ParticipantId` に一切依存しない純粋なロジックであり、Evidence 型を
分けたことを理由に丸ごと複製すると `bridge-selection.ts` の `bridgeConfidence` とほぼ
同一の実装が 2 箇所に残ってしまう。ここだけは `src/domain/evidence-confidence.ts` の
`confidenceFromEvidence`（Evidence の `kind` フィールドだけを見る、型を跨いで安全な
共有関数）へ切り出し、`bridgeConfidence` と `agentModelConfidence` がどちらもこれへ
委譲する。Evidence 型・Narrative・`SelectedBridge` / `AgentModelDecision` の形は
分離したまま、Confidence 規則という「本当に同じロジック」の部分だけを共有する。

### Fallback Runner を Provider 呼び出しごと持たせる案（非純粋）

`runProviderOnce` の中で Primary Provider を直接呼び出し、失敗時だけ Rules へ Fallback する
一枚岩の非同期関数にする案も検討した。しかし「Local Agent の Timeout / Cancel /
Schema Error / Load Error 後に届く遅延イベント」を「最も早い Event が理由を決める」原則で
扱うには、呼び出し結果を先に確定させてから idempotency を判定する必要がある
（`pet-interaction.ts` の `receiveDiscoveryResult` が phase 不一致で `applied: false` を返す
のと同じ設計）。`attemptProvider`（非同期の分類境界）と `runProviderOnce`（同期・純粋な
Ledger 判定）を分離した方が、後者を実際の Provider・タイマー無しでテストでき、
Determinism・Idempotency の検証が容易になる。

## エッジケース

- Evidence が 0 件（Topic・Offer/Need・Language いずれも無く、Owner Answer も無いか declined）。
  であれば必ず `no-signal` になる。捏造しない。
- Owner が declined（`'no'` / `'decline'`、Owner Pass）でも、他の Evidence（Topic 等）が
  独立に存在すれば Bridge は成立する。Owner Answer は Evidence を追加する方向にだけ働き、
  既存の Evidence を打ち消さない。
- `ownerAnswer.candidateClue` が既に Topic / Offer-Need の一部として計上済みの `ClueId` と
  同じ場合、`owner-confirmed` は重複して追加しない（Confidence の水増しを防ぐ）。
- 同一 Input（`deadlineAtWallClockMs` の値だけが異なる場合を含む）からは常に同じ
  `AgentModelDecision` を返す（決定性）。
- Rules 実装 (`RULES_MODEL_PROVIDER`) は `AgentModelProviderError` を絶対に投げない
 （`RulesAgentModelProvider` という同期・例外なしの狭い型で保証する）。
- `runProviderOnce` は同じ `encounterKey` に対する 2 回目以降の呼び出しでは、渡された新しい
  `attempt` の中身に関わらず、最初に確定した Outcome をそのまま返す（Cancel 後の遅延失敗
  イベントや二重の Retry で Bridge / Rules Fallback を重複生成しない）。
- Primary Provider が `AgentModelProviderError` 以外の例外を投げた場合、`attemptProvider` は
  それを握り潰さず再送出する（型付き失敗だけが Fallback の対象）。

## Platform 非依存の Contract Test

`src/domain/agent-model-provider.ts` と `src/domain/provider-fallback.ts` はどちらも
`react` / `react-native` / `expo` を import しない純 TypeScript である
（`agent-model-provider.test.ts` がソーステキスト検査で固定する）。これらのテストは
Node.js / Bun ランタイムだけで実行される Domain Test であり、Expo Go・Web・iOS/Android
Development Build のどの実行環境で `bun test` を実行しても同じ結果になる。実機の Local Agent
接続後の実機動作検証は Issue 17/30 の Known follow-up とする。

## 人間検証

将来の `llama.rn` Local Agent が実際にこの Contract を満たすか（Timeout の実測値、Schema
Error の実際の頻度、Load Error の実機再現）は、Issue 17 の実機接続後にまとめて人間検証する。
機械テストは、本書の Evidence 組み合わせ・Confidence 規則・Fallback-once・Idempotency・
Golden Fixture・Platform 非依存を対象にする。

## Known follow-ups

- Issue 17: `llama.rn` を `AgentModelProvider`（`kind: 'local-agent'`）として実装し、
  `attemptProvider` / `runProviderOnce` へ実際に接続する。
- Issue 16 で `providerStatusNotice` を 5 状態の live Prop へ配線し、Model 未導入時は
  `rules` をデフォルト値とした。Issue 17 は同じ `createAgentProviderSessionRunner()` の状態を Native Adapter
  から更新し、Development Build の実表示証跡を追加する。
- `pet-interaction-flow.ts` / `rules-provider.ts` / `interaction-discovery-provider.ts` を
  この新しい Contract の上へ再配線するかどうかは、Local Agent 接続が完了した時点で改めて
  判断する。2 系統の Rules 判定を 1 つへ統合するかもここで合わせて判断する。
- `AgentModelDecision` と既存の `Bridge` / `MatchEvidence` / `AgentDecision`（Wire 型）を
  統合するかどうかは、M3 で実際に Peer 間へ送信する配線をする Issue で判断する。
- カタログ label 自体の英語翻訳は Issue 15 でも対象外のまま据え置いた
 （[日本語・英語 i18n と主要フローの Accessibility の設計](./i18n-and-accessibility.md)
  の設計判断 5）。Issue 15 は 2 者間 Live 経路（`src/domain/bridge.ts`）に
  `sourceLabels`（Clue Label そのものの原文）と `language` ごとの定型文を分離して
  持たせ、UI が原文と生成文を区別して提示できるようにしたが、`clue.label` 自体は
  日本語のままとする。カタログ label 自体の翻訳が実現すれば、`language: 'en'` の
  出力から日本語 label の混入が無くなる。
