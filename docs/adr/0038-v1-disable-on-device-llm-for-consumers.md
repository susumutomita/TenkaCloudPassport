# ADR-0038: v1.0 はオンデバイス LLM を消費者から無効化し、会話 Agent を Rules 固定にする

- **Status**: Accepted。
- **Date**: 2026-07-24。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

[ADR-0036](./0036-on-device-conversation-agent.md) と
[ADR-0037](./0037-conversation-agent-step-a-model-selection.md) は、端末内会話
エージェントが既存の `AgentModelProvider` Contract（Rules 実装と、Development
Build だけで有効化される `llama-agent-model-provider.ts` 経由の Local Agent 実装）を
Pet Interaction と共有し、そのまま再利用する前提で実装した。

owner が TestFlight 実機で確認した結果、この前提には 2 件の未解決の実機不具合が
あった。

1. Settings の「オンデバイス AI を有効化」（Qwen2.5-1.5B-Instruct の信頼済み
   ダウンロード、Issue 138 Follow-up F-FDRGS4）が、ダウンロード進捗が 100％ に
   達した後で完了せず固まる（native 側の完了 Promise が解決しない）。
2. ダウンロードが完了しない状態のまま会話 Agent 画面を開くと、アプリ全体が
   native crash する。JavaScript の `ErrorBoundary`（Issue 138、PR #139）では
   捕まらない。

呼び出し元（`llama.rn` の native binding）をこのセッションの環境では実機
テストできず、盲目のまま native 側の修正を当てることはできない。v1.0 の
リリースを遅らせずに出すため、owner は次の方針（Option A）を決定した。
オンデバイス LLM（Qwen ダウンロード + llama.rn 推論）は v1.0 では消費者から
無効化し、Rules Provider だけで会話 Agent を含む全機能を提供する。
LLM 関連の実装は削除せず、v1.1 で実機テストしてから再有効化する。

## Decision

### 消費者向け Settings から Local Model 管理 UI を除去する

`SettingsScreen.tsx` の `OnDeviceAiSection`（Qwen 有効化・ダウンロード進捗・
削除）と `ModelManagementSection`（busy/error 表示・caution 確認・
pending provider operation 確認）を、`__DEV__` ゲートではなく全ビルドから
削除した。`modelManagement` prop 自体を `SettingsScreenProps` から外し、
`PassportApp.tsx` の `UtilityStageGate` もこの prop を中継しない。これにより
ダウンロードを開始できる消費者向け導線が無くなる。

### 会話 Agent・Pet Interaction（Lounge）へ渡す Provider を Rules に固定する

`src/app/native-agent-model-provider-composition.ts` の
`createNativeAgentModelProvider` は、Expo Go か Development Build かに関わらず
常に `RULES_MODEL_PROVIDER` を返すようにした。`createConfiguredLocalModelCompletionPort`
（Local LLM Completion Port の構築）を呼ばない。

`PassportApp.tsx` では、`useConversationAgentFlow` へ渡す `provider` と、
Pet Interaction の `startPetInteraction` が `providerRunner.run` へ渡す
`provider` の両方を、`localModels.provider`（Local Model が有効なら
llama.rn 経由になり得た）ではなく `RULES_MODEL_PROVIDER` に直接固定した。
ADR-0037 の「会話エージェントは `localModels.provider` を Pet Interaction と
同じ共有 instance としてそのまま再利用する」という決定を、この 1 点に限り
本 ADR が Supersede する（Step A の実装・Model 選定に関する ADR-0037 の他の
決定は有効なまま残る）。

Pet Interaction も同じ修正対象にしたのは、会話 Agent と全く同じ
`AgentModelProvider` 経由の native crash 経路を共有しており、この ADR の
「消費者からオンデバイス LLM を無効化する」という目的を会話 Agent だけに
限定すると Pet Interaction 経由で同じ crash が再発しうるため。

### `use-local-model-management.ts` の Provider 選定自体も v1.0 では Rules 固定にする

code-reviewer レビュー（medium 指摘）で、上記 2 箇所の呼び出し口を固定するだけでは
不十分な残存リスクが指摘された。`useLocalModelManagement` の `configureProvider`
は、永続化済み manifest に `activeModelSha256` があると `management.createProvider(...)`
経由で実際の llama.rn バックの Local LLM Completion Port を今も構築しうる。
過去のビルドで on-device AI を有効化済みだった端末が本ビルドへ更新した場合が該当する。
construct されるだけで、呼び出し口 2 箇所が読まなくなったため invoke はされないと
確認したが、将来 3 つ目の呼び出し箇所が増えると同じ crash が再発しうる。

この指摘を受け、`configureProvider` 自体を v1.0 では常に `fallbackProvider`
（呼び出し元が注入する Rules Provider）へ固定するよう変更した。`activeModel`
ヘルパー（manifest から active な Model を探すためだけの内部関数）は呼び出し元が
無くなったため削除したが、`management.createProvider` 自体（`LocalModelManagementPort`
の一部、`default-local-model-management.native.ts` 実装）は変更していない。これにより
「消費者から Local LLM Completion Port を構築しない」という保証が、個別の呼び出し口
ではなく Composition の中心（`configureProvider`）で一元的にかかる。将来この Hook を
使う呼び出し口が増えても、同じ crash は再発しない。

### LLM 関連の実装は削除せず、無効化だけにとどめる

`trusted-model-catalog.ts` / `trusted-model-download.ts` /
`expo-trusted-model-download.native.ts` / `trusted-model-enablement-controller.ts` /
`use-local-model-management.ts` / `llama-agent-model-provider.ts` /
`configured-agent-model-provider.ts` / `model-safety-boundary.ts` /
`default-local-model-management.native.ts` は変更しない。`App.tsx` の
composition（`agentModelProvider` / `localModelManagement` の配線自体）も
変更しない。これにより、v1.1 で実機テストが取れた時点で
`createNativeAgentModelProvider` と `PassportApp.tsx` の該当 2 箇所を
元に戻すだけで再有効化できる、小さな diff を保つ。

## Consequences

- **Good**: ダウンロードが固まる・会話 Agent 起動で crash する、という owner が
  実機で確認した 2 件の不具合の発生源（Local LLM Completion Port の構築・
  llama.rn の実行）を、消費者導線から構造的に除去した。
- **Good**: LLM 関連コードは全て温存されるため、v1.1 での再有効化は
  composition root（`createNativeAgentModelProvider`）・`configureProvider`・
  `PassportApp.tsx` の 2 つの呼び出し口を戻すだけで済む。
- **Good**: `configureProvider` 自体を固定したことで、「Local LLM Completion
  Port を構築しない」保証が特定の呼び出し口の実装に依存しなくなった。将来
  この Hook の `provider` を読む呼び出し口が増えても、同じ crash は再発しない
 （`use-local-model-management.test.ts` の既存契約テストは変更なしで通過する
  ことを確認済み）。
- **Bad**: `useLocalModelManagement` の起動時 effect は今も
  `management.lifecycle.load()`（manifest JSON ファイルの実読込）を実行する。
  その結果（`manifest` state・`view`）は Settings から Local Model 管理 UI を
  除去したため、どこからも表示・消費されない。実害は無いが、今後 v1.1 まで
  純粋な dead work として残る。
- **Tradeoff**:「Settings から Local Model 管理 UI を消す」より一段踏み込んで
  composition root 自体（`App.tsx` / `createDefaultLocalModelManagement`）を
  無効化する案もあったが、それは `localDataControl` の「全データ削除」が
  既存の Local Model ファイルを削除できなくなる（`NoLocalModelStorageAdapter`
  へのフォールバックにより、削除対象から漏れる）副作用を伴うため、この ADR
  では見送った。代わりに `management`（lifecycle・ファイル削除経路）の実体は
  維持しつつ、Provider の選定（`configureProvider`）と実際の消費口（会話
  Agent・Pet Interaction）の両方を Rules に固定する、より狭い変更を選んだ。

## References

- 関連コード: `src/app/native-agent-model-provider-composition.ts`,
  `src/app/PassportApp.tsx`, `src/screens/SettingsScreen.tsx`。
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)、
  [ADR-0037](./0037-conversation-agent-step-a-model-selection.md)（本 ADR が
  Provider 選定の 1 点のみ Supersede する）。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/104 、
  https://github.com/susumutomita/TenkaCloudPassport/issues/138 。
