import { Platform, Share } from 'react-native';
import type { BackupSharePort } from './backup-share-port';
import { NativeBackupSharePort } from './native-backup-share';
import {
  WebBackupSharePort,
  type WebShareEnvironment,
} from './web-backup-share';

/**
 * 実際の `react-native` の `Share` モジュールと `navigator` / DOM を組み立てる
 * Composition Root。Platform 分岐だけの薄い配線であり、実機・実ブラウザ API が無い
 * Bun test 環境では意味のある分岐カバレッジを生まないため、
 * `default-local-profile-storage.ts` と同じ理由でテスト対象から外す
 * （`docs/design/backup-export-import.md` 参照）。ポートの実装自体
 * （`WebBackupSharePort` / `NativeBackupSharePort`）は環境 interface を注入して
 * 別テストで検証済みである。
 */
function webShareEnvironment(): WebShareEnvironment {
  const nav: { share?: (data: ShareData) => Promise<void> } | undefined =
    typeof navigator === 'undefined' ? undefined : navigator;
  return {
    supportsNativeShare: typeof nav?.share === 'function',
    async shareText({ title, text }) {
      try {
        await nav?.share?.({ title, text });
        return 'shared';
      } catch {
        return 'dismissed';
      }
    },
    downloadFile(fileName, content) {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  };
}

export function createDefaultBackupSharePort(): BackupSharePort {
  if (Platform.OS === 'web') {
    return new WebBackupSharePort(webShareEnvironment());
  }
  return new NativeBackupSharePort({
    async shareText({ title, message }) {
      const result = await Share.share({ title, message });
      return { dismissed: result.action === Share.dismissedAction };
    },
  });
}
