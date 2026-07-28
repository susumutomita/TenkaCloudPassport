# ADR-0058: 起動時 Availability Gate と Qwen 消費者 UI 撤去（ADR-0057 の Follow-up 仕上げ）

- **Status**: Accepted。
- **Date**: 2026-07-28。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

ADR-0057（Apple Intelligence を会話エージェントの Primary Provider にする、Issue 171、PR #188）は、native module・Provider 差し替え・ADR を scope とし、次の 2 件を明示的に Follow-up として切り出した（`.claude/state/follow-ups.jsonl`）。

1. **F-983000（severity: high）**: `createNativeAgentModelProvider` が Availability 事前チェック無しに常に `provider.kind === 'local-agent'` を返す設計だったため、Apple Intelligence 非対応端末（iPhone 15 Pro 未満・Apple Intelligence 無効・iOS 26 未満）では毎 Encounter で `ProviderRuntimeState` が `rules` → `loading-local-model` → `falling-back` → `rules` と遷移し、Provider 状態通知が毎回一瞬表示される。加えて `outcome.settledBy === 'primary'` のときだけ会話例（ADR-0050 icebreaker）を準備する `use-conversation-agent-flow.ts` の条件により、非対応端末では会話例生成が常にスキップされる。
2. **F-056000（severity: medium）**: ADR-0057 は native/provider の切り替えだけを scope にし、Settings・会話画面の Qwen（GGUF ダウンロード型・`llama.rn`）消費者向け UI（有効化・DL 進捗・削除・メモリ注意、Issue 182 の「モデルを取得する」案内）は次の PR に持ち越すとした。

本 ADR はこの 2 件を仕上げる設計判断を記録する。

## Decision

### 1. 起動時 1 回の Availability Gate（F-983000）

`src/app/native-agent-model-provider-composition.ts` に `resolveNativeAgentModelProviderAtStartup` を追加した。Expo Go では Native Module を呼ばず即座に確定し、それ以外では `checkAppleFoundationModelsAvailability`（既存、`apple-foundation-models-availability.ts`）を 1 回呼んで判定する。

- `available` 以外（各種 `unavailable-*` reason・fail-closed の `unknown` を含む）: `RULES_MODEL_PROVIDER`（`kind: 'rules'`）を返す。
- `available`: 従来どおり `createNativeAgentModelProvider`（Apple Primary + 既存 Fallback-once）を返す。

`provider.kind` を起動時に確定させることで、`agent-provider-session.ts` の `executeAgentProviderSession`（`provider.kind === 'local-agent'` のときだけ `local-started` イベントを発火する既存ロジック、変更なし）は非対応端末では一度も `local-started` を発火しない。通知の遷移自体が起きないため、Fallback-once の仕組みそのものを変更せずに副作用を解消できる。

戻り値は `{ provider, appleIntelligenceUnavailable }` の組にした。`appleIntelligenceUnavailable` は会話画面の非対応端末向け案内（Decision 3）が判定源として使う。

`App.tsx`（Composition Root）は `createDefaultAgentModelProvider(localDataLeases)` の戻り値が `Promise` になったため、解決するまで `<PassportApp>` をマウントしない（`useState` + `useEffect` で 1 回だけ待つ）。対案として「即時値（Rules）で `PassportApp` をマウントし、解決後に prop を差し替える」設計も検討した。しかし `useLocalModelManagement` の内部 `provider` state は `useState(fallbackProvider)` でマウント時の引数だけを初期値として持ち、mount 後の prop 変化を購読しない（`management` が null、または manifest に active model が無い経路では特に）。マウント後に解決した Provider を prop 経由で渡しても実際には反映されないため、「対応端末で Apple Intelligence が primary になる」という受入基準を構造的に満たせない。マウント自体を 1 回遅らせる設計は、この不整合を作り込む余地自体を消す。可視コストは初回フレームが Native `availability()` 呼び出し 1 回分（モデル読み込みを伴わない軽量呼び出し）遅れることに限られる。

`agentModelProviderStartupPromise.then(...)` は `.catch()` を持つ。`checkAppleFoundationModelsAvailability` は内部で try/catch 済みで reject せず、`createNativeAgentModelProvider` の構築も同期的で例外を投げないため、到達可能な reject 経路は現状無い。それでも reject した場合に `.catch()` が無いと `agentModelProviderStartup` state が永久に `null` のままとなり、`<PassportApp>` が一切マウントされず白画面のまま止まる（advisor 指摘）。ADR-0056（不確定な起動時読み取りで機能を永久停止しない）・ADR-0054（積極的な証拠なしに fail-closed にしない）と同じ原則で、`.catch()` は `rulesOnlyAgentModelProviderStartupResult()` を返して fail-open する。白画面より Rules-only の方が明確に安全という判断であり、Availability 判定を「わからなければ利用不可」に倒す既存の fail-closed 方針（`parseAppleFoundationModelsAvailability`）と、アプリ全体を機能停止させない fail-open 方針は矛盾しない（前者は「この 1 判定のデフォルト値」、後者は「判定そのものが取得できないときにアプリを止めない」という別の階層の話になる）。

### 2. 会話エージェントの Provider 供給元を `agentModelProvider` に統一（advisor 指摘、当初計画になかった修正）

`useConversationAgentFlow` は `localModels.provider`（`useLocalModelManagement` が Settings 経由の手動 GGUF import/activate で書き換える state）を Provider として受け取っていた。v1.1.1〜v1.1.6 で既に Qwen を有効化・activate 済みの端末がアップグレードした場合、Decision 3 で Settings の削除導線を撤去した後もこの Provider は Qwen の manifest のまま固定され、消費者は二度と外せなくなる。ADR-0057 は「Qwen は消費者向け会話エージェントの実行経路からは到達不能になる」と書いたが、この経路の存在により実際には到達可能だった。

`useConversationAgentFlow` へ渡す `provider` を `localModels.provider` から `PassportApp` が受け取る `agentModelProvider`（起動時に確定した Apple-or-Rules Provider）へ差し替えた。これにより、Qwen の manifest 状態に関わらず会話エージェントは常に Apple Intelligence / Rules だけを使う。`useLocalModelManagement` 自体（`invalidateAfterExternalPurge` / `isMutationPending`、全データ削除の lease 調整に必要）は呼び出しを維持するが、`.view`（Local Model 管理 UI 用の state・操作一式）は Settings・会話画面のどちらにも渡さなくなったため、Settings 再訪時に manifest を再読込していた effect（旧 ADR-0043）も、表示先が無くなったため削除した。

### 3. Settings / 会話画面から Qwen 消費者 UI を撤去し、非対応端末向け案内へ置き換え（F-056000）

- `SettingsScreen.tsx` から `ModelAcquisitionSection`（有効化・DL 進捗・削除・メモリ注意）の呼び出しと `modelManagement` prop を削除した。
- `ConversationAgentScreen.tsx` から同じ `ModelAcquisitionSection` 呼び出し（Issue 180 の「モデルを取得する」常設ノート）と `modelManagement` / `onDeviceAiActive` prop を削除し、`appleIntelligenceUnavailable`（Decision 1 の起動時確定値）が `true` のときだけ表示する簡潔な案内（`現在 Apple Intelligence を利用できないため、会話のきっかけは確認済みテーマから探します`）へ置き換えた。
- 判定源に、Encounter ごとに揺れる旧 `onDeviceAiActive`（`conversationExampleGeneratorForProvider(provider) !== null`）ではなく、起動時に 1 回だけ確定する `appleIntelligenceUnavailable` を選んだ。前者は Fallback-once の結果次第で同一端末でも Encounter ごとに変わりうる値であり、案内の出没がちらつく可能性がある。
- **code-reviewer 指摘（major）**: `AppleFoundationModelsUnavailableReason` の 5 種のうち `device-not-eligible`・`unsupported-os` は端末の不変の性質だが、`apple-intelligence-not-enabled`（OS 設定の Apple Intelligence トグル）・`model-not-ready`（Apple 側のモデル準備状況）はアプリを再起動せずに同一セッション中に変わりうる。起動時 1 回の Gate はアプリ再起動までは再判定しないため、これら 2 reason では「今は利用できない」が「この端末は使えない」に見えるまま固定される場合がある。ちらつき防止のため起動時 1 回に確定させる設計判断自体は変えず、文言側で「この端末では」という端末固有の恒久的な非対応を示す表現を避け、「現在」という現在時点の状態として読める表現にした（上記の文言・`src/app/i18n/messages.ts` の ja/en 双方）。セッション中の再判定（例: `AppState` の foreground 復帰時に再チェックする）は行わない。ユーザーが OS 設定でオンにした直後にこの案内が消えるには次回のアプリ起動が必要になる、という既知の制約として残す。
- Qwen の実装（`use-local-model-management.ts` / `trusted-model-download.ts` / `model-lifecycle.ts` / `ModelAcquisitionSection.tsx` 等）とそのテストは削除しない。ADR-0057 と同じ「再導入口として残置する」判断を踏襲し、配線（呼び出しと Provider 選定への合流）だけを切る。

**Web / Android / Expo Go も非対応端末向け案内を表示する（意図した挙動）**: これらのプラットフォームには Apple Intelligence の Native Module 自体が存在せず、`resolveNativeAgentModelProviderAtStartup` は `appleIntelligenceUnavailable: true` を返す。実際にこれらの端末では Apple Intelligence を使えないため、案内の表示は事実と一致する。

**Pilot Measurement の計測値が変わる（副次効果）**: `pilotProviderRunFromOutcome` は `outcome.settledBy === 'rules-fallback'` のときだけ `'fallback'` を返す。Decision 1 により非対応端末は Provider 選定の時点で `RULES_MODEL_PROVIDER` になるため、`runProviderOnce` は成功として扱い `settledBy: 'primary'`（`providerKind: 'rules'`）を返す。結果として `pilotProviderRunFromOutcome` は非対応端末を `'fallback'` ではなく `'rules'` として記録するようになる。これは「Provider が異常終了して Rules へ切り替わった」のではなく「最初から意図どおり Rules として動いた」という実態を正しく反映する変化であり、意図した改善として記録する。

## 選択肢

1. **PassportApp 内の起動 Promise.all へ Availability チェックを合流させる（不採用）**: 既存の `restoring` gate と同じタイミングで解決はできるが、`agentModelProvider` はそもそも `PassportApp` の props であり、Provider 自体の確定は Composition Root（`App.tsx`）の責務である。`PassportApp` 内部に持ち込むと、`agentModelProvider` prop の意味が「確定値」から「初期値、後で上書きされうる値」に変わり、呼び出し側の契約が曖昧になる。
2. **即時値（Rules）で PassportApp をマウントし、解決後に Apple 版へ差し替える（不採用）**: Decision 1 で述べたとおり `useLocalModelManagement` の `provider` state が prop の再変化を購読せず、対応端末で Apple Intelligence が primary にならない場合がある。
3. **App.tsx がマウント自体を Promise 解決まで遅らせる（採用）**: 上記 2 案の問題を構造的に回避できる。可視コストは軽微（Native `availability()` 1 回分）。

## Consequences

- **Good**: 非対応端末で毎 Encounter 発生していた Provider 状態通知のちらつきが構造的に無くなる（`provider.kind` が起動時に確定するため、`local-started` イベント自体が発火しない）。
- **Good**: 対応端末では Apple Intelligence が確実に primary になる。v1.1.1〜v1.1.6 で Qwen を有効化済みの端末でも、会話エージェントは Qwen の manifest 状態に関わらず Apple Intelligence / Rules だけを使う。
- **Good**: Settings / 会話画面から Qwen の消費者向け UI が無くなり、対応可否を OS 内蔵の判定に委ねる一貫した UX になる。
- **Bad / Tradeoff**: 起動時に `<PassportApp>` のマウントが 1 フレーム分遅れる（Native `availability()` 呼び出し 1 回分）。
- **Bad / Tradeoff**: Web / Android / Expo Go でも「Apple Intelligence を利用できない」の案内が常に表示される。実態と一致するため意図した挙動だが、将来これらのプラットフォーム向けに文言を出し分けたくなった場合は別途検討する。
- **Bad / Tradeoff**（code-reviewer 指摘）: Availability Gate は起動時 1 回だけ判定し、同一セッション中に再判定しない。`apple-intelligence-not-enabled` / `model-not-ready` はアプリ起動中に状態が変わりうるため、ユーザーが OS 設定でオンにしても案内が消えるには次回起動が必要になる。
- **Bad / Tradeoff**（advisor 指摘、Follow-up 化）: v1.1.1〜v1.1.6 で Qwen を有効化していた端末は、本 PR で Settings の削除導線が無くなるため、既にダウンロード済みの GGUF（約 1GB）を個別に削除する消費者向け経路が無くなる（`LocalDiagnosticsScreen` の削除ボタンは Settings からの入口が Issue 138 で既に撤去済みで、起動時リカバリ経路以外から到達不能）。「全データ削除」は削除できるが Intro Card ごと消える。追跡: Follow-up F-171000。

## References

- 関連コード: `src/app/native-agent-model-provider-composition.ts`（`resolveNativeAgentModelProviderAtStartup`）、`src/app/default-agent-model-provider.{native,web,ts}.ts`、`App.tsx`、`src/app/PassportApp.tsx`、`src/screens/SettingsScreen.tsx`、`src/screens/ConversationAgentScreen.tsx`、`src/app/i18n/messages.ts`（`conversationAgent.appleIntelligenceUnavailableNotice`）。
- 関連 Follow-up: `.claude/state/follow-ups.jsonl` の `1785236363635983000`（F-983000）・`1785232798269056000`（F-056000）。
- 関連 Issue: [Issue 171](https://github.com/susumutomita/TenkaCloudPassport/issues/171)。
- 関連 ADR: [ADR-0057](./0057-apple-intelligence-primary-provider.md)（本 ADR が仕上げる Primary Provider 化）、[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)（Qwen 再導入、Decision 2 が供給元を切り離す対象）、[ADR-0050](./0050-agent-to-agent-icebreaker-dialogue.md)（会話例機能、F-983000 が解消する生成スキップの対象）。
