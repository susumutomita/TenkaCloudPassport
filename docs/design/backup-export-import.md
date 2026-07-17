# JSON バックアップ Export・Import の設計

本書は Issue 14 の、Lounge 境界を守る手動 JSON バックアップの Export・復元を完成する設計を
定める。バックアップ Schema 自体（`backupSchemaVersion` の Versioned strict schema と
Migration）は Issue 5・7 で実装済みであり、
[`src/domain/backup.ts`](../../src/domain/backup.ts)、
[`src/protocol/schema.ts`](../../src/protocol/schema.ts)、
[`src/protocol/migration.ts`](../../src/protocol/migration.ts) を正本とする。本書はこれを
**拡張** し、Export・Import の UX と Port だけを追加する差分であり、既存の Schema・Migration を
重複実装しない。データ分類と allowlist は [Privacy データ台帳](../privacy/data-inventory.md)、
保持契約は [Privacy 保持ポリシー](../privacy/retention-policy.md) を正本とする。

## 目的と対象範囲

利用者が自分の少量の設定（Local Passport、Pet 設定、Model 設定のうち秘匿値でないもの）を、
自分の Private GitHub Repository や暗号化 Storage へ手動で退避できるようにする。アプリは
GitHub API と接続せず、Token を扱わない。対象は `src/app/backup-export.ts`・
`src/app/backup-import.ts`・共有 Port（`src/app/*-backup-share.ts`）・
`src/screens/BackupExportScreen.tsx`・`src/screens/BackupImportScreen.tsx`・
`src/app/PassportApp.tsx` の配線、および手動配置手順を説明する `docs/guides/backup.md` とする。

## Export の allowlist（再掲）

バックアップは `backupSchemaVersion`・`exportedAt`・`localPrivateProfile`・`deviceSettings`・
`modelVerification` だけを持つ。allowlist に無いデータは次のとおりとする。

- Public Passport、QR 参加情報。
- Lounge セッション、暗号鍵、Owner Question、Owner Answer。
- Pet Message、端末内推論データ、Bridge、`no-signal`・`retired`。
- GGUF モデル本体、端末の絶対パス、GitHub Token、Analytics データ。

`strictRecord`（`src/protocol/validation.ts`）が未知 field を構造的に拒否するため、これらの
データはバックアップの型にそもそも入り得ない。

## Export フロー設計

### 1. Preview（含まれる全項目の表示）

`src/app/backup-export.ts` の `createBackupExportPreview(input)` が、`LocalPrivateProfile` ・
`DeviceSettings` ・ `ModelVerification | null` ・ `exportedAt`（呼び出し側が
`new Date().toISOString()` で生成する ISO 8601 文字列）を受け取り、`parseBackup`
（既存の strict schema）へ一度通してから `Backup` を確定する。この構築時に既存 schema を
再利用することで、Export 側だけが allowlist から逸脱した field を持つ経路を作らない。

`backupPreviewItems(backup)` はバックアップが持つ **全 field** を 1 行 1 項目の
`BackupPreviewItem[]`（`key` / `label` / `value`）へ展開する。表示する項目は次のとおりとする。

- Pet Name、Pet Emoji、Owner Alias。
- 候補手掛かり（公開対象かどうかを含む）、除外トピック、Languages。
- バックアップ Schema Version、Export 日時。
- 端末設定（Language・Reduce Motion・選択中モデル digest・カタログ版）。
- モデル検証記録（存在する場合）。

これらを 1 件も省略せずに列挙する。`BackupExportScreen` はこの一覧をそのまま表示するため、
Preview に含まれる項目と実際に Export される項目が構造的に一致する（同じ `backup` object から
両方を導出するため、Preview だけ別の値を見せることができない）。

### 2. JSON が暗号化されないことの明示

`BackupExportScreen` は Preview の直後に、JSON が暗号化されないことと、保存先の管理は Owner
自身の責任であることを固定文言で表示する。JSON 自体には暗号化処理を加えない（暗号化 Storage
を使うかどうかは Owner の選択に委ねる、Issue 14 の受け入れ条件どおり）。

### 3. 明示操作だけが OS Share Sheet を開く

`BackupExportScreen` は Preview 表示中は共有せず、「Share Sheet で共有する」Button を明示的に
押した場合だけ `BackupSharePort.share({ fileName, json })` を呼ぶ。自動 Export、自動
Upload、最近の Export 内容の保持は行わない（[保持ポリシー](../privacy/retention-policy.md)
の契約どおり）。

### Share Sheet の Port 設計

`react-native` の `Share` モジュール（新規依存ではなく Expo/React Native に同梱済み）を
使うが、Web は `Share`（`react-native-web` 経由）が `navigator.share` の有無に依存し、
非対応ブラウザでは常に reject するため、Web 単体では「ファイルへ保存」へ確実に fallback
できない。そこで `src/app/backup-share-port.ts` に次のような Port を定義する。

```ts
export interface BackupSharePort {
  share(request: { fileName: string; json: string }): Promise<BackupShareOutcome>;
}
```

この薄い Port を切ることで、Native 実装（`native-backup-share.ts`）は `Share.share` を、Web
実装（`web-backup-share.ts`）は `navigator.share` が使えるときだけそれを呼び、使えない環境
では Blob ダウンロードへ fallback する。どちらの実装も、実際の OS API・ブラウザ API を直接
import せず、`NativeShareEnvironment` / `WebShareEnvironment` という小さな環境 interface を
constructor で受け取る。

本番用の実装（`default-backup-share.ts`）だけが実際の `react-native` の `Share` と
`navigator` / DOM を組み立てる Composition Root であり、`default-local-profile-storage.ts`
と同じ理由（Platform 分岐だけの薄い配線であり、実機・実ブラウザ API が無い Bun test 環境では
意味のある分岐カバレッジを生まない）でテスト対象から外す。`WebBackupSharePort` /
`NativeBackupSharePort` 自体は、環境 interface に実際に動作するテスト用実装（例えば実ファイル
へ書き込む Web fallback）を注入して検証する。これは `src/app/qr-scanner-port.ts` の
`InProcessQrScannerPort`（実機カメラが無い M1 で実際に動く実装）と同じ考え方であり、モックで
振る舞いを偽装するのではなく、Port が要求する契約を満たす別の本物の実装を注入する。

## Import フロー設計

### 1. Preview → 2. Validation → 3. Conflict 選択 → 4. Commit

`src/app/backup-import.ts` の `parseBackupImportCandidate(raw)` が、`parseBoundedJson`
（64 KiB 上限・深度 8 上限、既存の `BACKUP_MAX_BYTES` / `EXTERNAL_JSON_MAX_DEPTH`）→
`migrateBackupToCurrent`（既存の Version 0 / 1 / 2 分岐）の順で検証する。次の入力はここで
`SchemaValidationError` として拒否され、`{ kind: 'rejected', code, message }` を返す。

- 不正 JSON。
- 未知の Major Version。
- 欠落 Field。
- 64 KiB を超える過大な File。

例外を投げないのは、呼び出し側が catch を忘れて Storage を触ってしまう経路を作らないためで
ある。検証に成功した場合だけ `{ kind: 'parsed', backup, items }` を返し、`items` は Export
と同じ `backupPreviewItems(backup)` を再利用する。`BackupImportScreen` は `rejected` の場合は
Preview を一切表示せず、`parsed` の場合だけ Preview → Conflict 選択 → Commit Button へ進む。
この段階では既存の `LocalPrivateProfile` にもまだ一切触れない。

Conflict 選択は Profile 単位（per-profile granularity）で行う。既存 Profile がある場合は
「既存を残す」か「読み込んだ内容に置き換える」かを明示的に選ばせ、既存 Profile が無い（初回
Import）場合は選択肢を出さずそのまま読み込んだ内容を使う。

```ts
export type BackupImportConflictChoice = 'keep-existing' | 'use-imported';

export function resolveImportedProfile(
  candidate: Backup,
  existingProfile: LocalPrivateProfile | null,
  choice: BackupImportConflictChoice
): LocalPrivateProfile
```

`choice === 'keep-existing'` かつ `existingProfile === null` は呼び出し元の実装誤りであり
`BackupImportConflictError` を投げる。存在しない選択肢を screen 側が渡さないことを、型だけで
なく実行時にも保証する目的で設ける。

### Atomic Commit（失敗時に元の Profile を保つ）

`commitBackupImport(storage, resolvedProfile)` は、既存の `LocalProfileStoragePort.save()` を
呼んだ直後に `storage.load()` で読み戻し、書き込んだ内容と一致することを確認する
（write-then-verify）。`PassportApp` 側は `setPrivateProfile` などの in-memory state を
`commitBackupImport` が成功として戻った後だけ更新する（既存の `saveLocalProfile()` と同じ
「保存が成功した後だけ state を進める」規約に揃える）。

「失敗時に元の Profile を保つ」という保証の中身は、失敗する経路によって次のように分かれる。

- `save()` 自体が reject する経路（quota 超過、権限エラー等）は、書き込みそのものが
  起きていないため、失敗前に Storage が保持していた Profile を確実に変更しない。
  Web（`localStorage.setItem` 相当）は 1 key の単一操作が成功か失敗かのどちらかであり、
  失敗時に既存の値が変わらないという性質を JS Engine の契約から得る。Native（実ファイル
  書き込み）は「書き込みが失敗する Port 実装」を実際に用意して検証する。
  `src/app/storage-test-kit.ts` に、実ファイルを読み込みだけ本物で行い書き込みだけ確実に
  reject する `WriteFailingProfileDocument` / `WriteFailingWebStorage` を追加し、Import
  Commit の失敗時テストがこの実装を注入する。これは `local-profile-storage.ts` の
  `UnavailableLocalProfileStorageAdapter`（Storage 自体が使えない状況を表す、本番でも
  使われ得る本物の実装）と同じ考え方であり、ビジネスロジックをモックで偽装するのではなく
  Port の契約を満たす別の本物の実装を注入する。
- `save()` は成功したのに読み戻した内容が一致しない経路（write-then-verify の不一致）は、
  この時点ですでに書き込みが完了しているため、`LocalProfileStorageError` を投げて
  Commit を失敗として通知するが、すでに書き込まれた内容を元の Profile へロールバックは
  しない。現在の Web・Native 実装ではこの不一致が実質的に発生しないため
 （write-then-verify のラウンドトリップが決定的である）、この経路は「万一の不整合を
  検知して警告する」防御であり、実際のロールバック実装は Known follow-ups とする。
  `src/app/storage-test-kit.ts` の `VerifyMismatchStorage`（`save()` は実 I/O へ委譲、
  `load()` は常に別 Profile を返す）で、この経路が Commit を失敗として扱うことだけを
  固定する。

`DeviceSettings` と `ModelVerification` はバックアップの allowlist に含まれ、Import の
Preview には表示するが、これらを永続化する専用 Storage Port はまだ存在しない（Issue 14 の
対象は Local Private Profile の Export・Import 契約であり、端末設定・モデル検証記録の専用
画面は別 Issue で扱う）。そのため Import Commit が実際に永続化するのは `localPrivateProfile`
だけであり、Device Settings・Model Verification の Import 適用は Known follow-ups とする。

## Snapshot 除外テストとタイミングテスト

`src/app/lounge-privacy-regression.test.ts`（Issue 9）が使っていた「Room の forming から
Bridge 確定・完全破棄までのフル行程を実際の Use Case 関数列で実行する」ヘルパーと、Lounge
由来の禁止語彙一覧を `src/app/lounge-lifecycle-test-kit.ts` へ切り出し、両方のテストファイル
から共有する（重複実装をしないため）。

`src/app/backup-export-privacy-regression.test.ts` は、この共有ヘルパーで Active Lounge を
Bridge 確定・`clarifying` 経由の Bridge 確定・完全破棄それぞれの時点まで進める。その
タイミングごとに `createBackupExportPreview` を呼び、生成された JSON が禁止語彙を 1 つも
含まないことと `toMatchSnapshot()` で構造を固定することを確認する。バックアップの型が
Lounge 状態を構造的に受け取れない（`BackupExportInput` の型に `LocalPrivateProfile` 以外の
Lounge 由来 field が無い）ため、この振る舞いは型でも保証されている。将来バックアップの型に
field を足す変更が allowlist から逸脱しないことを、実行時レベルでも固定する回帰テストとして
残す。

## 手動配置手順とドキュメント

`docs/guides/backup.md` に、Export した JSON ファイルを Owner 自身の Private GitHub
Repository へ手動でコミットする手順（GitHub の Web UI 経由のファイルアップロード、または
`git add` / `git commit` / `git push`）だけを記載する。GitHub API・GitHub CLI 認証・Personal
Access Token・OAuth のいずれも使わず、アプリはこれらを一切要求しない。
`src/app/no-github-token-input.test.ts` が `src/` 配下のソースを走査し、GitHub Token を要求
する入力欄・変数・文言が無いことをソーステキスト検査で固定する。

## バックアップファイルの削除・上書き責任

`docs/guides/backup.md` と `BackupExportScreen` の警告文の両方に、次の責任分界点を明記する。

- アプリは Export した JSON ファイルの所在・世代・削除を一切追跡しない。
- 保存先（Private GitHub Repository、暗号化 Storage、ローカルディスク）の同期・共有範囲・
  版管理・削除は Owner 自身の責任であり、アプリの管理外である。
- 誤って公開 Repository へ置いた場合の削除対応、古いバックアップの世代整理も Owner の責任で
  ある。

## 代替案

### Export の共有手段を `react-native-share` 等の追加依存にする案

QR 表示（Issue 8）で「新規依存を追加しない」方針を踏襲し、React Native 同梱の `Share`
モジュールと Web の `navigator.share` / Blob ダウンロードだけで賄う。追加依存を入れる案は
機能は豊富になるが、供給網境界（`INVARIANT_LIFECYCLE_HOOK_SCOPED` 等の対象）を増やすため
採用しない。

### Import の入力手段をファイル選択 Dialog（Native）にする案

Native でファイル選択 Dialog を使うには `expo-document-picker` 等の新規依存が要る。新規依存を
追加しない方針のもと、Native・Web の両方で共通して使える「JSON を貼り付ける」`TextInput` へ
入力手段を統一する。Web はブラウザの Copy 機能でエクスポート済みファイルの中身を貼り付けられ、
Native は Files アプリ等でファイルを開いてテキストをコピーすれば同じ手順で読み込める。将来
Native 専用のファイル選択を追加する場合は、この Port（`parseBackupImportCandidate` は入力が
文字列であること以外に依存しない）を変更せずに入力手段だけを追加できる。

### Device Settings・Model Verification も専用 Storage Port を新設して Import 時に永続化する案

バックアップの allowlist・Preview には含めるが、これらの専用設定画面・永続化 Port はまだ
どの Issue でも実装されていない。Issue 14 の一気通貫の対象を「新規に追加する Export・Import
機能」に絞るという原則（`AGENTS.md` の作業順序）に照らすと、存在しない機能の永続化層を
Import のためだけに新設するのは本来の目的に対して不釣り合いに大きい。Preview で全項目を
可視化しつつ、実際の永続化は既存の `LocalProfileStoragePort` が持つ `localPrivateProfile`
だけに絞り、Device Settings・Model Verification の Import 適用は Known follow-ups とする。

### Conflict 選択を field 単位にする案

Local Private Profile の中の Pet Name だけ・手掛かりだけ、のように field 単位で個別に選べる
ようにする案は柔軟だが、UI・Domain の両方が大きくなる。Issue 14 の architect guidance が
「per-profile granularity is fine」としているとおり、Profile 全体を「既存を残す」か「読み込
んだ内容に置き換える」かの 2 択にとどめる。

## エッジケース

- 既存 Profile が無い状態での初回 Import は Conflict 選択を出さず、そのまま読み込んだ内容を
  使う。
- 不正 JSON・未知 Major Version・欠落 Field・64 KiB 超過は `parseBackupImportCandidate` の
  時点で拒否し、既存の `LocalPrivateProfile` を一切参照・変更しない。
- Import Commit の書き込みが失敗した場合、`commitBackupImport` は例外を再送出し、
  `storage.load()` は失敗前の Profile を返し続ける。
- Active Lounge が進行中・Bridge 確定直後・完全破棄直後のいずれのタイミングで Export しても、
  Export された JSON は Lounge 由来の語彙を 1 つも含まない。
- Export 対象の `LocalPrivateProfile` が候補手掛かり 0 件・Languages 0 件でも Preview は正しく
  表示され、Export 自体は成立する（バックアップの Schema は `candidateClues` を 1 件以上
  要求するため、Profile が保存できている時点で必ず 1 件以上ある）。

## Known follow-ups

- Device Settings（Language・Reduce Motion・選択中モデル digest）・Model Verification の専用
  設定画面と永続化 Port の新設、および Import 時のこれらの実際の反映。
- Native 専用のファイル選択 Dialog（新規依存が前提になるため、依存追加の是非を別途 ADR で
  判断したうえで着手する）。
- Web Share API Level 2（`navigator.share` へファイル添付）・Native の `Share.share` を
  ファイル添付として扱う経路の検討。現状はどちらも JSON をテキストとして渡すため、共有先に
  よっては長文のテキストメッセージが切り詰められる可能性がある。
- Import Commit の write-then-verify が不一致を検出した場合に、書き込み前の Profile へ
  ロールバックする経路の実装（現在の Storage 実装ではこの不一致が実質的に発生しないため
  優先度は低いが、将来 Storage 実装を差し替えた場合に備える）。
