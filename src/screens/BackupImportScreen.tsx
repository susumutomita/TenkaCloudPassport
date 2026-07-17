import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { BackupPreviewItem } from '../app/backup-export';
import type { BackupImportConflictChoice } from '../app/backup-import';
import type { BackupNotice } from '../app/backup-notice';
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
  readonly onChangeChoice: (choice: BackupImportConflictChoice) => void;
}

/** 既存 Profile がある場合だけ表示する、Profile 単位（per-profile granularity）の Conflict 選択。 */
function ConflictChoiceSection({
  choice,
  onChangeChoice,
}: ConflictChoiceSectionProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        すでに Local Profile があります。どちらを使いますか。
      </Text>
      <ActionButton
        accessibilityHint="既存の Local Profile をそのまま残し、読み込んだ内容を採用しません。"
        label={
          choice === 'keep-existing' ? '既存を残す（選択中）' : '既存を残す'
        }
        onPress={() => onChangeChoice('keep-existing')}
        variant={choice === 'keep-existing' ? 'primary' : 'secondary'}
      />
      <ActionButton
        accessibilityHint="既存の Local Profile を、読み込んだ内容で置き換えます。"
        label={
          choice === 'use-imported'
            ? '読み込んだ内容に置き換える（選択中）'
            : '読み込んだ内容に置き換える'
        }
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
  onChangeChoice,
  committing,
  notice,
  onCommit,
}: ParsedCandidateSectionProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>読み込む内容（Preview）</Text>
      <BackupPreviewList items={validation.items} />
      {hasExistingProfile ? (
        <ConflictChoiceSection
          choice={choice}
          onChangeChoice={onChangeChoice}
        />
      ) : null}
      <BackupNoticeBanner notice={notice} />
      <ActionButton
        accessibilityHint="選択した内容を端末内 Storage へ Atomic に Commit します。失敗時は既存の Profile を保ちます。"
        disabled={committing}
        label={committing ? 'Commit 中' : 'この内容を Commit する'}
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
  onChangeChoice,
  committing,
  notice,
  onCommit,
  onOpenExport,
  onBack,
}: BackupImportScreenProps) {
  return (
    <AppScreen
      description="Export した JSON を貼り付けてください。GitHub Token など認証情報の入力欄はありません。"
      eyebrow="Backup / Import"
      title="JSON バックアップを読み込む。"
    >
      <View style={styles.field}>
        <Text style={styles.label}>バックアップ JSON（貼り付け）</Text>
        <TextInput
          accessibilityHint={`最大 ${BACKUP_MAX_BYTES} byte までの JSON を貼り付けます。`}
          accessibilityLabel="バックアップ JSON"
          multiline
          onChangeText={onChangeRawInput}
          placeholder='{"backupSchemaVersion": 2, ...}'
          style={styles.input}
          value={rawInput}
        />
      </View>
      <ActionButton
        accessibilityHint="貼り付けた JSON を strict schema で検証し、Preview を表示します。"
        disabled={rawInput.length === 0}
        label="内容を確認する（Preview / Validation）"
        onPress={onValidate}
      />

      {validation?.kind === 'rejected' ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>読み込めませんでした。</Text>
          <Text style={styles.errorText}>{validation.message}</Text>
          <Text style={styles.errorText}>
            既存の Local Profile は変更していません。
          </Text>
        </View>
      ) : null}

      {validation?.kind === 'parsed' ? (
        <ParsedCandidateSection
          choice={choice}
          committing={committing}
          hasExistingProfile={hasExistingProfile}
          notice={notice}
          onChangeChoice={onChangeChoice}
          onCommit={onCommit}
          validation={validation}
        />
      ) : null}

      <ActionButton
        label="Export 画面へ戻る"
        onPress={onOpenExport}
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
