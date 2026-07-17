/**
 * Export された JSON を OS の Share Sheet（または Web の fallback）へ渡すための薄い Port。
 * Native 実装（`native-backup-share.ts`）は React Native 同梱の `Share` モジュールを、
 * Web 実装（`web-backup-share.ts`）は `navigator.share` またはファイルダウンロードへの
 * fallback を使う。どちらも実際の OS API・ブラウザ API を直接 import せず、環境 interface を
 * constructor で受け取る（詳細は `docs/design/backup-export-import.md`）。
 */
export interface BackupShareRequest {
  readonly fileName: string;
  readonly json: string;
}

export type BackupShareOutcome =
  | { readonly kind: 'shared' }
  | { readonly kind: 'dismissed' }
  | { readonly kind: 'saved-to-file'; readonly destination: string };

export interface BackupSharePort {
  share(request: BackupShareRequest): Promise<BackupShareOutcome>;
}
