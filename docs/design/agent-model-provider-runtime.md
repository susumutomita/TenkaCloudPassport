# Agent Model Provider Runtime の設計

本書は https://github.com/susumutomita/TenkaCloudPassport/issues/16 の設計正本とする。
Issue 13 で確立した
[Agent Model Provider Contract](./agent-model-provider-contract.md) を実行時境界まで完成させ、
Rules と将来の Local LLM が同じ Schema、Validator、Fallback、UI Status を使うようにする。
実際の `llama.rn` Adapter と GGUF 読込は Issue 17・18 の責務であり、本 Issue は具体的な
Model Package を import しない。

## 目的と完了境界

- Provider が選べる Output は、`no-signal` または既知の `evidenceIds` だけとする。
  URL、連絡先、Tool Call、外部 Action、人物特定、自由記述 Claim は Schema 上表現できない。
- Rules と Local Agent の Output は、同じ Runtime Validator を通った場合だけ
  `AgentModelDecision` へ昇格する。表示文は Model Output を採用せず、検証済み Evidence から
  Domain の固定 Renderer が再構築する。
- `TIMEOUT`、`CANCELLED`、`SCHEMA_ERROR`、`LOAD_ERROR` は型付き失敗として分類し、
  Encounter ごとに 1 回だけ Rules へ Fallback する。
- Local Model が無い Expo Go / Web / 初回設定では `rules` をデフォルト状態とし、Model 導入を
  Passport 作成や Encounter 完走の前提にしない。
- UI へ渡す状態は `rules | loading-local-model | local-model | falling-back | failed` の
  閉じた Union とし、Passport、Answer、Prompt、Model Output、内部 Error Message を含めない。

## データと責務の流れ

```text
consented Public Passport + consented Owner Answer + deadline + language
                              |
                              v
                     AgentModelProvider
                              |
                 no-signal | evidenceIds only
                              |
                              v
              validateAgentModelProviderOutput
                              |
               trusted AgentModelDecision renderer
                              |
                              v
   encounter-scoped runner (in-flight + settled ledger) / UI status
```

`AgentModelProvider` は Transport、Storage、React、Expo、Native Model Package を import しない。
`validateAgentModelProviderOutput` は入力から決定的 Evidence を再計算し、次をすべて満たす
Output だけを受理する。

1. Object の Field が `kind` と、Bridge の場合の `evidenceIds` だけである。
2. `evidenceIds` が 1 件以上で重複せず、入力から導出できる ID の部分集合である。
3. 未知 Field、未知 Evidence、空配列、過剰件数を拒否する。
4. Confidence、Reason、Opener は Provider から受け取らず、検証済み Evidence から再計算する。

Rules Provider も特別扱いせず、同じ Output Schema を返し、同じ Validator で
`AgentModelDecision` へ変換する。これにより TypeScript の型注釈だけでは防げない Native 境界の
不正値を、Rules と Local Agent の比較 Contract で同じように検出できる。

## Runtime State Machine

| 現在状態 | Event | 次状態 | 意味 |
| --- | --- | --- | --- |
| `rules` | `local-started` | `loading-local-model` | Local Model を選択し、読込または推論を開始した。 |
| `loading-local-model` | `local-succeeded` | `local-model` | 検証済み Local Output を採用した。 |
| `loading-local-model` | `local-failed` | `falling-back` | 型付き失敗を受け、Rules へ切り替える。 |
| `falling-back` | `fallback-succeeded` | `rules` | 検証済み Rules Output を 1 回だけ採用した。 |
| 任意 | `unexpected-failure` | `failed` | 型付きでない障害を握り潰さず停止した。 |
| 任意 | `reset` | `rules` | 新しい Encounter の初期状態へ戻る。 |

State は Status と、必要な場合でも内容を持たない `ProviderSwitchReason` だけを保持する。
`createAgentProviderSessionRunner()` が Encounter 単位の実行所有者となり、確定済み Outcome の
Ledger と実行中 Promise の Map を同じ Closure で管理する。同じ Encounter Key が同時に呼ばれた
場合は Map への登録を `await` だけでなく Status Callback と Provider 開始より前に完了し、
2 回目へ同じ Promise を返す。実行本体は登録後の Microtask で開始するため、`onStateChange` からの
同期再入も去重をすり抜けない。完了後の Retry は Ledger の Outcome を返す。この二段階の去重に
より、二重 Tap、Callback 再入、Retry、遅延成功のいずれでも Provider を再実行しない。Promise の去重だけでは
同じ Promise への複数 Handler 登録を防げないため、呼び出し側も同期的な結果適用 Gate を Provider 呼出し前に
取得し、最初の Settlement だけが結果を適用する。確定時 Clock で Lounge 満了を先に評価し、満了済みなら
Bridge、Owner Question、Pilot Outcome を作らない。Local Provider は単一 Native Lane へ直列化し、異なる Encounter Key でも前 Context の
停止・解放が完了するまで次の Native Context を開始しない。Ledger は各 Outcome を完了時の最新 Map へ
merge し、待機中だった片方の結果で他方を失わない。Lounge 終端の `forget(encounterKey)` は in-flight を
Cancel し、確定 Ledger を削除し、遅延 finalizer の再登録権限も破棄する。

Local Provider は信頼境界なので、自発的に `TIMEOUT` を返すことを前提にしない。Runner は
注入した wall clock と `deadlineAtWallClockMs` の差を上限とする Timer で `AbortSignal` を通知し、期限到達を
内容のない `timeout` Failure へ変換して Rules Outcome を期限で確定する。Provider 完了後にも clock を再検査し、
Event Loop 遅延で Timer より先に届いた期限後成功を採用しない。明示 Cancel は Signal 自体を race 対象にして
Abort を無視する Provider でも `cancelled` を確定する。Local Provider は Abort を受けたら Native
停止と Resource 解放を完了して Promise を settle する。Runner は user-facing Outcome とは別にその teardown
まで Native Lane を保持し、Abort を無視する Provider でも次の Context を重ねない。`release()` が reject した
場合は Context 消滅を証明できないため Lane を Process 再起動まで quarantine する。共有 Context lease registry
も Process 内で同時に 1 本だけを許し、Runner が remount 相当で作り直されても quarantine 中の再取得を拒否する。Lane 待機自体も各 Input
の Deadline で打ち切って Rules Outcome を返す。Timer は完了時に必ず解除し、期限後の成功値は採用しない。

Outcome は確定時の `providerKind` も保持するため、再実行時に呼び出し側が別 Provider を渡しても、
UI Status を新しい Provider へ誤表示せず最初の確定元を復元する。
Lounge Exit / Expire / Diagnostics 破棄後の呼び出し側は State と Encounter Key を破棄し、Runner も
同じ Key を Forget するため、遅延結果を新しい Lounge へ持ち越さない。

## 代替案

### Model の自由記述を禁止語 Filter で検査する

採用しない。禁止語の表記揺れ、別言語、Unicode、暗黙の人物推定を列挙できず、Filter を
すり抜けた文を Evidence 付き Claim と誤認する。Provider は Evidence ID だけを選び、表示文は
Domain が固定生成する設計なら、禁止対象を Schema から除外できる。

### Rules だけ Validator を省略する

採用しない。Rules と Local Agent で実行経路が分岐し、Golden Contract が同じ Schema を
検証しなくなる。Rules の実装バグも Native Output と同じ境界で fail closed に扱う。

### Local Model 未導入を `failed` とする

採用しない。Model は任意の補助機能であり、初回設定や Offline Encounter を妨げてはならない。
未導入は正常な `rules` 状態であり、`failed` は型付きで分類できない Runtime 障害だけに使う。

## エッジケースと検証

- Local Provider が未知 Field、空 Evidence、重複 Evidence、入力に無い Evidence を返す場合は
  `SCHEMA_ERROR` とし、内容を UI や Log へ反射せず Rules へ 1 回だけ切り替える。
- Local Provider が URL、Tool、Contact 等の Field を追加しても Strict Schema が拒否する。
- `no-signal` は Evidence が存在していても許可する。捏造より保守的な終了を優先する。
- 型付き 4 失敗は同じ State Transition を通る。未知例外は Fallback 対象にせず `failed` へ進み、
  呼び出し元へ再送出する。
- Provider が完了しない場合も期限到達で `timeout` へ分類して Rules へ切り替える。期限後に
  Provider が遅延完了しても、同じ Encounter の Outcome と Status は変えない。
- 同じ Encounter を同時に 2 回開始しても共有中の Promise を返し、Provider 呼び出しと Outcome は
  それぞれ 1 回だけになる。
- `loading-local-model` の同期 Status Callback から同じ Encounter を再入実行しても、登録済みの
  Promise を返し、Provider を二重起動しない。
- Contract Test と State Transition Test は Network、Transport、Storage、Model Package を使わない
  Pure TypeScript とし、Airplane Mode / Network Permission 無しでも同一結果になる。
- UI mapper の全出力について、Passport 本文、Answer、Prompt、Model Output、内部 Error 名を
  含まないことを日本語 BDD Test で固定する。

## 人間検証

Issue 17 で Expo Go / Web の Model 未導入状態、Development Build の Native Adapter、Deadline /
Lounge Exit / Expire / Unmount の Cancel、Context Release を実行経路へ接続した。Model 未設定、Load
失敗、構造化成功、Streaming Cancel は統合 Test を証拠とする。`loading-local-model` / `local-model` の
実表示と Airplane Mode の Offline Bridge 成功は iPhone / Android arm64 物理端末の証跡対象とする。
