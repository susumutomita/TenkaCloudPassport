import { StyleSheet, Text, View } from 'react-native';
import type { BackupExportPreview } from '../app/backup-export';
import type { BackupNotice } from '../app/backup-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import BackupNoticeBanner from '../components/BackupNoticeBanner';
import BackupPreviewList from '../components/BackupPreviewList';
import { colors, spacing } from '../ui/theme';

interface BackupExportScreenProps {
  readonly preview: BackupExportPreview | null;
  readonly sharing: boolean;
  readonly notice: BackupNotice;
  readonly onShare: () => void;
  readonly onOpenImport: () => void;
  readonly onBack: () => void;
}

export default function BackupExportScreen({
  preview,
  sharing,
  notice,
  onShare,
  onOpenImport,
  onBack,
}: BackupExportScreenProps) {
  return (
    <AppScreen
      description="Local Passport、Pet 設定、Model 設定のうち秘匿値でないものだけを書き出します。アプリは GitHub API と接続せず、Token を扱いません。"
      eyebrow="Backup / Export"
      title="端末内の設定を JSON として書き出す。"
    >
      <View accessibilityRole="alert" style={styles.warning}>
        <Text style={styles.warningTitle}>この JSON は暗号化されません。</Text>
        <Text style={styles.warningText}>
          保存先の同期・共有範囲・版管理・削除は Owner 自身の責任です。アプリは
          保存先のファイルを一切追跡しません。
        </Text>
      </View>
      <Text style={styles.sectionTitle}>Export される全項目（Preview）</Text>
      <BackupPreviewList items={preview ? preview.items : []} />
      <Text style={styles.byteLength}>
        {preview ? preview.byteLength : 0} bytes
      </Text>
      <BackupNoticeBanner notice={notice} />
      <ActionButton
        accessibilityHint="Export した JSON を OS の Share Sheet（または Web の場合はファイル保存）で共有します。"
        disabled={sharing}
        label={sharing ? '共有中' : 'Share Sheet で共有する'}
        onPress={onShare}
      />
      <ActionButton
        label="バックアップを復元する（Import）"
        onPress={onOpenImport}
        variant="secondary"
      />
      <ActionButton
        label="Profile 編集へ戻る"
        onPress={onBack}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  warning: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  warningText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  byteLength: {
    color: colors.muted,
    fontSize: 13,
  },
});
