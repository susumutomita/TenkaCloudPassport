import { StyleSheet, Text, View } from 'react-native';
import type { BackupExportPreview } from '../app/backup-export';
import type { BackupNotice } from '../app/backup-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import BackupNoticeBanner from '../components/BackupNoticeBanner';
import BackupPreviewList from '../components/BackupPreviewList';
import { colors, spacing } from '../ui/theme';

interface BackupExportScreenProps {
  readonly preview: BackupExportPreview | null;
  readonly sharing: boolean;
  readonly notice: BackupNotice;
  readonly locale?: Locale;
  readonly onShare: () => void;
  readonly onOpenImport: () => void;
  readonly onBack: () => void;
}

export default function BackupExportScreen({
  preview,
  sharing,
  notice,
  locale = DEFAULT_LOCALE,
  onShare,
  onOpenImport,
  onBack,
}: BackupExportScreenProps) {
  const t = MESSAGES[locale].backupExport;
  return (
    <AppScreen
      description={t.description}
      eyebrow="Backup / Export"
      title={t.title}
    >
      <View accessibilityRole="alert" style={styles.warning}>
        <Text style={styles.warningTitle}>{t.warningTitle}</Text>
        <Text style={styles.warningText}>{t.warningText}</Text>
      </View>
      <Text style={styles.sectionTitle}>{t.previewSectionTitle}</Text>
      <BackupPreviewList items={preview ? preview.items : []} />
      <Text style={styles.byteLength}>
        {t.byteLength(preview ? preview.byteLength : 0)}
      </Text>
      <BackupNoticeBanner notice={notice} />
      <ActionButton
        accessibilityHint={t.shareButtonHint}
        disabled={sharing}
        label={t.shareButton(sharing)}
        onPress={onShare}
      />
      <ActionButton
        label={t.openImportButton}
        onPress={onOpenImport}
        variant="secondary"
      />
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
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
