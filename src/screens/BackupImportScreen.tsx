import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { BackupPreviewItem } from '../app/backup-export';
import type { BackupImportConflictChoice } from '../app/backup-import';
import type { BackupNotice } from '../app/backup-notice';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import BackupNoticeBanner from '../components/BackupNoticeBanner';
import BackupPreviewList from '../components/BackupPreviewList';
import { BACKUP_MAX_BYTES } from '../protocol/schema';
import { colors, spacing } from '../ui/theme';

export interface BackupImportRejectedView {
  readonly kind: 'rejected';
  readonly message: string;
}

export interface BackupImportParsedView {
  readonly kind: 'parsed';
  readonly items: readonly BackupPreviewItem[];
}

export type BackupImportValidationView =
  | BackupImportRejectedView
  | BackupImportParsedView
  | null;

interface ConflictChoiceSectionProps {
  readonly choice: BackupImportConflictChoice;
  readonly locale: Locale;
  readonly onChangeChoice: (choice: BackupImportConflictChoice) => void;
}

/** 既存 Profile がある場合だけ表示する、Profile 単位（per-profile granularity）の Conflict 選択。 */
function ConflictChoiceSection({
  choice,
  locale,
  onChangeChoice,
}: ConflictChoiceSectionProps) {
  const t = MESSAGES[locale].backupImport;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t.conflictQuestion}</Text>
      <ActionButton
        accessibilityHint={t.keepExistingHint}
        label={t.keepExistingButton(choice === 'keep-existing')}
        onPress={() => onChangeChoice('keep-existing')}
        variant={choice === 'keep-existing' ? 'primary' : 'secondary'}
      />
      <ActionButton
        accessibilityHint={t.useImportedHint}
        label={t.useImportedButton(choice === 'use-imported')}
        onPress={() => onChangeChoice('use-imported')}
        variant={choice === 'use-imported' ? 'primary' : 'secondary'}
      />
    </View>
  );
}

interface ParsedCandidateSectionProps {
  readonly validation: BackupImportParsedView;
  readonly hasExistingProfile: boolean;
  readonly choice: BackupImportConflictChoice;
  readonly locale: Locale;
  readonly onChangeChoice: (choice: BackupImportConflictChoice) => void;
  readonly committing: boolean;
  readonly notice: BackupNotice;
  readonly onCommit: () => void;
}

/** Validation 成功後（Preview → Conflict 選択 → Commit）だけを表示するセクション。 */
function ParsedCandidateSection({
  validation,
  hasExistingProfile,
  choice,
  locale,
  onChangeChoice,
  committing,
  notice,
  onCommit,
}: ParsedCandidateSectionProps) {
  const t = MESSAGES[locale].backupImport;
  return (
    <>
      <Text style={styles.sectionTitle}>{t.parsedSectionTitle}</Text>
      <BackupPreviewList items={validation.items} />
      {hasExistingProfile ? (
        <ConflictChoiceSection
          choice={choice}
          locale={locale}
          onChangeChoice={onChangeChoice}
        />
      ) : null}
      <BackupNoticeBanner notice={notice} />
      <ActionButton
        accessibilityHint={t.commitButtonHint}
        disabled={committing}
        label={t.commitButton(committing)}
        onPress={onCommit}
      />
    </>
  );
}

interface BackupImportScreenProps {
  readonly rawInput: string;
  readonly onChangeRawInput: (value: string) => void;
  readonly onValidate: () => void;
  readonly validation: BackupImportValidationView;
  readonly hasExistingProfile: boolean;
  readonly choice: BackupImportConflictChoice;
  readonly locale?: Locale;
  readonly onChangeChoice: (choice: BackupImportConflictChoice) => void;
  readonly committing: boolean;
  readonly notice: BackupNotice;
  readonly onCommit: () => void;
  readonly onOpenExport: () => void;
  readonly onBack: () => void;
}

export default function BackupImportScreen({
  rawInput,
  onChangeRawInput,
  onValidate,
  validation,
  hasExistingProfile,
  choice,
  locale = DEFAULT_LOCALE,
  onChangeChoice,
  committing,
  notice,
  onCommit,
  onOpenExport,
  onBack,
}: BackupImportScreenProps) {
  const t = MESSAGES[locale].backupImport;
  return (
    <AppScreen
      description={t.description}
      eyebrow="Backup / Import"
      title={t.title}
    >
      <View style={styles.field}>
        <Text style={styles.label}>{t.rawInputLabel}</Text>
        <TextInput
          accessibilityHint={t.rawInputHint(BACKUP_MAX_BYTES)}
          accessibilityLabel={t.rawInputAccessibilityLabel}
          multiline
          onChangeText={onChangeRawInput}
          placeholder={t.rawInputPlaceholder}
          style={styles.input}
          value={rawInput}
        />
      </View>
      <ActionButton
        accessibilityHint={t.validateButtonHint}
        disabled={rawInput.length === 0}
        label={t.validateButton}
        onPress={onValidate}
      />

      {validation?.kind === 'rejected' ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>{t.rejectedTitle}</Text>
          <Text style={styles.errorText}>{validation.message}</Text>
          <Text style={styles.errorText}>{t.rejectedUnchangedNotice}</Text>
        </View>
      ) : null}

      {validation?.kind === 'parsed' ? (
        <ParsedCandidateSection
          choice={choice}
          committing={committing}
          hasExistingProfile={hasExistingProfile}
          locale={locale}
          notice={notice}
          onChangeChoice={onChangeChoice}
          onCommit={onCommit}
          validation={validation}
        />
      ) : null}

      <ActionButton
        label={t.openExportButton}
        onPress={onOpenExport}
        variant="secondary"
      />
      <ActionButton label={t.backButton} onPress={onBack} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
