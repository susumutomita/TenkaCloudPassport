import type {
  BackupShareOutcome,
  BackupSharePort,
  BackupShareRequest,
} from './backup-share-port';

/**
 * React Native 同梱の `Share` モジュールを抽象化した環境 interface。
 * `NativeBackupSharePort` 自体は `react-native` を直接 import せず、この interface の
 * 実装だけに依存する。
 */
export interface NativeShareEnvironment {
  shareText(input: {
    readonly title: string;
    readonly message: string;
  }): Promise<{ readonly dismissed: boolean }>;
}

export class NativeBackupSharePort implements BackupSharePort {
  constructor(private readonly environment: NativeShareEnvironment) {}

  /**
   * `request.json`（最大 64 KiB）をプレーンテキストの `message` として Share Sheet へ渡す。
   * 実ファイル添付ではないため、共有先によっては長文のテキストメッセージが切り詰められる
   * 可能性がある（Known follow-ups、`docs/design/backup-export-import.md` 参照）。
   */
  async share(request: BackupShareRequest): Promise<BackupShareOutcome> {
    const result = await this.environment.shareText({
      title: request.fileName,
      message: request.json,
    });
    return result.dismissed ? { kind: 'dismissed' } : { kind: 'shared' };
  }
}
