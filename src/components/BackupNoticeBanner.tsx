import { StyleSheet, Text, View } from 'react-native';
import { type BackupNotice, backupNoticeIsError } from '../app/backup-notice';
import { colors, spacing } from '../ui/theme';

interface BackupNoticeBannerProps {
  readonly notice: BackupNotice;
}

/**
 * Export・Import どちらの画面も同じ形の通知バナーを使う。`notice.kind === 'idle'` では
 * 何も表示しない。エラーかどうかは `backupNoticeIsError` へ一本化し、呼び出し側の画面が
 * `notice.kind` を個別に判定しない（Reuse/Simplification レビュー指摘の反映）。
 */
export default function BackupNoticeBanner({
  notice,
}: BackupNoticeBannerProps) {
  if (notice.kind === 'idle') return null;
  const isError = backupNoticeIsError(notice);
  return (
    <View
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.notice, isError ? styles.errorNotice : undefined]}
    >
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  errorNotice: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
});
