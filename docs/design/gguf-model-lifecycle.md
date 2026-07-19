# GGUF Import・Resource Guard・Benchmark の設計

本書は [Issue 18](https://github.com/susumutomita/TenkaCloudPassport/issues/18) の設計を定める。
[llama.rn Provider と Development Build 統合](./llama-provider-development-build.md) が Model Context の
実行境界を所有し、本書は Owner が選んだ GGUF をアプリ専用領域へ取り込み、Load 前に互換性と資源 Risk を
判定し、明示的に Unload / Delete できるまでのライフサイクルを所有する。

## 目的と対象範囲

- OS Document Picker で選んだ `.gguf` の Size を、アプリ専用領域へ Copy する前に表示する。
- Owner の確定後だけ、GGUF を private document directory へ Copy する。自動 Download と Model 同梱は行わない。
- Copy 後の File を chunked SHA-256、Size、`loadLlamaModelInfo` の最小 Metadata で検証する。
- Device Memory と Model Size から `supported | caution | blocked` を決定し、根拠を Owner へ表示する。
- Import、Load、First Token、Completion、Peak Process Memory、Thermal State、Battery Delta を内容非保持の
  Local Benchmark Report に記録する。
- Context を止めて解放してから Model を Unload / Delete し、File と Manifest の不整合を残さない。

Model の入手元評価、Model Weight の配布、Cloud 推論、学習、Benchmark の Upload、端末間同期は対象外とする。
SHA-256 は同じ byte 列の継続性を確認する識別子であり、安全性、品質、出所を証明しない。

## データの流れと責務

```text
Settings / Model Management Screen
  -> OS Document Picker（選択だけ。自動 cache copy なし）
  -> Candidate（name / uri / size、メモリだけ）
  -> Owner が Size と保存容量を確認して Import を確定
  -> Expo FileSystem Adapter
     -> private models/.incoming.gguf へ Copy
     -> copied size を再確認
     -> FileHandle で chunked SHA-256
  -> llama.rn loadLlamaModelInfo（Context 初期化前の GGUF parse）
  -> Metadata allowlist（architecture / context length / file type）
  -> Resource Risk Calculator
  -> private models/<sha256>.gguf へ rename
  -> strict versioned manifest を atomic replace
  -> supported: activate / caution: 再確認後だけ activate / blocked: activate 不可
  -> active LocalModelConfiguration を Issue 17 Provider Factory へ渡す
```

| 境界 | 責務 |
| --- | --- |
| `model-lifecycle.ts` | Candidate、Manifest、Metadata、Risk、型付き Error、Import / Activate / Unload / Delete の順序を所有する。Expo / React を import しない。 |
| `sha256.ts` | 1 MiB 以下の chunk を逐次取り込む SHA-256 を所有し、Model 全体を JavaScript memory へ展開しない。 |
| `expo-model-file-store.native.ts` | Document Picker、private directory、空き容量、copy / rename / atomic manifest、FileHandle を所有する。 |
| `llama-model-inspector.native.ts` | `loadLlamaModelInfo` の dynamic import と外部値の allowlist projection を所有する。Context は作らない。 |
| `modules/device-resource-telemetry` | process RSS、physical memory、thermal state、battery level だけを返す。端末名、ID、network、位置情報を取得しない。 |
| `model-benchmark.ts` | duration と内容を持たない resource sample を集約する。Passport、Prompt、Answer、Bridge、Model Output を受け取らない。 |
| `use-local-model-management.ts` | UI の loading / candidate / error / imported / caution-confirmation 状態と Owner 操作を所有する。 |
| `SettingsScreen.tsx` | Size、Metadata、Risk 根拠、Benchmark、Unload / Delete の明示操作を表示する。File URI は表示しない。 |
| `agent-provider-session.ts` | 実行中の全 Context を Abort し、UI の Encounter key に依存せず Native teardown 完了を待つ `cancelAllAndWait` を所有する。 |

## Versioned private manifest

Manifest はアプリ専用領域だけに保存し、外部入力と同じ strict parser を通す。

```ts
interface LocalModelManifestV1 {
  readonly schemaVersion: 1;
  readonly activeModelSha256: string | null;
  readonly models: readonly ImportedLocalModel[];
  readonly benchmarkReports: readonly LocalModelBenchmarkReport[];
}
```

`ImportedLocalModel` は SHA-256、byte size、bounded original filename、private URI、Imported At、Architecture、
Context Length、GGUF File Type、Risk snapshot、実行設定を持つ。Raw GGUF Metadata は保存しない。
`LocalModelBenchmarkReport` は Model SHA-256、計測時刻、Import / Load / First Token / Total Completion の ms、
Peak Process Memory、開始 / 終了 Thermal State、Battery Delta、成功種別だけを持つ。Passport、Prompt、Answer、
Bridge、Model Output、Error 本文、端末 ID、端末名、File URI は Schema に存在しない。Report はバックアップと Git の
対象外とする。

Manifest は一時 File へ完全な JSON を書き、旧 Manifest を置換する。Parse または rename 前の write が失敗した
場合は旧 Manifest を維持する。rename 反映後に失敗が返る曖昧な結果では確定 File を先に削除せず、manifest cache を
破棄する。次回 load が永続 Manifest を正本として、参照済み File は保持し、未参照 File は削除する。未知 Version、
未知 Field、重複 SHA-256、重複 File 名、不正 URI、参照先 File の欠落を全体の型付き失敗にする。

## Import の transaction

1. Picker は `copyToCacheDirectory: false`、単一選択で開く。Cancel は `IMPORT_CANCELLED` で終了する。
2. `.gguf` 以外、Size 不明、0 byte、不正 File Name、既存と同名を Copy 前に拒否する。
3. 空き容量が `selected size + 64 MiB` 未満なら `INSUFFICIENT_STORAGE` とし、Copy を開始しない。
4. Candidate の Name / Size と Copy 前の端末空き容量 snapshot を画面に出し、Owner の Import 確定を待つ。URI は
   表示・ログ保存しない。確定時にも空き容量を再取得し、古い snapshot を安全判断には使わない。
   実行中 Provider があれば、現在の判定を終了する別の確認を得て全 Native teardown を待つ。その後、Context 取得と
   Model file / Manifest mutation に共通する process-wide lease を取得し、Copy 開始から最終 refresh まで保持する。
5. `.incoming.gguf` への Copy 自体を 1 MiB chunk にし、各 chunk 前に Abort、選択時の申告 Size 上限、64 MiB reserve を
   再検査する。各 chunk 後は macrotask へ制御を返し、Settings の Cancel / unmount Event を次の read 前に処理できるようにする。
   Source が申告 Size を超えた、空き容量が reserve を割った、または Abort された場合は partial incoming を削除する。
   Copy 後 Size も選択時 Size と一致しなければ `COPY_INCOMPLETE` にする。
6. 1 MiB chunk で SHA-256 を計算し、各 chunk 後に macrotask へ制御を返す。Read permission 失効は `SOURCE_UNREADABLE`、途中中断は
   `IMPORT_CANCELLED` とし、incoming File を削除する。
7. `loadLlamaModelInfo` が GGUF を読めない、Architecture / Context Length が欠ける、Context Length がデフォルトの 2,048 未満なら
   `INVALID_GGUF` または `INCOMPATIBLE_MODEL` とし、incoming File を削除する。
8. Risk を評価し、SHA-256 を File 名にした最終 Path へ rename してから Manifest を atomic replace する。
9. Manifest 保存または rename 後の Cancel が発生した場合は manifest cache を破棄する。次回 load は永続 Manifest と
   最終 File を照合し、commit 前なら File を削除し、commit 後なら record と File を保持する。incoming cleanup が
   失敗した場合も cache を破棄する。Hook は元の型付き失敗を保持したまま即時 load を best effort で行い、それも
   失敗した場合は次回 load / restart で reconcile を再試行する。成功応答後だけ Imported と表示する。

Crash 後に残った `.incoming.gguf` は次回 Manifest load 時に削除する。既存 Model と同じ SHA-256 または同名 File は
暗黙に再利用・上書きせず、`DUPLICATE_MODEL` / `NAME_CONFLICT` とする。

## Resource Risk

デフォルト Context は 2,048 token とし、推定 working set を次で求める。

```text
estimatedWorkingSetBytes = ceil(modelSizeBytes * 1.20) + nCtx * 256 KiB
effectiveMemoryBytes = 取得できた physical memory と process limit の小さい方
ratio = estimatedWorkingSetBytes / effectiveMemoryBytes
```

- `supported`: Memory 情報と互換 Metadata があり、`ratio <= 0.45` である。
- `caution`: `0.45 < ratio <= 0.60` である。推定値と「OS / 他 App / GPU と共有するため保証ではない」旨を表示し、
  Owner のその場の明示確認後だけ activate する。
- `blocked`: `ratio > 0.60`、Memory 情報不明、Architecture / Context 不適合、または Load 開始時の Thermal State が
  `serious | critical` である。Context を初期化しない。

Risk は Model の parameter class 名で例外扱いせず byte size と端末情報から毎回再評価する。Activate の直前に inactive
Model も Size と SHA-256 を再検証し、同じ Size の改変も `MODEL_INTEGRITY_FAILED` で拒否する。Import 済み File は
blocked でも Owner が削除でき、再評価操作で端末状態が改善した場合だけ activate できる。Caution confirmation は
Model Digest と現在の Risk snapshot に結び付け、Size、Memory、Context 設定が変われば再確認する。

iOS は public API から physical memory と process RSS を取得し、取得できない process hard limit を推測値で補わない。
Android は total memory、available memory と process RSS から現在時点の process ceiling を保守的に求める。Native
Telemetry の呼出し失敗や未知値は全項目 unavailable として扱い、Risk を `blocked` にする。これらは将来の OS kill を
保証する値ではないため、物理端末の Peak Memory / Thermal 証跡なしに閾値を緩和しない。

## Benchmark と Provider 統合

Benchmark recorder は高負荷処理の開始前に Battery / Thermal / Process RSS を取得し、Load と Completion 中は
200 ms 間隔で Process RSS の最大値だけを保持する。`initLlama` 完了を Load、最初の token callback を First Token、
構造化 Completion の resolve を Total Completion とする。実行中の sample 完了を待ってから sampler を停止し、終了 Battery /
Thermal を取得する。Battery が取得できない場合は `null` とし、`0` と偽装しない。

Recorder API は時刻、resource sample、Model Digest、成功種別だけを受け取り、推論 Input / Output 型を引数に持たない。
Report 保存失敗は推論結果を破棄しないが、画面に内容非保持の `BENCHMARK_WRITE_FAILED` を表示する。Benchmark 自体を
network へ送信する Port は作らない。Native Context の `release()` 完了を Provider teardown の確定点とし、終了 sample と
Report 保存はその確定を待たせない best-effort の後処理にする。Report 保存は Manifest mutation lane に直列化するが、
Unload / Delete が teardown を待ちながら同じ lane を保持する循環待ちを作ってはならない。Delete と競合して対象 Model が
先に消えた場合は Report を復活させず、内容非保持の保存失敗として扱う。

Settings は直近 Import と直近 Completion を分けて選び、Import / Load / First Token / Total Completion、Peak Process
Memory、開始 / 終了 Thermal、Battery Delta、成功種別を内容非保持の Report として表示する。

App 起動時は active Manifest を strict parse し、File Size と SHA-256 を再検証してから Provider を構成する。
Manifest 不正、File 欠落、Digest 不一致、現在の Risk blocked は Rules Provider に戻し、active 選択を解除する。
環境変数による Issue 17 の開発者設定は、managed active model が無い場合だけ利用する。
この初回 load / reconcile / hash は Import や reload と同じ単一 operation lane と process-wide mutation lease に入れる。
完了するまで Model 管理を busy とし、Settings の自動 reload と Lounge の Provider 開始を受け付けない。実行中
Provider がある状態で Settings を開いた場合も自動 reload を開始せず、通常の Context lease 競合を quarantine や
再起動必須 Error として表示しない。Timeout / fallback の Outcome が先に確定した場合は Rules 結果を直ちに適用しつつ、
Native teardown の drain 完了まで同じ pending 状態を保ち、候補選択を含む Model Storage 読込を開始しない。

## Unload と Delete

- Unload は実行中 Provider がある場合だけ Owner へ影響を説明して確認を求め、確認後に Provider を Abort して
  `stopCompletion()` と `release()` の teardown 完了を待つ。Lounge ID と Encounter key は破棄しない。
- teardown 待機では遅延 Provider Result の適用権限だけを破棄する。Model 管理操作の後も同じ Active Lounge で
  Rules または再構成した Local Provider を開始できるよう、Encounter key 自体は保持する。
- teardown 完了後に active digest を Manifest から外し、Rules Provider へ切り替える。Model File は残す。
- Delete は active Model の teardown 後、File を `<digest>.deleting.gguf` へ stage し、Manifest から Model と Report を
  atomic に外してから staged File を削除する。
- stage が失敗した場合は record を残して `DELETE_FAILED` にする。Manifest 更新が失敗した場合は staged File を元へ
  戻す。復元や最終削除が失敗した場合は manifest cache を破棄し、次回 load で Manifest を正本に restore / delete する。
- 実行中 Provider に影響する Import / Activate / Caution 再確認 / Unload / Delete は、現在の判定を終了する明示確認なしでは
  実行しない。Caution の Resource Risk 確認はこの Provider 終了確認を兼ねない。
- Provider 終了確認待ちの Import は、要求時に固定した候補を対象とする。ただし Owner が候補を変更・取消した時点で
  古い保留 intent を失効させ、表示候補と実行対象が分離したまま確認できる状態を作らない。
- Model mutation lane と process-wide lease が Import / Activate / Unload / Delete の最終 refresh まで開始禁止を同期保持する。Native teardown 完了だけで
  禁止を解除せず、Settings の Back も mutation 中は無効にするため、旧 Provider が Manifest 更新や staged delete と競合しない。
- Diagnostics の Preview は Manifest の最大 8 Model を実件数で扱う。Model 削除と全削除の commit 後 recovery は
  Manifest を信用せず、排他的 Context lease 内で `manifest.v1.json`、temp、incoming、64 桁 digest の Model、staged
  deleting という exact managed filename だけを purge し、残存 0 を再列挙で確認してから tombstone を消す。壊れた
  Manifest、Manifest 欠落と managed payload 残存、記録済み File 欠落では exact filename の件数と byte 数を
  Manifest 非依存で Preview し、tombstone 前から Owner の削除操作へ到達できるようにする。GGUF payload が 0 件でも
  `manifest.v1.json` またはその temp が残れば、Manifest load が空で成功する場合も managed store を削除対象として
  表示するが、Model 件数には加算しない。
  残存 GGUF の削除を妨げず、未知 filename は消さない。
  `NoLocalModelStorageAdapter` は Web / Expo Go だけに限定する。

## 代替案

### Picker のデフォルト cache copy を使う

採用しない。大きな GGUF は選択しただけで cache へ Copy され、Owner が Size を確認して中止する前に I/O と空き容量を
消費する。Picker は参照だけを受け取り、Owner 確定後に private models directory へ 1 回 Copy する。

### File 全体を `arrayBuffer()` にして Web Crypto で SHA-256 を計算する

採用しない。4B / 8B class の File と同程度の JavaScript memory を追加確保し、検証自体が OOM の原因になる。
FileHandle と incremental SHA-256 で bounded memory にする。

### Model 名や parameter class の allowlist で supported を決める

採用しない。同名でも量子化と File Size が異なり、新しい Architecture を不必要に固定する。Native parser が返す
Architecture / Context compatibility と、実 File Size / Device Memory の保守的な比率で判断する。

### SHA-256 が一致した Model を安全と表示する

採用しない。Digest は byte 同一性しか示さず、出所、脆弱性、モデル品質を証明しない。UI でも「整合性確認」と
「安全性」を分離して説明する。

## 物理端末の完了ゲート

JavaScript Test、Web Export、Simulator / Emulator は次の証跡を代替しない。

1. 4B / 8B の異なる 2 Model を、物理 iPhone と Android arm64 の各 1 台以上で Import する。
2. 各組合せで Size preflight、SHA-256、Metadata、Risk、Load、First Token、Completion、Unload、Delete を記録する。
3. Airplane Mode で完走し、Report に Passport、Prompt、Answer、Bridge、File URI、端末 ID が無いことを確認する。
4. blocked は Context 初期化 0 回、caution は確認前 0 回 / 確認後 1 回であることを確認する。
5. Delete 後に Native Context と private Model File が残らないことを確認する。

### Compatibility Matrix

| Model | iPhone 実機 | Android arm64 実機 |
| --- | --- | --- |
| 4B class | 未実施。物理端末、GGUF、Build 証跡が必要である。 | 未実施。物理端末、GGUF、Build 証跡が必要である。 |
| 8B class | 未実施。物理端末、GGUF、Build 証跡が必要である。 | 未実施。物理端末、GGUF、Build 証跡が必要である。 |

各セルには App / OS / `llama.rn` Version、Model File 名と SHA-256、Size、Architecture、Context、Risk 根拠、Import /
Load / First Token / Completion / Peak Memory / Thermal / Battery、Airplane Mode、Unload / Delete 後の残存確認を記録する。
Passport、Prompt、Answer、Bridge、Model Output、File URI、端末 ID は記録しない。
