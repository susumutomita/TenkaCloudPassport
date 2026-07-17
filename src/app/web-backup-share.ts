import type {
  BackupShareOutcome,
  BackupSharePort,
  BackupShareRequest,
} from './backup-share-port';

/**
 * `navigator.share` の有無と、ファイルダウンロードという 2 つの実際のブラウザ機能を
 * 抽象化した環境 interface。`WebBackupSharePort` 自体は `navigator` / DOM を直接 import
 * せず、この interface の実装だけに依存する。
 */
export interface WebShareEnvironment {
  readonly supportsNativeShare: boolean;
  shareText(input: {
    readonly title: string;
    readonly text: string;
  }): Promise<'shared' | 'dismissed'>;
  downloadFile(fileName: string, content: string): void;
}

export class WebBackupSharePort implements BackupSharePort {
  constructor(private readonly environment: WebShareEnvironment) {}

  async share(request: BackupShareRequest): Promise<BackupShareOutcome> {
    if (this.environment.supportsNativeShare) {
      const result = await this.environment.shareText({
        title: request.fileName,
        text: request.json,
      });
      return result === 'shared' ? { kind: 'shared' } : { kind: 'dismissed' };
    }
    this.environment.downloadFile(request.fileName, request.json);
    return { kind: 'saved-to-file', destination: request.fileName };
  }
}
