# ADR-0033: JSON Backup を削除し Consumer 導線を簡素化する

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: susumutomita (owner 実機フィードバック), Claude Fable 5 (実装: Claude Sonnet 5)

## Context

owner の実機フィードバック（Issue 118）で、consumer アプリ（自己紹介カード作成・共有）に
旧 Pet/Lounge 時代の名残（開発者/診断向け要素）が複数残っていることが判明した。

1. JSON Backup（Export/Import、`docs/design/backup-export-import.md`）は、
   自己紹介カードが 2 タップで作り直せる（Issue 79 のピボット後）ため、もはや
   「万一の復元手段」としての価値がリスク・複雑さに見合わない。owner 自身が
   「バックアップ機能はいらない」「カードを作るの大変じゃない」と明言した。
2. 言語切替（Settings 画面）がカードをスクロールした先に沈んでおり、動線として
   分かりにくい。
3. Settings 画面に配布能力デバッグ表示（Runtime/Tier/Rules Provider/Local Model/
   Nearby Transport、Issue 28）が出ており、一般ユーザー向けの設定画面には
   不要な開発者向け情報になっている。
4. カード表示画面の「削除」が QR の直下という目立つ位置にあり、「編集」と並ぶ
   主導線のように見えて分かりにくい。

## Decision

- **JSON Backup を機能とテストごと完全削除する**。対象は `BackupExportScreen.tsx` /
  `BackupImportScreen.tsx`、`use-backup-flow.ts`、`backup-export.ts` /
  `backup-import.ts` / `backup-notice.ts`、`BackupPreviewList.tsx` /
  `BackupNoticeBanner.tsx`、`domain/backup.ts`、`protocol/migration.ts`
  （`migrateBackupToCurrent` が Backup 専用）、および `protocol/schema.ts` の
  Backup 専用パース関数（`parseBackup` / `parseBackupJson` / `BACKUP_MAX_BYTES` /
  `digest` / `deviceSettings` / `modelVerification` / `exportedAt` ヘルパー）。
  対応するテスト・snapshot も同じ PR で削除し、カバレッジ 100% を維持する。
- **共有インフラは残す**: `BackupSharePort`（`backup-share-port.ts` /
  `default-backup-share.ts` / `native-backup-share.ts` / `web-backup-share.ts` /
  `backup-share-test-kit.ts`）は、Backup 専用ではなく Diagnostics のレポート共有・
  Pilot Measurement の CSV 共有からも使う共有の「OS Share Sheet へ渡す」抽象である
  ため削除しない（Issue 本文が削除対象に挙げていたが、grep で他機能からの実利用を
  確認した上でこの ADR で明示的に維持を決定する。命名の `Backup*` が実態と
  ずれているため、リネームは follow-up とする）。
- **保存ボタン文言を簡潔化する**: intro card 保存ボタンの文言を「自己紹介カードを
  端末内に明示保存」から「保存」（ja）/ 「Save」（en）へ短縮する。挙動（明示保存
  するまで端末に残らない）は変えない。
- **言語切替をヘッダーへ常設する**: `AppScreen` の BrandMark 右の空きへ、JA/EN の
  コンパクトなトグルを追加する（optional prop、渡した画面だけに出る）。
  自己紹介カード系画面（`IntroCardScreen` / `IntroCardEditScreen`）だけがこの
  prop を渡す。既存の `LanguageSelector`（`domain/clue-catalog` の
  `LanguageCode`、Pet Passport の話せる言語 clue）とは別概念であるため
  流用せず、`app/i18n/locale`（`Locale` = UI 表示言語）を直接使う新規の
  軽量トグルを実装する。
- **Settings 画面を consumer 導線から外す**: 言語切替がヘッダーへ移り、配布能力
  デバッグ表示も消えると Settings 画面に残るのは Local Model 管理・Diagnostics・
  Pilot Measurement への導線だけになる。自己紹介カード系画面から Settings への
  ボタンを削除する（コードは残し、Pet/Lounge 側の導線からは引き続き到達できる）。
  完全削除（`SettingsScreen.tsx` 自体・stage・rule）は follow-up とする。
- **配布能力デバッグ表示を Settings から削除する**: `distributionCapability` prop を
  `SettingsScreen` から外す。`UtilityStageGate` からも同じ理由で外す。`PassportApp`
  レベルの prop は、他に実利用者がない（grep で確認済み）ため合わせて外し、
  `App.tsx` の合成からも `distributionCapability={DEFAULT_DISTRIBUTION_CAPABILITY}`
  を外す。結果として `DistributionCapability` 型・`distribution-capability-notice.ts`・
  `default-distribution-capability*.ts` は生産コードから参照されなくなり
  knip の dead-code 報告に載るが、削除するかどうかの判断・関連する
  `distribution-capability.test.ts` の要否は follow-up とする（このモジュール群
  自体は正しく動くロジックであり、単に呼び出し元が無くなるだけである）。
- **カード表示画面の「削除」を控えめな位置へ移す**: QR 直下のフルサイズ danger
  ボタンから、「編集」ボタンの下にある小さな下線付きテキストリンクへ変更する。
  クリック領域は WCAG 2.5.5 相当（44pt）を維持する。既存の削除確認ダイアログは
  グレップ調査の結果 IntroCardScreen にはそもそも存在しなかった（即時削除の
  挙動を変えるものではない）。JSON Backup がなくなったことで誤削除時の
  復元手段が完全になくなるため、確認ダイアログの追加は follow-up として記録する。

## Consequences

- **Good**: consumer アプリの導線が「カード作成 → QR 表示」に集中し、開発者/診断
  向け情報が一般ユーザーの目に触れなくなる。JSON Backup 関連のコード・テストの
  保守コストが無くなる。
- **Bad**: JSON Backup がなくなったことで、誤ってカードを削除した場合の復元手段が
  無くなる（再作成のみ）。owner はこれを「2 タップで作り直せるので許容範囲」と
  明言している。
- **Tradeoff**: `BackupSharePort` 等の命名は「Backup」を冠したまま残るため、
  読み手には「Backup 機能の一部」に見えるミスリードが残る。将来 Diagnostics/Pilot
  Measurement の共有 API を独立して育てる際にリネームする。`DistributionCapability`
  関連モジュールも同様に「呼び出し元がなくなった正しいコード」として残るため、
  再判定が必要になった時点（Issue 28 系の再訪、または knip report のクリーンアップ
  Issue）で削除するか再利用するかを決め直す。

## References

- 関連コード: `src/app/PassportApp.tsx`, `src/components/AppScreen.tsx`,
  `src/screens/SettingsScreen.tsx`, `src/screens/IntroCardScreen.tsx`,
  `src/screens/IntroCardEditScreen.tsx`, `src/screens/PassportCreationScreen.tsx`
- 関連 PR / Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/118
- 関連ドキュメント: [`docs/design/backup-export-import.md`](../design/backup-export-import.md)
  （JSON Backup Export/Import の設計、Issue 14。専用の ADR は存在せず、本書が
  唯一の設計記録だったため Superseded 注記を追加した。本 ADR が実質的にこれを
  supersede する）
