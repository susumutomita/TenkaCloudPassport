# ADR-0057: 会話エージェントの Primary Provider を Apple Intelligence（FoundationModels）へ一本化する

- **Status**: Accepted。
- **Date**: 2026-07-28。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Issue 171（会話エージェントのモデルを選択制にする）の owner フィードバックを受け、Fable が Apple Intelligence（FoundationModels framework、iOS 26+）を Expo native module として組み込む feasibility spike の設計を進めていたところ、owner が同 Issue の最新コメント（2026-07-28）で方針を確定した。

v1.1.1〜v1.1.6 の TestFlight 実機不具合は、ほぼ全てが Qwen（GGUF ダウンロード型・`llama.rn`）のダウンロード・検証・削除・manifest・復旧まわりに起因していた（ADR-0052〜ADR-0056 が個別に対処してきた一連の blocker）。OS 内蔵の Apple Intelligence を使えば、モデルファイルの転送・整合性検証・部分削除・再起動を跨いだ復旧、という問題のクラス自体が構造的に消える。owner の決定は「Apple Intelligence 一本にする。Qwen は消費者導線から外す」であり、実装順序は「spike（native module 化・availability 判定・guided generation の検証）を最優先し、成功したら provider 差し替え → UI 簡素化 → メタデータ更新」とされた。

本 PR はこの spike を native module・provider 差し替え・ADR に本実装として仕上げる。対応端末は iPhone 15 Pro 以降 + iOS 26 + Apple Intelligence 有効。非対応端末は Rules（テーマ照合）で動作を継続する。Settings / 会話画面の Qwen UI 撤去と `docs/release/app-store-submission.md` のメタデータ更新は、変更量が大きく native/provider の検証を待たずに独立してレビューできるため、後続 PR に分割する（Known follow-up として記録）。

## Decision

### 1. Native Module: `modules/apple-foundation-models/`

`modules/device-resource-telemetry/`（既存の Expo Modules API Swift モジュール）を先例に、iOS 専用の native module を新設した。

- **`availability()`**: `SystemLanguageModel.default.availability`（`.available` / `.unavailable(reason)`）を bounded な文字列（`available` / `unavailable-device-not-eligible` / `unavailable-apple-intelligence-not-enabled` / `unavailable-model-not-ready` / `unavailable-unsupported-os` / `unavailable-unknown`）へ正規化して返す。`UnavailableReason` は `@frozen` ではないため `@unknown default` で fail-closed に丸める。
- **`complete(systemPrompt, userPrompt, schemaJson?)`**: `LanguageModelSession(instructions: systemPrompt)` で 1 回だけ生成する。`schemaJson` が無ければ自由文（`respond(to:options:)`）、あれば `DynamicGenerationSchema` から組み立てた `GenerationSchema` で guided generation（`respond(to:schema:options:)`）を行い、`GeneratedContent.jsonString` を返す。
- **iOS 26 未満・非対応端末**: `@available(iOS 26.0, *)` ガードと `guard #available` で分岐し、クラッシュせず graceful に unavailable / 型付き Exception を返す。

API シグネチャは記憶に頼らず、この macOS に実在する Xcode 26.6 / iOS 26.5 SDK の `FoundationModels.framework` の `.swiftinterface`（`arm64-apple-ios-simulator.swiftinterface`）をテキストとして直接読んで確認した一次情報から設計した。`AppleFoundationModelsEngine.swift` と `AppleFoundationModelsSchemaConverter.swift`（ExpoModulesCore 非依存）は `xcrun swiftc -typecheck -sdk $(xcrun --sdk iphonesimulator --show-sdk-path) -target arm64-apple-ios26.0-simulator` で実際に型検証済み（exit 0）。ExpoModulesCore 依存の Module / Exceptions は、実インストール済みの `node_modules/expo-camera` の実装（`GenericException<String>`、`guard #available`、`AsyncFunction` 内の暗黙 `async throws` 推論）を一次情報として踏襲した。

`FoundationModels.framework` は iOS 26 未満に存在しないため、podspec で `weak_frameworks = ['FoundationModels']` を指定して弱リンクする。deployment target は既存 `ios/Podfile`（16.4）と揃え、iOS 26 未満の端末でも起動時クラッシュしない。

### 2. Guided Generation の Schema: JSON Schema 文字列 → `DynamicGenerationSchema` の変換器

`model-safety-boundary.ts` の `responseFormat.schema` は `oneOf` 3 分岐（`no-signal` / `bridge`(evidenceIds enum 配列) / `grounded-bridge`(2 文字列)）という限定された JSON Schema の部分集合になっている。この部分集合（object / string の `const`・`enum` / array の `items`）だけを解釈する変換器を Swift 側に書き、`GenerationSchema(root:dependencies:)` へ変換する。TS 側の Schema 定義を正本のまま維持でき、evidenceIds の個数が変わっても Native コード変更が不要になる。3 つの `@Generable` Swift 型を用意する案、自由文 +「JSON で返して」という指示文だけで済ませる案も検討したが、前者は TS/Native の二重管理で drift の温床になり、後者は `llama.rn` 経路が既に構造化 Output を強制しているため後退になる。詳細は `Plan.md`（2026-07-28、Issue 171 節）の比較を参照。

**code-reviewer 指摘（blocker、修正済み）**: 初版の `dynamicSchema` は `oneOf` 判定の直後に `object["type"]` を必須としており、標準 JSON Schema で `const` / `enum` 単体が型を確定する（`type` を省略できる）ノード（本番の判別子 `kind: { const: 'no-signal' }` 等がまさにこの形）を変換できず、Bridge 判定が Guided Generation の度に必ず `invalidSchema` で失敗していた。`oneOf` の次に「`type` が無く `const`/`enum` を持つノードか」を判定し `stringSchema` へ委譲する分岐（`isBareStringLiteralSchema`）を追加して修正した。この修正は `xcrun swiftc -typecheck` では検出できない実行時ロジックの欠陥だったため、`responseFormatForEvidenceIds` / `CONVERSATION_EXAMPLE_TURN_RESPONSE_SCHEMA` の実出力（`bun` で実際に `JSON.stringify` した値）をそのまま渡す実行可能な Swift ドライバ（`swiftc` でコンパイルして実行、この PR には含めない一時検証物）で、修正後に全 4 パターンが `GenerationSchema` へ変換できることを確認した。

### 3. Provider 実装: `src/local-agent/apple-foundation-models-provider.ts`

`AgentModelProvider` 契約（`createSafetyBoundLocalModelProvider`）に適合する `LocalModelCompletionPort` を実装した。`llama.rn` の `LlamaContextPort` と異なり、`SystemLanguageModel` は重み読み込みを伴わない OS 常駐サービスで、明示的な init/release lifecycle や execution lease を持たない。そのため会話例（AI-to-AI icebreaker、ADR-0050）向けの `ConversationExampleCompletionPort.beginSession` は Native 側に状態を持たせず、TS 側で「毎ターン `complete()` を呼び直す」ことで模倣する（`close()` は no-op）。Native 呼び出し自体を取り消す手段が無いため、`AbortSignal` は呼び出し前後でだけ観測し、結果到達後に abort 済みなら結果を破棄する（fire-and-forget。既存の Fallback-once・timeout 機構と組み合わせても正しさは保たれるが、実行中の Native 推論そのものは止まらない）。

並行呼び出しの rate limit（`LanguageModelSession.GenerationError.concurrentRequests` / `.rateLimited`）は新しい直列化機構を作らず、型付き `LOAD_ERROR` として既存の Fallback-once に処理を委ねる。1 端末 1 Encounter という実運用の並行度を踏まえた判断であり、問題が顕在化したら Follow-up で再検討する。

**code-reviewer 指摘（altitude、正確性の補足）**: `agent-provider-session.ts` には `provider.kind === 'local-agent'` を条件に、Native Lane の呼び出しを 1 本に直列化する既存の primitive（`nativeLaneTail`、llama.rn の排他 Context 用に作られた）があり、これは変更しておらず Apple の呼び出しにも引き続き適用される。「新しい直列化機構は作らない」は正確だが、既存の直列化がそのまま効いている点を明記する。`nativeLaneQuarantined`（Native Context の解放を確認できなかった確定ケース用の quarantine）は Apple の Error constructor が一切設定しないため、この primitive のうち quarantine 半分は Apple 経路では実質不使用のまま、直列化半分だけが生きる。

**code-reviewer 指摘（high、修正済み）**: 初版は `temperature` を一律 `0`（`.greedy`、決定的）に固定しており、会話例（ADR-0050）が意図的に指定する `CONVERSATION_EXAMPLE_TEMPERATURE = 0.7`（多様性）を無視していた。決定的な生成は `assertNotRepeatingTranscript`（`src/domain/conversation-example.ts`）の重複検出に引っかかりやすくなる。`ConversationExampleTurnModelRequest.generation.temperature` を Native `complete()` の追加引数として転送し、Native 側は `temperature > 0` のときだけ `.random(probabilityThreshold: 0.9)`（nucleus sampling）へ切り替える（`.greedy` は `temperature` を無視して常に argmax を返すため、`temperature: 0.7` をただ渡すだけでは効果が無い）よう修正した。Bridge 判定（`LocalModelRequest`、`generation` field 無し）はデフォルトの `temperature: 0` のまま。

### 4. 配線: `createNativeAgentModelProvider` を Apple Primary + Rules Fallback へ

「Apple Intelligence が使えるなら最優先、使えなければ Rules」は、既存の Fallback-once 機構（`provider-fallback.ts` の `runProviderOnce`、`agent-provider-session.ts` の timeout/cancel 処理）がそのまま実現する。新しい非同期 Availability 事前チェックを composition 層に増設せず、`createNativeAgentModelProvider` は Apple 版 Completion Port を常に Primary Provider として返すだけにした。Apple Intelligence が使えない場合、Native 側が型付き `AgentModelProviderError('LOAD_ERROR')` を投げ、既存の Fallback-once がその Encounter だけ Rules へ倒す。

Qwen（`llama-agent-model-provider.ts` / `configured-agent-model-provider.ts` / `local-model-configuration.ts` 等）は削除せず残置する。再導入口として、また Model Lifecycle・Diagnostics 等の既存機能（この PR の scope 外）がまだ参照しているため。`default-agent-model-provider.native.ts` はこれらを import しなくなり、消費者向け会話エージェントの実行経路からは到達不能になる。

**advisor 指摘（起動時 availability 事前チェック省略の具体的な副作用、未修正・Follow-up 化）**:「新しい非同期 Availability 事前チェックを composition 層に増設しない」という判断は、`provider.kind` を常に `local-agent` にすることを意味する。これは `agent-provider-session.ts` の `executeAgentProviderSession` が `request.provider.kind === 'local-agent'` を条件に `local-started` / `local-failed` イベントを発火する既存ロジックと組み合わさり、Apple Intelligence 非対応端末（iPhone 15 Pro 未満・Apple Intelligence 無効・iOS 26 未満）では **毎 Encounter** で `ProviderRuntimeState` が `rules` → `loading-local-model` → `falling-back`（`reason: 'load-error'`）→ `rules` と遷移し、`providerStatusNotice` の通知（「Local Model を端末内で読み込んでいます」→「Rules Provider へ安全に切り替えています」）が毎回一瞬表示される。Qwen 未設定時代は `provider.kind` が最初から `rules` 固定だったため、この遷移自体が発生しなかった。加えて `use-conversation-agent-flow.ts` の `onStart` は `outcome.settledBy === 'primary'` のときだけ会話例（ADR-0050 icebreaker）を準備するため、非対応端末では常にこの機能がスキップされる。修正には `apple-foundation-models-availability.ts` の `checkAppleFoundationModelsAvailability` を起動時に 1 回呼び、unavailable なら `RULES_MODEL_PROVIDER` を返す構成が必要だが、`App.tsx` は現在 `createDefaultAgentModelProvider` を top-level 同期呼び出ししており、これを非同期化するのは「消費者 UI 変更はこの spike ではしない」という本 PR の制約を超える。Follow-up として記録した（`.claude/state/follow-ups.jsonl`、severity: high）。

### 5. 検証（macOS host 実行 + 実機 / Simulator 手順）

この開発機は macOS 26.5.2（Xcode 26.6 同梱）であり、`FoundationModels.framework` は iOS だけでなく macOS 26+ でも同一 API を提供する。native module の Expo 経路（JSI/Swift bridge）そのものは prebuild を要するため実行できないが、`AppleFoundationModelsEngine.swift` / `AppleFoundationModelsSchemaConverter.swift`（ExpoModulesCore 非依存）はこの Mac 向けに直接コンパイル・実行でき、Apple Intelligence の実際の応答を得られた。`xcrun swiftc -sdk $(xcrun --sdk macosx --show-sdk-path) -target arm64-apple-macosx26.0` でこの 2 ファイルと検証用 `main.swift`（この PR には含めない一時検証物）をビルドし、実行した結果を次に示す。

- `AppleFoundationModelsEngine.availability()` → `available`（この Mac は Apple Intelligence が有効）。
- `complete()`（Bridge Schema、`temperature: 0`、`evidenceOptions` に `topic:open-source` を含む prompt）→ `{"evidenceIds": ["topic:open-source"], "kind": "bridge"}`。Guided Generation が実際に該当 Evidence ID を選び、`model-safety-boundary.ts` の `validateAgentModelProviderOutput` がそのまま受理できる形で返した。
- `complete()`（no-signal のみの Schema、`evidenceOptions` 空）→ `{"kind": "no-signal"}`。
- `complete()`（会話例 Schema、`temperature: 0.7`）→ `{"text": "こんにちは！"}`。`.random(probabilityThreshold: 0.9)` サンプリング経路も正しく Schema 準拠の Output を返した。
- `complete()`（`schemaJson: nil`、自由文）→ 自然な英語の挨拶文。Guided Generation を使わない経路も動作した。

これは実際の Apple Intelligence モデルに対する実行結果であり、Schema 変換器・`GenerationOptions` 分岐・guided generation の全体が机上の型検証を超えて実データで正しく動くことを示す。

ただし、これは **macOS host 上での Engine/Converter 単体実行**にとどまる。native module 追加により `bunx expo prebuild` 以降の再ビルドが要り、呼び出し元環境では完走しない実績があるため、この PR では実施しない。特に次の 3 点は macOS host 実行では一切通っておらず、Engine/Converter の型検証や実行結果からは正しさを推論できない、Expo Modules の JSI 境界固有のリスクです。

1. **JS `number` → Swift `Double` の marshalling**: 追加した `temperature` 引数（会話例は `0.7`、Bridge 判定は `0`）が Expo Modules API の JSI ブリッジを越えて往復し、Swift 側で意図した `Double` 値として届くかは実機/Simulator 上でしか確認できない。
2. **オプショナル引数がオプショナルでない引数より前に並ぶ位置引数**: `AsyncFunction("complete") { (systemPrompt: String, userPrompt: String, schemaJson: String?, temperature: Double) -> String in ... }` は `schemaJson: String?`（省略可能）が `temperature: Double`（必須）より前にある。JS 側 `completeWithNativeAppleFoundationModels` は常に両方渡すため型上は問題ないが、Expo Modules API の引数バインディングがこの並びをどう解決するかは実機/Simulator の呼び出しでしか検証できない。
3. **`weak_frameworks = ['FoundationModels']` の実機リンク挙動**: iOS 16.4（`ios/Podfile` の deployment target）〜25 の端末でアプリを起動した際、弱リンクされた `FoundationModels.framework` が存在しないことでロード自体が失敗しない（起動時クラッシュしない）ことは、実機/Simulator でのインストール・起動でしか確認できない。

実機 / Simulator 検証手順（別途実施）を次に示す。

1. `bunx expo prebuild --clean` で `ios/` を再生成する（既存の `ios/` は触らない前提のため、このコマンドの実行と検証自体は呼び出し元 / owner が行う）。
2. Xcode で `TenkaCloudPassport.xcworkspace` を開き、iOS 26.5 Simulator（iPhone 16 系）または実機（iPhone 15 Pro 以降、Apple Intelligence 有効化済み、Settings > Apple Intelligence & Siri でモデル DL 済み）を選び実行する。
3. 会話エージェント画面で Encounter を発生させ、`availability()` の戻り値と `complete()` の guided generation 結果を確認する。上記 1（temperature marshalling）と 2（引数順序）はこの手順で間接的に確認できる（会話例が `0.7` らしい多様性のある文面になるか、Bridge 判定が決定的か）。Simulator で Apple Intelligence が有効化できない場合は `unavailable-*` のいずれかが返り、Rules Provider へ自動的にフォールバックすることを確認する。
4. 非対応端末（iOS 26 未満、または Apple Intelligence 無効な iPhone）で同じ画面を開き、クラッシュせず Rules で動作することを確認する（上記 3、`weak_frameworks` のリンク挙動の確認を兼ねる）。
5. 同じ非対応端末で、会話エージェント画面を数回操作し、Encounter 成立のたびに Provider 状態通知（「Local Model を端末内で読み込んでいます」等）が一瞬表示されないか確認する。表示される場合は本 ADR §4 に記録した Follow-up（起動時 availability 事前チェック）の優先度を上げる根拠になる。

## Consequences

- **Good**: ダウンロード・検証・削除・manifest・復旧という、v1.1.1〜v1.1.6 の実機不具合の大半を占めていた問題のクラスが、対応端末では構造的に発生しなくなる。
- **Good**:「Apple Intelligence 優先、無ければ Rules」は既存の Fallback-once をそのまま再利用でき、Provider 選定のための新しい非同期状態機械を追加していない。
- **Good**: Guided Generation の Schema 変換器はデータ駆動（TS 側の JSON Schema をそのまま解釈する）で、evidenceIds の個数変化などに Native コード変更なしで追随できる。
- **Good**: `xcrun swiftc -typecheck` による型検証に加え、macOS host（この開発機、Apple Intelligence 有効）上で Engine / Schema Converter を実際にコンパイル・実行し、本番の 3 種類の Schema（no-signal-only / bridge / grounded-bridge）と会話例 Schema・自由文経路のすべてで、実際の Apple Intelligence から `model-safety-boundary.ts` の Validator がそのまま受理できる形の JSON を得られることを確認した。この過程で code-reviewer が発見した blocker（`const`/`enum` 単体ノードの変換失敗、Bridge 判定が常に失敗する不具合）と high（`temperature` 未転送）を修正済み。
- **Bad / Tradeoff**: Apple 側の Native 呼び出しには真の取り消し手段が無く、`AbortSignal` による timeout/cancel は「結果を破棄する」だけで、実行中の推論自体は止められない（`llama.rn` の `stopCompletion()` に相当する API が無い）。実運用でリソース浪費が問題になった場合は Follow-up で再検討する。
- **Bad / Tradeoff**: この PR は native module・provider 差し替え・ADR・テストのみを scope とし、Settings / 会話画面の Qwen UI 撤去と `docs/release/app-store-submission.md` のメタデータ更新は後続 PR に分割した。この PR がマージされた状態では、Settings の Qwen ダウンロード UI は表示され続けるが、会話エージェントの実行結果には反映されない（配線から外れているため）。クラッシュや data loss は起きないが、UI と実際の Provider 選定が一時的に乖離する。
- **Bad / Tradeoff**: 起動時の非同期 Availability 事前チェックを composition 層に増設しなかったため、Apple Intelligence 非対応端末（installed base の相当割合を占めうる）では毎 Encounter で Provider が `local-agent` として起動を試み、`load-error` で Rules へ Fallback する。副作用として、Provider 状態通知（「Local Model を読み込んでいます」→「Rules Provider へ安全に切り替えています」）が毎回一瞬表示され、会話例（ADR-0050 icebreaker）生成が常にスキップされる（`outcome.settledBy !== 'primary'` のため）。詳細と修正方針は §4 参照。Follow-up（severity: high）として記録済みで、この PR の scope では対応しない。
- **Bad / Tradeoff**: macOS host 実行で Engine / Schema Converter のロジックそのものは実データで検証できたが、Expo Modules の JSI 境界、iOS 実機 / Simulator 上の挙動、`weak_frameworks` によるリンク動作、iOS 26 未満の端末での graceful degradation は未検証のまま（native module 追加により `bunx expo prebuild` 以降の再ビルドが要り、呼び出し元環境では完走しない実績があるため）。

## References

- 関連コード: `modules/apple-foundation-models/`（`AppleFoundationModelsEngine.swift` / `AppleFoundationModelsSchemaConverter.swift` / `AppleFoundationModelsExceptions.swift` / `AppleFoundationModelsModule.swift` / `AppleFoundationModels.podspec` / `expo-module.config.json` / `index.ts`）、`src/local-agent/apple-foundation-models-provider.ts`、`src/local-agent/apple-foundation-models-availability.ts`、`src/app/native-agent-model-provider-composition.ts`、`src/app/default-agent-model-provider.native.ts`。
- 関連 Issue: [Issue 171](https://github.com/susumutomita/TenkaCloudPassport/issues/171)（会話エージェントのモデルを選択制にする、owner 方針決定コメント 2026-07-28）。
- 関連 ADR: [ADR-0037](./0037-conversation-agent-step-a-model-selection.md)（Step A モデル選定）、[ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)（v1.0 の Rules 固定）、[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)（Qwen 再導入）、[ADR-0050](./0050-agent-to-agent-icebreaker-dialogue.md)（会話例機能）、[ADR-0052](./0052-app-scoped-trusted-model-download-with-background-resume.md)〜[ADR-0056](./0056-recovery-gate-fail-open-on-indeterminate-read.md)（Qwen ダウンロード起因の実機不具合の個別対処、本 ADR が構造的に解消する問題のクラス）。
- 外部資料: Apple `FoundationModels` framework（iOS 26.5 SDK、`arm64-apple-ios-simulator.swiftinterface`）、Xcode 同梱ドキュメント `IDEIntelligenceChat.framework` 内 `FoundationModels-Using-on-device-LLM-in-your-app.md`。
