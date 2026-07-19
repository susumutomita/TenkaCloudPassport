# 端末内診断と全削除の設計

## 目的と境界

利用者が「なぜ動かないか」と「端末内に何件あるか」を端末だけで確認し、明示操作で Sanitized Report を
共有または Local Data を削除できるようにする。Cloud Telemetry、Remote Log、Analytics、外部推論、
自動 Upload は追加しない。OS Log に禁止情報が残らないことは Pure TypeScript Test で代替せず、実機の
Release Gate として残す。

## 比較した案

1. **各保存先を順番に削除する**: 実装は短いが、中断後に未削除 Data が復元されるため不採用。
2. **削除前 Snapshot を保存し、失敗時に rollback する**: Atomic に見えるが秘密の複製と保持時間を増やす
   ため不採用。
3. **write-ahead tombstone と冪等削除**: 削除意思を先に commit し、中断後も安全側へ収束するため採用。

判断の正本は [ADR-0020](../adr/0020-local-diagnostics-and-erasure-transaction.md) とする。

## Diagnostic Report allowlist

Report Schema Version 1 は次の field だけを持つ。`additionalProperties` 相当はすべて拒否する。

| 区分 | 許可 field | 値 |
| --- | --- | --- |
| version | `app`、`protocol`、`profileSchema`、`reportSchema` | bounded string / integer |
| provider | `status` | `rules`、`loading-local-model`、`local-model`、`falling-back`、`failed` |
| model | `architecture`、`sizeBytes`、`digestPrefix` | allowlist architecture、非負整数、digest 先頭 8 桁だけ |
| transport | `state`、`peerCount`、`permission` | 閉じた状態、0〜6、Camera Permission の閉じた状態 |
| error | `code`、`phase` | 閉じた固定値。本文と `cause` は含めない |
| storage | `profileCount`、`settingsCount`、`backupCacheCount`、`modelCount`、`totalBytes` | 非負整数 |

Report は生成日時を持たない。Lounge / Participant / Device ID、Passport / Answer / Bridge / Prompt /
Output、Model File Name / Full Path、IP / SSID / 位置 / 連絡先、Token / Key / Secret を型と schema の両方で
表現できなくする。JSON Preview を表示してから、Owner が Share Button を押した 1 回だけ Share Port を
呼ぶ。

## Data Control Port

`LocalDataControl` は Profile Resource、Model Resource、Deletion Journal を合成する。`preview()` は件数と
Byte 数だけを返す。個別操作は `resetPassport()` と `removeModel()` に分ける。Settings と Backup Cache は
現在永続保存しないため件数 0 であり、将来保存を追加する変更が同じ Port と test を拡張する。

全削除の順序は次のとおりとする。

1. Profile write と Model Context が参加する共有 lease を排他取得し、全 Resource を inspect する。
   既存 write / Context があれば何も変更せず拒否し、排他取得後の新規 write / Context も拒否する。
2. 固定 tombstone を永続化する。ここを論理 commit とする。書込 API が失敗を返しても marker を再読込し、
   存在すれば未 commit と誤判定せず削除を続行する。存在を判定できない場合は commit 済みと断定せず、
   現 Process の Data を保持した失敗とする。後で marker を読めた場合は保存を閉じ、起動回復へ渡す。
3. Profile、Model、将来の Settings / Backup Cache を冪等に削除する。
4. 全 Resource の件数 0 を再確認する。
5. tombstone を削除する。

Profile save と Backup import は Composition Root で共有 lease に接続した Profile Storage を必ず使う。
UI でも書込中の Settings / Diagnostic 遷移と削除中の Back を無効化するが、画面状態だけを排他の根拠に
しない。tombstone が残る commit 後中断では排他 lease を保持し、同じ Process の回復または再起動時の
回復が完了するまで Profile write と Model Context 取得を拒否する。fresh process の Model lease registry
も recovery-locked で開始し、marker 不在または削除完了を確認した後だけ Context 取得を解放する。
Development Build の `llama.rn` Completion Port も同じ registry を Composition Root から受け取り、
`initLlama` 前から `context.release()` 成功まで lease を保持する。Release が reject した場合は Context 消滅を
証明できないため lease を保持し、`MODEL_IN_USE` として削除を拒否したまま Process 再起動を Recovery とする。
Registry は Process 内で Model Context lease を同時に 1 本だけ許し、別 Runner / App remount 相当の再取得も
active lease が残る限り拒否する。

2 以降で失敗した Error は `committed: true` を持ち、UI は内容を保持せず Diagnostic の Recovery 専用
safe-state に留まる。Back、Share、他の削除操作を閉じ、明示した再試行だけが同じ Control の
`recoverPendingDeletion()` を呼ぶ。成功後に Profile 初期画面へ戻す。次回起動も Profile load より前に
同じ回復を実行し、tombstone があれば 3 から再開する。Model Context 使用中は 1 で `MODEL_IN_USE` として
拒否し、Recovery 手順は Model Session を終了して再試行する。

## UI と Recovery

Settings から Diagnostic Screen を開く。Loading、空、成功、Error を区別し、JA / EN の固定 Recovery を
Error Code ごとに表示する。`End and forget Lounge`、`Reset Passport`、`Remove Model`、
`Delete all local data` は別 Button にする。全削除は対象件数 / Byte 数の Preview と 2 段階確認を必須にし、
確認前に delete Port を呼ばない。

削除 commit 後は React state の Profile、Share selection、Lounge、Invite、Owner Answer、Backup 入力を
破棄し、物理削除または同一 Process の回復完了後に Profile 初期画面へ戻る。Diagnostic Preview は close、
Lounge 破棄、全削除で即時失効させ、遅延中の
refresh は generation で破棄する。状態変更後は新しい runtime snapshot から明示 refresh した Report
だけを Share できる。
`End and forget Lounge` と全削除は実行中 Provider の Signal、active Encounter Key、Runner Ledger も
同じ遷移で破棄し、遅延 Model Outcome が Lounge や Evidence を復活させない。
現在の表示言語と OS の Reduce Motion は永続 Resource ではなく、Process を越えて復元しない。実 Model と
永続 Settings を追加する後続変更は、同じ全削除 callback と Resource Port の両方へ接続しなければならない。
再起動相当の test は同じ実 File / Web Storage を新しい Adapter で開き、Profile と tombstone の両方が
復元されないことを確認する。Storage Failure と中断は失敗専用の本物の Port 実装で再現し、Mock framework
は使わない。

## 検証

- Report の Snapshot と strict parser で allowlist を固定し、禁止語彙と未知 field を拒否する。
- Share Port の呼び出しは Preview 後の明示 `share()` 1 回だけとする。
- tombstone 前失敗、tombstone 後中断、再起動回復、Model Context 使用中を日本語 BDD で区別する。
- dependency manifest / lock に Analytics、Crash SaaS、Advertising SDK、Remote Log SDK がないことを
  harness で検査する。
- OS Log の実機検査は iOS / Android の Release evidence として別途取得する。
