# llama.rn Provider と Development Build 統合の設計

本書は [Issue 17](https://github.com/susumutomita/TenkaCloudPassport/issues/17) の設計を定める。
[Agent Model Provider Contract](./agent-model-provider-contract.md) と
[Agent Model Provider Runtime](./agent-model-provider-runtime.md) を Native 実装へ接続し、Expo Go / Web
では Rules Provider、iOS / Android Development Build では設定済みの場合だけ `llama.rn` Local Agent を
使う。Local Agent は文章や Action を生成せず、確認済み Evidence ID の部分集合か `no-signal` だけを返す。

## 目的と対象範囲

- `llama.rn` 0.12 系を Expo SDK 57 / React Native New Architecture の Development Build に組み込む。
- GGUF の端末内 Path、`n_ctx`、GPU Layer 数、最大生成 Token 数を設定境界で検証する。Model ID や
  Download URL はコードへ固定しない。
- Native module の読込、Model 初期化、構造化 Completion、Cancel、Context 解放を 1 つの Adapter に閉じ込める。
- System Instruction と、同意済み Public Passport から作る信頼できない JSON Data を別 Message にする。
- Model 未設定、Load 失敗、OOM、Model 不正、JSON 不正、Native 例外、Timeout、Cancel を既存の型付き
  Failure と Rules Fallback-once へ接続する。
- Lounge の Exit / Expire、画面 Unmount で実行中 Completion を Cancel し、Context を必ず解放する。

Model Weight の同梱・自動 Download、Document Picker と Private Sandbox への取込、Model Digest、
Benchmark と端末別 Resource Guard は Issue 18 の責務とする。Cloud API、Tool Call、Vision、Audio、
Background 推論も対象外とする。

## データの流れと責務

```text
PassportApp（Encounter Key と Lounge lifetime を所有）
  -> createAgentProviderSessionRunner（deadline / cancel / fallback-once / idempotency）
    -> llama AgentModelProvider（Development Build のみ）
      -> LocalModelConfiguration（GGUF Path / n_ctx / GPU layers / n_predict）
      -> lazy import('llama.rn')
      -> initLlama（1 Encounter に 1 Context）
      -> completion
         system message: 固定命令
         user message: consented Public Passport と許可済み Evidence の JSON
         response_format: strict JSON Schema
      -> JSON.parse（外部入力境界）
    -> validateAgentModelProviderOutput（Evidence を入力から再導出）
    -> trusted live-outcome materializer（既存 Bridge constructor）
  -> Retired Lounge または Rules/Owner Question 経路
```

責務は次のように分ける。

| 境界 | 責務 |
| --- | --- |
| `local-model-configuration.ts` | Model Path と数値設定の検証だけを行う。Model の存在確認や Download は行わない。 |
| `llama-agent-model-provider.ts` | Native API の最小 Port、Prompt Data、JSON Schema、Error 分類、Stop / Release を所有する。React と Expo を import しない。 |
| `llama-module-loader.native.ts` | `llama.rn` を関数内でだけ動的 import する。Web / Expo Go の module 初期化経路から分離する。 |
| `default-agent-model-provider.*.ts` | Platform と設定の Composition Root。Web / Default / Expo Go は常に Rules、Development Build は Model Path がある場合だけ Local を選ぶ。`EXPO_PUBLIC_*` は Expo の inline 契約どおり直接プロパティ参照する。 |
| `agent-provider-session.ts` | `AbortController`、強制 Deadline、Encounter 単位の Cancel、Rules Fallback-once、Context が重ならない単一 Native Lane を所有する。 |
| `agent-model-live-outcome.ts` | 検証済み Evidence ID を既存の Bridge へ変換する。Wire v1 が表現できない Language-only は fail closed で `no-signal` にする。 |
| `PassportApp.tsx` | Lounge lifetime と Encounter Key を所有し、Exit / Expire / Unmount で Runner を Cancel する。Native Context を直接扱わない。 |

## Native Output Schema と Prompt 境界

Completion の `response_format` は `json_schema` と `strict: true` を指定し、次の 2 形だけを許す。

```json
{ "kind": "no-signal" }
```

```json
{ "kind": "bridge", "evidenceIds": ["topic:open-source"] }
```

両 Object は `additionalProperties: false` とし、`evidenceIds` は 1 件以上、入力から導出した最大件数以下、
重複なしにする。Grammar 制約だけは信頼せず、Completion Text を `JSON.parse` した後に Issue 16 の共通
Validator へ渡す。Model が入力外 Evidence、URL、Contact、Tool、自由記述 Claim を追加した場合は
**出力全体を破棄**し、Rules へ 1 回だけ切り替える。
許可 Evidence が 0 件なら Bridge 分岐自体を Schema へ含めず、`no-signal` Object だけを許す。空の
`enum` や `minItems > maxItems` を Native Grammar 変換へ渡さない。

System Message は固定文字列であり、Passport の値を連結しない。User Message は
`{ consentedPassports, allowedEvidence }` の JSON だけとする。Passport に命令らしい文字列が含まれても
System Instruction と同じ Message へ昇格しない。Native Log、Error Message、UI State に Passport、Prompt、
Model Output を保存しない。

## Context lifetime、Deadline、Cancel

Context は Encounter ごとに `initLlama` し、Completion の成功・失敗・Cancel の全経路で `release()` を
`finally` から 1 回呼ぶ。再利用 Context は KV Cache と参加者 Data の混線、長時間の Native Memory 保持を
招くため採用しない。

Runner は Provider に `AbortSignal` を渡す。Deadline 到達時は Timeout Outcome を先に確定して Signal を
Abort し、Lounge Exit / Expire / Unmount は Encounter Key を指定して同じ Signal を Abort する。Adapter は
Completion 中の Abort で `stopCompletion()` を 1 回だけ要求し、Completion が停止した後に Context を解放する。
初期化中に Abort された場合は、初期化が戻り次第 Completion を開始せず Context を解放する。期限後や
Cancel 後の遅延成功は Runner の Ledger と App の active Encounter guard の両方で破棄する。Deadline の
Rules Outcome は期限で確定し、Abort を無視する Native 実装で UI を永久待機させない。一方、Runner は
Provider の停止・解放が戻るまで Native Lane の所有権だけを保持する。Local Provider をこの単一 Lane へ
直列化し、前 Encounter の Context 解放前に次 Context を初期化しない。Lane 待機中の Encounter 自体も
自身の Deadline で Rules Outcome を返し、解放待ちの Context と重ねて Native 実行しない。

## Error 分類と Fallback

| 失敗 | Provider Failure | 動作 |
| --- | --- | --- |
| Runner Deadline | `TIMEOUT` 相当の `timeout` | Signal を Abort し、Rules へ 1 回切替。 |
| Lounge Exit / Expire / Unmount | `CANCELLED` | Native 停止・解放を待つ。App は遅延 Outcome を適用しない。 |
| Package / Model 読込、OOM、Model 不正、Native 例外、Release 失敗 | `LOAD_ERROR` | 内容を反射せず Rules へ 1 回切替。 |
| Completion Text / Result 形状 / JSON が不正 | `SCHEMA_ERROR` | 出力全体を破棄し Rules へ 1 回切替。 |

`AgentModelProviderError` 以外の未知例外は既存 Runtime と同じく `failed` へ進める。ただし Native Adapter は
Native 境界から出る未知値・例外を上表の型付き Failure へ変換し、Model Error で Lounge を停止させない。

## 代替案

### `App.tsx` で `llama.rn` を Top-level import する

採用しない。Web Export と Expo Go が Native module の初期化に巻き込まれる。Platform Composition Root と
関数内 dynamic import に分け、Web の module graph は `llama.rn` を参照しない。

### 1 つの Context を App 全体で再利用する

採用しない。Model Load は速くなるが、KV Cache に Encounter Data が残る危険、Exit 後も Native Memory を
保持する危険、どの Lounge が解放責任を持つか曖昧になる。Issue 17 は受け入れ条件どおり Completion / Unmount
ごとに Context を解放する。性能最適化を再検討する場合も、参加者 Data 分離と Memory 上限を先に証明する。

### Model に Bridge 文面を自由生成させ、禁止語 Filter を通す

採用しない。Unicode、別言語、暗黙の推定を Filter で列挙できない。Model は Evidence ID だけを選び、表示文は
信頼側の既存 Bridge constructor が作る。

### 既存 Owner Question 経路を削除して Local Model だけにする

採用しない。Local Model は任意機能であり、Model 未導入・保守的な `no-signal` でも bounded protocol を失っては
ならない。Provider が Bridge を返せばその結果を使い、`no-signal` なら既存 Rules / Owner Question 経路へ渡す。

## エッジケース

- Model Path が空なら Native module を読まず `rules` を使う。
- Expo Go は `expo` の実行環境判定で Model 設定の有無にかかわらず `rules` に固定する。
- Path が HTTP(S)、相対 Path、非 GGUF、NUL / Query / Fragment 付きなら設定 Error として Local Load 失敗へ
  正規化し、App 起動自体は壊さない。
- `n_ctx`、GPU Layer 数、最大生成 Token 数が有限整数でないか範囲外なら同様に Rules へ切り替える。
- Abort 前に Context が無い場合は、初期化完了直後に解放する。Completion 中は Stop を重複要求しない。
- `release()` が失敗しても成功扱いにしない。Context 解放不能を `LOAD_ERROR` として fail closed にする。
- JSON Schema に従って見える Text でも、入力外 Evidence が 1 件混ざれば部分採用せず全体を破棄する。
- Language Evidence だけの検証済み Bridge は Agent Model Contract 上は有効だが、既存 2 者間 Wire v1 の
  `MatchEvidence` が Language を表現できないため Live Outcome では `no-signal` にする。Wire Schema を
  暗黙に拡張しない。
- 同じ Encounter の二重 Tap は同じ Promise を返し、Context と Completion を 1 回だけ開始する。
- Cancel 済み Encounter の Context 解放中に別 Encounter が始まっても、次の Native 初期化は解放完了まで待つ。

## 検証

機械検証は Model 未設定、設定不正、Module Load 失敗、Model 初期化失敗、構造化成功、JSON 不正、入力外
Evidence、Timeout、Streaming Cancel、Release、二重実行、Web Export を日本語 BDD Test で固定する。

実機証跡は同一 GGUF / 設定について次を別々に記録する。

1. iPhone 実機を Airplane Mode にし、Development Build で `loading-local-model` → `local-model` → Bridge を
   完走する。
2. Android arm64 実機を Airplane Mode にし、同じ Flow を完走する。
3. 各端末で Model 未設定、Load 失敗、成功、Completion 中 Exit による Cancel / Release を確認する。
4. Build log、App Version、`llama.rn` Version、GGUF File 名・Digest、`n_ctx`、GPU Layer 数を残す。Passport、
   Prompt、Model Output は証跡へ残さない。

JavaScript Test、Web Export、Simulator、Emulator は Native link と物理端末の Offline 成功証拠を代替しない。
