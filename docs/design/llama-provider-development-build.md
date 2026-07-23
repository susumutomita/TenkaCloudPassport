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
- `model-safety-boundary.ts` が同意済み Public Passport から canonical Evidence だけを投影し、固定 System
  Instruction と bounded な信頼できない Evidence JSON を別 Message にする。Native Adapter へ Passport の
  自由記述を渡さない。
- Model 未設定、Load 失敗、OOM、Model 不正、JSON 不正、Native 例外、Timeout、Cancel を既存の型付き
  Failure と Rules Fallback-once へ接続する。
- Lounge の Exit / Expire、Diagnostics 破棄、画面 Unmount で実行中 Completion を Cancel し、Context 解放を
  1 回だけ要求する。解放を証明できない場合は再利用せず quarantine する。

Model Weight の同梱・自動 Download、Document Picker と Private Sandbox への取込、Model Digest、
Benchmark と端末別 Resource Guard は Issue 18 の責務とする。Cloud API、Tool Call、Vision、Audio、
Background 推論も対象外とする。

Issue 18 の managed Model が有効な場合は、その strict Manifest から再検証した `LocalModelConfiguration` を
Provider へ渡す。managed Model が無い場合だけ本書の Development Build 環境変数を開発者向け fallback として
使う。Import、Risk、Benchmark、Unload / Delete の正本は
[GGUF Import・Resource Guard・Benchmark の設計](./gguf-model-lifecycle.md) とする。

## データの流れと責務

```text
PassportApp（Encounter Key と Lounge lifetime を所有）
  -> createAgentProviderSessionRunner（deadline / cancel / fallback-once / idempotency）
    -> model-safety-boundary（canonical Evidence request / strict schema / Local capability factory）
      -> llama LocalModelCompletionPort（Development Build のみ）
        -> 共有 LocalModelContextLeaseRegistry を acquire
        -> LocalModelConfiguration（GGUF Path / n_ctx / GPU layers / n_predict）
        -> lazy import('llama.rn')
        -> initLlama（1 Encounter に 1 Context）
        -> completion
         system message: 固定命令
         user message: 許可済み canonical Evidence だけの bounded JSON
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
| `model-safety-boundary.ts` | Public Passport を strict 検証し、自由記述を除いた canonical Evidence request、固定 System Message、strict JSON Schema、空 Tool 定義を唯一の Local Provider factory として作る。 |
| `llama-agent-model-provider.ts` | Safety Boundary の request、`AbortSignal`、共有 Context lease だけを受ける Native Completion Port、JSON parse、Error 分類、Stop / Release を所有する。`AgentModelProvider` を直接実装せず、React と Expo を import しない。 |
| `llama-module-loader.native.ts` | `llama.rn` を関数内でだけ動的 import する。Web / Expo Go の module 初期化経路から分離する。 |
| `default-agent-model-provider.*.ts` | Platform と設定の Composition Root。Web / Default / Expo Go は常に Rules、Development Build は Model Path がある場合だけ Local を選ぶ。`EXPO_PUBLIC_*` は Expo の inline 契約どおり直接プロパティ参照する。 |
| `agent-provider-session.ts` | `AbortController`、強制 Deadline、Encounter 単位の Cancel / Forget、Rules Fallback-once、Context が重ならない単一 Native Lane と App 側の結果適用 Gate を所有する。確定 Outcome は Lounge 終端で削除し、遅延完了に再登録させない。 |
| `agent-model-live-outcome.ts` | 検証済み Evidence ID を既存の Bridge へ変換する。Wire v1 が表現できない Language-only は fail closed で `no-signal` にする。 |
| `PassportApp.tsx` | Lounge lifetime と Encounter Key を所有し、開始要求と結果適用を同期 Gate で各 1 回に限定する。結果確定時の Clock で Lounge 満了を先に評価し、Exit / Expire / Diagnostics 破棄 / Unmount で Runner を Forget する。Native Context を直接扱わない。 |

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

System Message は固定文字列であり、Passport の値を連結しない。User Message は schema version、operation、
language、canonical Evidence option だけを持つ bounded JSON とする。Pet Name、Owner Alias、Owner Answer の
自由記述は Native Adapter の request 型で表現できない。Native Log、Error Message、UI State に Passport、
Prompt、Model Output を保存しない。

## Context lifetime、Deadline、Cancel

Context は Encounter ごとに `initLlama` し、Completion の成功・失敗・Cancel の全経路で `release()` を
1 回呼ぶ。共有 Context lease registry は Process 内で同時に 1 本だけ Model Context lease を許し、App remount
相当で Runner が作り直されても active lease 中の再取得を拒否する。Lease は `initLlama` 前に取得し、
`release()` 成功後だけ解放する。`release()` が reject した場合は Context 解放を証明できないため lease と
Native Lane を Process 再起動まで保持し、Model 削除と別 Runner からの次 Context の両方を fail closed で止める。
再利用 Context は KV Cache と参加者 Data の混線、長時間の Native Memory 保持を招くため採用しない。

Runner は Provider に `AbortSignal` を渡す。Deadline 到達時は Timeout Outcome を先に確定して Signal を
Abort し、Lounge Exit / Expire / Diagnostics 破棄 / Unmount は Encounter Key を指定して同じ Signal を
Abort する。Provider が Abort を無視しても、Signal 自体を race 対象にして `cancelled` Outcome を確定する。
Adapter は
Completion 中の Abort で `stopCompletion()` を 1 回だけ要求し、Completion が停止した後に Context を解放する。
初期化中に Abort された場合は、初期化が戻り次第 Completion を開始せず Context を解放する。期限後や
Cancel 後の遅延成功は Runner の Forget と App の active Encounter guard の両方で破棄する。Provider 成功後も
壁時計を再検査し、Event Loop 遅延で Deadline を越えた成功を採用しない。Deadline の
Rules Outcome は期限で確定し、Abort を無視する Native 実装で UI を永久待機させない。一方、Runner は
Provider の停止・解放が戻るまで Native Lane の所有権だけを保持する。Local Provider をこの単一 Lane へ
直列化し、前 Encounter の Context 解放前に次 Context を初期化しない。Lane 待機中の Encounter 自体も
自身の Deadline で Rules Outcome を返し、解放待ちの Context と重ねて Native 実行しない。
同じ Promise を返す Runner の去重だけでは、二重 Tap が同じ Promise へ複数の結果 Handler を登録することを
防げない。PassportApp は同期的な結果適用 Gate を Provider 呼出し前に取得し、最初の Settlement だけが Gate を
消費する。実行中は開始 Button も disabled にする。確定結果を適用する直前に確定時 Clock で Lounge を advance
し、満了済みなら Bridge、Owner Question、Pilot Outcome を一切作らず `expired` へ収束する。

## Error 分類と Fallback

| 失敗 | Provider Failure | 動作 |
| --- | --- | --- |
| Runner Deadline | `TIMEOUT` 相当の `timeout` | Signal を Abort し、Rules へ 1 回切替。 |
| Lounge Exit / Expire / Unmount | `CANCELLED` | Native 停止・解放を待つ。App は遅延 Outcome を適用しない。 |
| Package / Model 読込、OOM、Model 不正、Native 例外 | `LOAD_ERROR` | 内容を反射せず Rules へ 1 回切替。Context が無いか解放済みなら Lane を再利用する。 |
| `release()` 失敗 | `LOAD_ERROR` + quarantine | Rules へ 1 回切替え、共有 lease と Native Lane は Process 再起動まで保持する。 |
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
- `release()` が失敗しても成功扱いにしない。Context 解放不能を `LOAD_ERROR` として返し、共有 lease と
  Native Lane を Process 再起動まで quarantine する。
- JSON Schema に従って見える Text でも、入力外 Evidence が 1 件混ざれば部分採用せず全体を破棄する。
- Language Evidence だけの検証済み Bridge は Agent Model Contract 上は有効だが、既存 2 者間 Wire v1 の
  `MatchEvidence` が Language を表現できないため Live Outcome では `no-signal` にする。Wire Schema を
  暗黙に拡張しない。
- 同じ Encounter の二重 Tap は同じ Promise を返し、Context と Completion を 1 回だけ開始する。
- Cancel 済み Encounter の Context 解放中に別 Encounter が始まっても、次の Native 初期化は解放完了まで待つ。
- Lounge 終端は Runner の Outcome / Evidence / Lounge ID を Forget し、終了後の遅延 finalizer に再登録させない。

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

### memory entitlement（`extended-virtual-addressing` / `increased-memory-limit`）の production 復元

Issue 104 / ADR-0037（Bonsai-ready 化）で `app.json` の `llama.rn` plugin
`entitlementsProfile` を `["development"]` から `["preview", "production"]` へ
戻した（follow-up `01KY4W8FE17WMR049WB3VW8T2M`）。これにより署名済み IPA にも
`com.apple.developer.kernel.extended-virtual-addressing` と
`com.apple.developer.kernel.increased-memory-limit` が入る前提になる。

コード側の設定変更だけでは有効化されない。owner が実施する前提条件と検証手順は
次のとおり。

1. Apple Developer Portal の対象 App ID で Increased Memory Limit capability を
   有効化する（Extended Virtual Addressing は capability 一覧に現れず、
   entitlement 自体の申請だけで済む場合がある。実際に必要な手続きは Xcode /
   Apple Developer Portal の当時の UI に従う）。
2. EAS Build で production profile の署名済み IPA を作成し、Provisioning
   Profile に entitlement が反映されていることを `codesign -d --entitlements`
   等で確認する。
3. TestFlight へ提出し、審査（Beta App Review）を通過することを確認する
  （production entitlement を development 限定に絞った経緯そのものが、過去に
   この審査で問題になった可能性を示唆するため、再度慎重に確認する）。
4. 通過後、実機（iPhone 15 Pro 以降を推奨）の TestFlight ビルドで、上記の
   物理端末実機証跡（`loading-local-model` → `local-model` → Bridge 完走）を
   development build のときと同じ手順で取り直す。

この 4 手順は本 Repo のコード・CI では検証できない owner 実機ゲートであり、
`make before-commit` の対象にしない。
