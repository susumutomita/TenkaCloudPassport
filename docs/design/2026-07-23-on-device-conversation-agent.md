# 端末内会話エージェント（Intro Card 版）の設計と実現性スパイク

本書は [Issue 104](https://github.com/susumutomita/TenkaCloudPassport/issues/104)
（「端末内会話エージェントを自己紹介カードへ追加する」）の技術設計と、App Store v1.0
native な目玉機能として owner が希望する PrismML Bonsai 27B の実現性調査を 1 本にまとめた
設計文書とする。本 PR は **設計のみ** を対象とし、`src/` の実装は含まない。

既存の
[Agent Model Provider Contract](./agent-model-provider-contract.md)・
[Agent Model Provider Runtime](./agent-model-provider-runtime.md)・
[Local Model Safety Boundary](./model-safety-boundary.md)・
[llama.rn Provider と Development Build 統合](./llama-provider-development-build.md)・
[GGUF Import・Resource Guard・Benchmark](./gguf-model-lifecycle.md)・
[根拠付き Bridge 選定アルゴリズム](./bridge-selection.md) を **正本のまま拡張** し、
重複実装や新しい Provider Contract は作らない。自己紹介カード自体の契約は
[ADR-0026](../adr/0026-intro-card-pivot.md)・[ADR-0027](../adr/0027-intro-card-url-viewer.md)・
[自己紹介カード作成フロー再設計](./2026-07-22-intro-card-creation-flow.md) を正本とする。

## 用語の整理（Issue 104 と owner ヒアリングの橋渡し）

Fable からの依頼文は本機能を「on-device connection agent / コネクションエージェント」と
呼んでいたが、調査の結果すでに owner が Issue 104 として起票済みで、そこでは
「端末内会話エージェント（conversation agent）」という名称と、具体的な受け入れ基準
（カタログ会話テーマ・匿名化 Evidence・N 者間 Fairness・Rules フォールバック）が
先に固まっていた。本書は Issue 104 の受け入れ基準を正本とし、以後は Issue 104 の名称
「会話エージェント」に統一する（同一機能に 2 つの名称を作らないため）。branch・ファイル名も
この統一に合わせる。

## 目的と対象範囲

- owner が Issue 104 で確定した受け入れ基準を満たす技術設計を残す。
- PrismML Bonsai 27B（1-bit / Ternary）が `llama.rn` で現時点オンデバイス実行できるかを、
  一次資料を引用して判定する。
- 対象外: `src/` の実装、Issue 起票（Issue 104 が既存）、`docs/specs/` の要件定義書。
  Issue 104 の受け入れ基準がその役割を兼ねるため、本書は技術設計止まりとする。

## 実現性調査: PrismML Bonsai 27B は `llama.rn` で今すぐ動くか

### 結論（y/n）

**No（現時点では未実現。ただし完全な絶望ではなく、根拠付きの条件が明確にある）**。
1-bit 版は量子化フォーマット自体は mainline `llama.cpp` に取り込まれている。
それでも次の 3 つの独立した理由から、今この時点での採用は推奨しない。

- (a) React Native binding である `llama.rn`・実機・本機能の narrow task での動作を
  裏付ける一次資料が存在しない。
- (b) この Repo が既に持つ Resource Risk の保守的な閾値
 （[ADR-0014](../adr/0014-private-gguf-lifecycle-and-resource-guard.md)）に自ら
  照らすと、production entitlement 復元前の端末ではほぼ確実に `blocked` になる。
- (c) タスク自体が 27B スケールを要求しない。

### 根拠

#### 1. モデル自体は実在し、1-bit 版は mainline 化が進んでいる

PrismML は 2026-07-14 に Bonsai 27B（Qwen3.6 27B ベース、Apache-2.0）を 2 種で公開した。

| 変種 | 公式サイズ（LM 単体） | 量子化名 | mainline `llama.cpp` |
| --- | --- | --- | --- |
| 1-bit | 3.53 GiB（MLX 版 3.92 GiB） | `Q1_0`（group 128） | **取り込み済み**。「1-bit (`Q1_0`) is merged into upstream llama.cpp, so recent upstream builds work」（[PrismML Docs](https://docs.prismml.com/run/llamacpp)）。 |
| Ternary | 6.66 GiB（MLX 版 7.05 GiB） | `Q2_0`（group 128） | **未取り込み**。「Ternary (`Q2_0`) needs the PrismML fork...; stock builds cannot run it」（同上）。 |

owner の記憶（1-bit 3.9 GB・Ternary 5.9 GB）は概ね近いが、公式値は 1-bit 3.53〜3.92 GiB・
Ternary 6.66〜7.05 GiB であり、Ternary は owner の記憶より大きい。加えて PrismML 自身が
Ternary について「Does not fit a phone: at ~7.2 GB the ternary build exceeds the ~6 GB
per-app iOS memory budget; use the 1-bit companion」と明言している
（[PrismML Docs: Bonsai 27B](https://docs.prismml.com/models/bonsai-27b)、
[Ternary-Bonsai-27B-gguf on Hugging Face](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)）。
そのため **Ternary は本機能の候補から除外**し、以後は 1-bit 版だけを検討する。

mainline 化の経緯は [ggml-org/llama.cpp Discussion #22019](https://github.com/ggml-org/llama.cpp/discussions/22019)
に残っている。当初 PrismML が提案した group size 128 を、`llama.cpp` メンテナ
（ggerganov）が「Q2_0 with group size 64」（Ternary 側）へ変更提案し、CPU（
[PR #24448](https://github.com/ggml-org/llama.cpp/pull/24448)）・Metal（
[PR #25419](https://github.com/ggml-org/llama.cpp/pull/25419)）・Vulkan（
[PR #25430](https://github.com/ggml-org/llama.cpp/pull/25430)、2026-07-17 merge 済み）・
CUDA（[PR #25707](https://github.com/ggml-org/llama.cpp/pull/25707)、2026-07-22 時点で
open）の順で各バックエンドへ展開されている。この一連の議論は **Ternary（Q2_0）** の話であり、
1-bit（`Q1_0`）は別枠で先に mainline 化済みという PrismML 公式の記述と矛盾しない。
なお、この mainline 化は group size **64** を対象にしており、PrismML が実際に配布する
Ternary の GGUF（group size **128**）とはパラメータが異なる。したがって Q2_0 バックエンドの
mainline 化が CPU・Metal・Vulkan まで進んでいても、PrismML が現在配布している Ternary
ファイルそのものを stock 版 `llama.cpp` が読める保証にはならず、上表の「未取り込み」という
判定は変わらない。

#### 2. `llama.rn`・実機での動作実績が一次資料に存在しない

この Repo が使う `llama.rn`（`package.json` で `0.12.6` を固定、bundle する
`llama.cpp` は commit `b9982`。直近の `0.12.7` は `b10054`、2026-07-22 sync）は
`ggml-org/llama.cpp` の mainline snapshot を追従する React Native binding である
（[mybigday/llama.rn Releases](https://github.com/mybigday/llama.rn/releases)）。
PrismML 公式ドキュメントが挙げる動作実績は次の 2 系統だけであり、**React Native /
`llama.rn` 経由の実行例は一次資料に一件も見つからなかった**。

- macOS/Linux/Windows/iOS 向け **MLX Swift** を使う経路（iPhone 17 Pro Max で約 11 tok/s、
  1-bit 版）。出典は [Wavect: Bonsai 27B Review](https://wavect.io/blog/bonsai-27b-phone-local-ai-review/)、
  [MarkTechPost](https://www.marktechpost.com/2026/07/14/prismml-releases-bonsai-27b-1-bit-and-ternary-builds-of-qwen3-6-27b-that-run-on-laptops-and-phones/) の 2 件。
- **PrismML 提供の事前ビルドバイナリ / `llama.cpp` CLI**（macOS・Linux・Windows・
  iOS の XCFramework を含むが、React Native binding は列挙されていない。
  出典: [PrismML Docs: Run with llama.cpp](https://docs.prismml.com/run/llamacpp)）。

iPhone での唯一の実測（約 11 tok/s）は **MLX Swift** によるものであり、
`llama.cpp`/`llama.rn` 経由ではない。この Repo のネイティブ推論基盤は
[ADR-0023](../adr/0023-llama-provider-runtime-boundary.md) で `llama.rn` 単独に固定して
おり、MLX Swift は別の Native スタックの新規追加になる（Composition Root・Context lease・
teardown 契約をもう一系統増やす大改築であり、本機能のような narrow task には不釣り合いに
大きい）。「1-bit の量子化形式が mainline に入った」という事実だけでは、
「`llama.rn` の Metal backend で Bonsai のモデルアーキテクチャ（~75％ 線形 Attention の
hybrid-attention 構成）まで実際に読み込み・実行できる」ことの証明にはならない。量子化
テンソル型のサポートと、モデル固有の計算グラフ（`convert_hf_to_gguf.py` の
architecture 名・`llm_build_*` 相当の Graph 構築）のサポートは別層であり、後者が
mainline に入っているかは今回の調査で確証を得られなかった。**Bonsai 1-bit が
`llama.rn` の物理 iPhone 実機で実際に Load・初回 Token・Completion まで到達するかは、
本 Repo が既に定める「物理端末の完了ゲート」（後述）でしか確認できない未検証の問いとする。**

#### 3. 既存の Resource Risk 式に当てはめると `blocked` になる可能性が高い

[GGUF Import・Resource Guard・Benchmark の設計](./gguf-model-lifecycle.md) は次の式で
`supported | caution | blocked` を決める（既存コードそのまま、変更なし）。

```text
estimatedWorkingSetBytes = ceil(modelSizeBytes * 1.20) + nCtx * 256 KiB
ratio = estimatedWorkingSetBytes / effectiveMemoryBytes
blocked: ratio > 0.60
```

Bonsai 1-bit LM 単体（3.53 GiB、Vision mmproj は本機能に不要なので除外）とデフォルト
`nCtx = 2,048` を代入すると `estimatedWorkingSetBytes ≈ 4.24 GB + 0.5 GB ≈ 4.74 GB` になる。
PrismML 自身が挙げる「iOS の per-app memory budget ~6 GB」を `effectiveMemoryBytes` に
仮置きすると `ratio ≈ 0.79` であり、閾値 `0.60` を超えて **`blocked`** になる。
さらに本 Repo の [follow-up VW8T2M](../../.claude/state/follow-ups.jsonl)
（`.claude/state/follow-ups.jsonl` に記録）のとおり、`llama.rn` の memory entitlement
（`extended-virtual-addressing` / `increased-memory-limit`）を TestFlight 審査通過のため
**development build 限定**に絞っている（`app.json` の `entitlementsProfile: ["development"]`）。
本番配信 build では entitlement 復元前提の「6 GB budget」自体がさらに保守的なデフォルト値へ
落ちる可能性が高く、production 配信を前提にする限り `ratio` はこの試算より悪化する
方向にしか動かない。将来 entitlement を production へ戻し、実機で Peak Memory / Thermal
証跡を取れた場合だけ、ADR-0014 が定める手続き（新しい ADR + Compatibility Matrix）で
閾値緩和を検討できる。

#### 4. タスクの複雑さに対してモデルが過大である

Bonsai 27B は 262K context・Tool Call・Vision・多段 Agentic Loop 向けに設計されている
（[PrismML Docs: Bonsai 27B](https://docs.prismml.com/models/bonsai-27b)）。一方
Issue 104 が要求するのは「カタログ管理された確認済み会話テーマ（最大 3 件、閉じた
Evidence ID 集合）から、既存の `evidenceIds` 選定 Schema に沿って部分集合を選ぶ」だけの、
入力も出力も小さく閉じたタスクである（後述）。既存の
[Agent Model Provider Contract](./agent-model-provider-contract.md) の Rules 基準実装が
既にこの規模の判定を同期・決定的に処理できており、Local Agent が担うのは「Rules と
同じ Evidence 集合から異なる部分集合を選び得る」程度の付加価値に留まる。0.5B〜3B class の
指示追従モデル（既存 `Q4_K_M` 等の標準量子化、mainline `llama.cpp` で無条件に動作
実績がある）で十分な理由の方が強く、27B・4 GB 超のモデルを唯一の入り口にする根拠は
薄い。

### 実現性調査の出典一覧

- [PrismML Releases Bonsai 27B（MarkTechPost）](https://www.marktechpost.com/2026/07/14/prismml-releases-bonsai-27b-1-bit-and-ternary-builds-of-qwen3-6-27b-that-run-on-laptops-and-phones/)
- [PrismML Docs: Bonsai 27B](https://docs.prismml.com/models/bonsai-27b)
- [PrismML Docs: Run with llama.cpp](https://docs.prismml.com/run/llamacpp)
- [prism-ml/Bonsai-27B-gguf（Hugging Face）](https://huggingface.co/prism-ml/Bonsai-27B-gguf)
- [prism-ml/Ternary-Bonsai-27B-gguf（Hugging Face）](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)
- [Wavect: Bonsai 27B Phone Local AI Review](https://wavect.io/blog/bonsai-27b-phone-local-ai-review/)
- [ggml-org/llama.cpp Discussion #22019](https://github.com/ggml-org/llama.cpp/discussions/22019)
- [ggml-org/llama.cpp PR #24448（CPU Q2_0）](https://github.com/ggml-org/llama.cpp/pull/24448)
- [ggml-org/llama.cpp PR #25419（Metal Q2_0）](https://github.com/ggml-org/llama.cpp/pull/25419)
- [ggml-org/llama.cpp PR #25430（Vulkan Q2_0、merge 済み）](https://github.com/ggml-org/llama.cpp/pull/25430)
- [ggml-org/llama.cpp PR #25707（CUDA Q2_0、open）](https://github.com/ggml-org/llama.cpp/pull/25707)
- [ggml-org/llama.cpp Issue #25727（Ternary Bonsai crash 報告）](https://github.com/ggml-org/llama.cpp/issues/25727)
- [mybigday/llama.rn Releases](https://github.com/mybigday/llama.rn/releases)
- [PocketPal AI（App Store 上の GGUF ダウンロード型オンデバイス LLM アプリの前例）](https://apps.apple.com/us/app/pocketpal-ai/id6502579498)

## モデル選定の推奨

1. **v1.0 は 0.5B〜3B class の指示追従モデルを採用する**。具体的には
   Qwen2.5-1.5B-Instruct（Q4_K_M、Apache-2.0）を採用する（ADR-0037）。owner の
   Document Picker 経由手動 import（Issue 18 の既存機能、変更なし）に加えて、
   PR #132（Codex レビュー対応）で新規モジュール `trusted-model-catalog.ts` と
   `trusted-model-download.ts` を追加し、信頼済み URL・期待 SHA-256 を設定に持つ
   自動取得の orchestration を実装した。取得後は Issue 18 の
   [GGUF Import・Resource Guard・Benchmark](./gguf-model-lifecycle.md) 経路
  （private copy・chunked SHA-256・Resource Risk・manifest）へそのまま合流し、
   検証済み経路を複製しない。Settings からの同意 UI・進捗表示は別 PR で追う。
   詳細は下記「モデルライフサイクル・entitlement」節を参照する。
2. **Bonsai 1-bit は「実現性が完全な No ではない、条件付き将来候補」として Known
   follow-up に残す**。採用条件を次の ADR-0036 に明記し、満たすまでは import・activate
   経路に何のコード変更も要らない（既存 Resource Risk Gate が保守的なデフォルト値で
   そのまま実行を止める設計のため、機能追加なしで安全側に倒れる）。
3. 27B スケールを待つ間の段階案として、モデル差し替えは**運用で完結する**（Owner が
   import する GGUF ファイルを差し替えるだけ）。アプリコード・Provider Contract・Prompt
   Schema には一切依存しない。これは [ADR-0023](../adr/0023-llama-provider-runtime-boundary.md)
   が既に持つ「Model Path は環境変数 / Managed Manifest から受け取るだけで、コードへ
   固定しない」という既存原則をそのまま踏襲する。

## データの流れと責務（Issue 104 受け入れ基準への対応）

既存コンポーネントの再利用を最大化し、新しい Provider Contract・新しい Prompt/Output
Schema は **作らない**。Native 境界を横切るのは既存どおり閉じた `evidenceIds` 集合だけで、
氏名・連絡先・URL・自己紹介自由文は一切 Model へ渡さない（Issue 104 の受け入れ基準と
[Local Model Safety Boundary](./model-safety-boundary.md) をそのまま満たす）。

```text
IntroCard（既存 + themeIds 追加）
  -> 自己紹介ページ URL（既存 + `m` key 追加、app/viewer 同時対応が前提）
  -> 受信側: QR 再スキャン or 手動 URL 貼り付け（既存 qr-scanner-port を再利用）
  -> ConversationSession（新規、メモリ限定・非永続、明示終了で即時破棄）
     -> 参加者 2〜6 名（bridge-selection.ts の既存上限をそのまま使う）
  -> 全ペアの shared-topic Evidence を Rules で同期計算（純関数、既存 bridge-selection.ts の
     Evidence 抽出・bridgePairKey・Fairness Tie-break をそのまま再利用）
  -> 最も根拠の強い 1 組を Fairness 選定
  -> その 1 組の Evidence だけを既存 model-safety-boundary.ts の canonical request へ投影
  -> 既存 createAgentProviderSessionRunner() / AgentModelProvider（Rules または Local）
  -> 既存 validateAgentModelProviderOutput + 固定 Renderer
  -> 会話理由 + 最初の質問を表示 -> セッション終了で ConversationSession を破棄
```

| 境界 | 責務 | 既存/新規 |
| --- | --- | --- |
| `src/domain/intro-card.ts` | `themeIds?: readonly ClueId[]`（最大 3、`clue-catalog.ts` を再利用）を追加。 | 既存ファイルへの追加。新しいカタログは作らない。 |
| `src/protocol/intro-card-url.ts` | `OPTIONAL_PAYLOAD_KEYS` へ `m`（themeIds の短縮 key）を追加。`q`（クイズ進捗、Issue 110）と同じ all-or-nothing・fail-closed 検証パターンを踏襲する。 | 既存ファイルへの追加。`v: 1` のまま追加するが、`m` は `q` と同じ fail-closed 契約に従う（後述のエッジケース参照、無条件の後方互換ではない）。 |
| `src/domain/conversation-session.ts`（新規） | 受信した Intro Card（最大 6 名分、`MAX_BRIDGE_SELECTION_PARTICIPANTS` と同じ上限）をメモリ内 `ReadonlyMap` として保持する。Storage Port を持たない（ディスクへ書かない）。明示終了 API で即時 clear する。 | 新規。[ADR-0026](../adr/0026-intro-card-pivot.md) の「アプリ側は相手の情報を受信・保存・パースしない」という Step 1 契約を Step 2（会話エージェント）の範囲で明示的に上書きするが、**永続化しない**ことでリスクを最小化する（後述の代替案）。 |
| `src/domain/conversation-agent-evidence.ts`（新規、`bridge-selection.ts` のアダプタ） | 各参加者の `themeIds` を `bridge-selection.ts` が期待する `shared-topic` Evidence 抽出関数（`findFirstSharedConfirmedClue` 相当）へ投影し、`selectBridges` / `buildSelectedBridgeFromEvidence` を呼ぶ。Fairness・Confidence 規則は複製しない。ただし `selectBridges` が受け取る `BridgeSelectionParticipant.passport: PublicPassport` は `schemaVersion` / `catalogVersion` / `petName` が必須であり、Intro Card にはこれらの自然な対応がない。アダプタはこれらへ意味を持たないプレースホルダ値を合成する必要があり、単純な型変換だけでは済まない（`evidenceNarrative` は `petName` を読まないため表示への漏洩は無いが、実装時に型の非対称性を code-reviewer で確認する）。 | 新規（アダプタ + プレースホルダ合成、Fairness 本体は再利用）。 |
| `model-safety-boundary.ts` / `llama-agent-model-provider.ts` / `agent-provider-session.ts` | 無変更。渡す Evidence の出所が Lounge Passport からこの新しい `ConversationSession` へ変わるだけで、Contract・Schema・Context lease 規律は同一。 | 既存、無変更。 |
| `src/screens/ConversationAgentScanScreen.tsx`（新規） | 既存 `qr-scanner-port` を再利用したカード受信 UI。手動 URL 貼り付け欄も併設する（`decodeIntroCardUrlFragment` を共有）。 | 新規 Screen。既存 `QrScanScreen.tsx` の Camera Permission パターンを踏襲する。 |

## 入力取得 UX（QR スキャン / 貼り付け）

この Repo には既に Lounge Invite 用の実カメラ QR スキャン基盤（`qr-scanner-port.ts`・
`QrScanScreen.tsx`、`expo-camera` 相当の許可フロー）がある。自己紹介カード自体は
[ADR-0027](../adr/0027-intro-card-url-viewer.md) で「フラグメント付き静的ビューア URL」
方式に変わっているため、同じ URL を次の 2 経路のどちらでも取り込めるようにする。

1. **QR 再スキャン**: 既存カメラ許可フローで QR を読み取り、`https://card.tenkacloud.com/c/#...`
   形式の URL を得たら、ブラウザで開かず `decodeIntroCardUrlFragment` へ直接渡して
   `ConversationSession` へ追加する（Web 遷移を挟まない）。
2. **手動貼り付け**: 相手が Web ビューアで開いた URL をコピーして貼り付ける（オフライン
   共有・PC 経由共有等、カメラが使えない場面の fallback）。バリデーションは 1 と共通。

## 審査官が単独で試せる審査戦略

App Store 審査官は 2 台目の端末・2 人目の協力者を用意できない。次の仕組みで単独実演を
可能にする。

- アプリ内に **サンプル自己紹介カード**（架空の人物、カタログテーマ 2〜3 件を確認済みに
  した固定データ）を同梱し、「サンプルで試す」ボタンから `ConversationSession` へ
  直接注入する（QR 生成・URL 往復を経ない、テスト専用の内部経路）。
- 審査官は「自分のカード（またはサンプル）」+「サンプル相手カード」の組み合わせで、
  会話テーマの共通点・最初の質問が生成される一連の流れを 1 台の端末・オフラインで
  完走できる。
- サンプルデータには実在人物の氏名・連絡先を使わない（審査メモにその旨を明記する）。

## モデルライフサイクル・entitlement・プライバシー・審査戦略

- **モデルライフサイクル**: Issue 18 の既存資産（Document Picker → private copy →
  chunked SHA-256 → `loadLlamaModelInfo` 検証 → Resource Risk → activate）をそのまま使う。
- **モデル入手経路の追記（PR #132、Codex レビュー対応）**: 上記の当初判断（「本機能専用の
  Model 取得・検証コードは増やさない」）は、Document Picker 経由の手動 import しか経路が
  無いと通常の利用者が Native でも実質 Rules-only になってしまうという指摘を受けて見直した。
  `src/local-agent/trusted-model-catalog.ts`（Qwen2.5-1.5B-Instruct、Q4_K_M、Apache-2.0 の
  URL・SHA-256・サイズを設定として保持）と `src/local-agent/trusted-model-download.ts`
 （明示同意・容量確認・ダウンロード・期待 SHA-256 照合の純粋な orchestration）を追加した。
  Native 実装は `expo-file-system` の `DownloadTask` を使う。iOS では
  `sessionType: 'background'`・`pauseAsync`/`resumeAsync`・`DownloadPauseState`
  により、native 側が永続化を提供する。
  検証済みの候補は Issue 18 の既存 `LocalModelLifecycle.importCandidate` へそのまま渡し、
  private copy 以降（chunked SHA-256・GGUF 検証・Resource Risk・manifest）は再実装しない。
  Settings 画面からの同意 UI・進捗表示・実機検証は本 PR の scope に収まらず、別
  Issue/PR（設計文書ゲート・物理端末実機証跡を先に満たす）へ follow-up した。
- **entitlement**: production entitlement 復元は本機能の前提条件ではない（0.5B〜3B class は
  entitlement なしでも Resource Risk `supported` に収まる設計目標）。Bonsai 1-bit を採用する
  場合だけ復元が必須になる。preview entitlement（実機テスト用）についても、`app.json` の
  設定変更だけでは有効化されない。Apple Developer Portal の対象 App ID
 （`cloud.tenka.passport`）で capability を有効化し Provisioning Profile を再生成する owner
  作業を先に済ませる必要がある。詳細は
  [`llama-provider-development-build.md`](./llama-provider-development-build.md) の該当節を参照する。
- **プライバシー**: Model へ渡すのは既存契約どおり匿名カタログ ID だけ。受信した
  相手カードの氏名・連絡先・自己紹介文はセッションメモリにしか存在せず、ディスク・
  バックアップ・Model Prompt のいずれにも書き込まない。セッション終了（画面遷移・
  アプリ終了・明示的な「終了する」操作）で即時 clear する。
- **審査戦略**: 大容量 Model の初回オンデバイス取得は Wi-Fi 限定・明示同意・進捗表示・
  再開可能を UX 要件にする（Issue 18 の既存 Import UX 方針と同じ）。App Store の
  Cellular ダウンロード制限（200 MB、App Store 経由のアプリ本体更新に対する制限であり、
  アプリ自身が行う任意サイズの HTTP ダウンロードには適用されない）はこの設計を妨げない。
  同種の前例として PocketPal AI（Hugging Face から GGUF を端末内ダウンロードして
  オフライン推論する既存 App Store 掲載アプリ）がある。

## 段階実装計画

1. **Step A（v1.0 に含める最小範囲）**: `IntroCard.themeIds`・URL `m` key・
   `ConversationSession`（2 者間のみ、`MAX_BRIDGE_SELECTION_PARTICIPANTS` を将来の
   拡張余地として型には残すが UI は 2 者間に絞る）・既存 Rules/Local Agent Provider への
   配線・サンプルカードによる審査官向け実演導線。
2. **Step B（follow-up）**: 3〜6 名の N 者間セッション UI（`bridge-selection.ts` の
   Fairness ロジックは Step A の時点で既に対応済みのため、主に UI・複数 QR 受信導線の
   追加になる）。
3. **Step C（Bonsai 1-bit 採用の条件、別 ADR が必要）**: (a) `llama.rn` が実際に
   Bonsai 1-bit GGUF を物理 iPhone / Android arm64 実機で Load・First Token・Completion
   まで到達することを ADR-0014/0023 の「物理端末の完了ゲート」で証跡化する、
   (b) production entitlement を復元し（follow-up VW8T2M 解消）、App Store 提出済みで
   あることを確認する、(c) 本機能の narrow task（テーマ ID 選定）における品質を
   0.5B〜3B baseline と比較し、追加の Footprint・Latency に見合う差があることを確認する。
   3 条件すべてを満たした場合だけ、Owner が import する推奨 Model を Bonsai 1-bit へ
   切り替える運用変更を行う（コード変更は不要）。

## リスクと未解決の問い

- Bonsai 1-bit の量子化テンソル型（`Q1_0`）が mainline 化されていることと、Bonsai の
  モデルアーキテクチャ（hybrid-attention）自体が `llama.cpp` の Graph Builder に
  実装されていることは別問題であり、後者を裏付ける一次資料を確認できなかった。
  Step C 着手時に実機 Spike で最初に検証すべき問いとして残す。
- `llama.rn` は `ggml-org/llama.cpp` の mainline snapshot を追従するため、将来的に
  Bonsai 対応 commit へ sync されるかどうかは `mybigday/llama.rn` のメンテナンス方針に
  依存し、この Repo 側で制御できない。
  Issue 18 の Compatibility Matrix（4B/8B class、未実施）と同様、27B class も実機証跡が
  無い限り `未実施` のまま扱う。
- Issue 104 の受け入れ基準にある「複数参加者の全ペアを端末内で評価」は N が大きいほど
  ペア数が `N*(N-1)/2` で増える。Local Agent を全ペアに対して逐次呼び出すと
  ADR-0023 の「単一 Native Lane」制約下で著しく遅くなるため、**Rules による Evidence
  抽出は全ペアに対して同期的に行い、Local Agent（任意）は最終的に選ばれた 1 組にだけ
  適用する**設計にした。これは Issue 104 の受け入れ基準「最も根拠の強い 1 組へ提示」と
  整合するが、実装時に code-reviewer で再確認する。
- 受信したカードをメモリ限定で保持する `ConversationSession` は [ADR-0026](../adr/0026-intro-card-pivot.md)
  の「アプリ側は相手の情報を受信・保存・パースしない」という Step 1 の記述と文言上は
  緊張関係にある。ADR-0036 でこの点を明示的に supersede する（後述）。

## 代替案

### 案 A: Bonsai 1-bit を v1.0 の唯一の対応 Model として設計する（不採用）

owner の当初希望に最も忠実だが、上記の実現性調査が示すとおり `llama.rn` 実機での動作
実績が一次資料に無く、この Repo 自身の Resource Risk 式に当てはめると `blocked` になる
可能性が高い。「動くかどうか分からないものを唯一の入口にする」設計は
`docs/architecture/quality-bar.md` の「最初に動いた構造を採用しない」以前に、
「動くかどうかも分からない構造を採用しない」という、より基本的な問題を抱える。
不採用とし、Step C の条件付き follow-up として残す。

### 案 B: 受信カードをディスクへ一時ファイルとして永続化する（不採用）

セッション終了前にアプリが強制終了した場合の復旧を考えると魅力的だが、ADR-0007/0026 の
「相手の情報を明示操作なしに保存しない」という原則をより強く侵食する。メモリ限定
（`ConversationSession` はプロセス生存中だけ有効）にし、強制終了時は復旧せず単に
消える設計にする方が、privacy contract の逸脱を最小化できる。

### 案 C（採用）: 会話テーマを既存 `clue-catalog.ts` から独立させた専用カタログにする案（検討し、既存カタログ再利用へ変更）

当初「Intro Card 専用の会話テーマカタログ」を新設する案も検討したが、Issue 104 の
「カタログ管理された会話テーマ」は既存 Passport の `topics` が使う `ClueId` と概念的に
同一（版管理済み ID・カテゴリ・表示名を持つ確認済み手掛かり）とみなせる。カタログを 2 つに
分けると、同じ関心事（例: `open-source`）が Passport 側と Intro Card 側で別 ID になり得て
一貫性を壊す。既存 `clue-catalog.ts` をそのまま再利用し、`IntroCard.themeIds` は
`readonly ClueId[]`（最大 3）とする。

## エッジケース

- `themeIds` が 0 件の Intro Card 同士: 既存の no-signal 原則どおり Evidence 0 件で
  `no-signal` になる。捏造しない。
- 参加者が 2 名未満（自分のカードしか無い）: `MIN_BRIDGE_SELECTION_PARTICIPANTS = 2`
  未満のため `ConversationSession` は起動不可とし、既存カード受信画面へ戻す。
- 旧バージョンの自己紹介ページ URL（`m` key が無い）を新しいアプリで受信: `themeIds`
  無しの Intro Card として扱い、Evidence 抽出は単に 0 件になる（クラッシュしない）。
- 新しいアプリが発行した `m` 付き URL を旧バージョンのビューア（`site/c/index.html`）が
  開く: ビューアの `hasOnlyKnownKeys` と app 側の `strictRecord` はどちらも `q` と同じ
  all-or-nothing の fail-closed 設計であり、未知 key は無視されずフラグメント全体が
  拒否される。したがって **`site/c/index.html` と app 側の `OPTIONAL_PAYLOAD_KEYS` は
  同じ PR 内で同時に `m` へ対応させる**必要があり、後方互換を主張できるのは両者が
  揃った時点からである。この段取りは `src/protocol/intro-card-url.ts` に `m` を
  追加する実装 Issue のタスクへ明記する。
- Native Provider が Load 失敗・Timeout: 既存の Fallback-once で Rules Provider へ
  切り替わり、Evidence 抽出自体は Rules がそもそも担っているため体験の連続性が保たれる。

## 人間検証・物理端末の完了ゲート

- Step A の Rules 経路は JavaScript Test（BDD、100％ カバレッジ）で固定できる。
- Step A で Local Agent を有効化する場合は、[ADR-0023](../adr/0023-llama-provider-runtime-boundary.md)
  が既に定める iPhone / Android arm64 実機 Matrix（Model 未設定・Load 失敗・成功・
  Airplane Mode・Cancel/Release）をそのまま踏襲し、新しい実機証跡カテゴリは増やさない。
- Step C（Bonsai 1-bit）は、上記に加えて [ADR-0014](../adr/0014-private-gguf-lifecycle-and-resource-guard.md)
  の Compatibility Matrix へ 27B class の行を追加し、Peak Memory・Thermal・Load 時間を
  実機で記録するまで `未実施` のまま維持する。

## Known follow-ups

- Bonsai 1-bit の `llama.rn` 実機動作検証（Step C の前提、上記リスク参照）。
- 3〜6 者間セッション UI（Step B）。
- `ConversationSession` の ADR-0026 との関係整理は本書と ADR-0036 で扱うが、
  受信カードの UI 表示仕様（誰の情報として出すか、匿名表示にするか）は実装時の
  code-reviewer 確認事項として別途 `/follow-up add` する。
