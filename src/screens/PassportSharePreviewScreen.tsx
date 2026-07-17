import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  PassportPreviewItem,
  PassportShareSelection,
} from '../app/passport-share';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import {
  type ClueId,
  clueById,
  LANGUAGE_CATALOG,
  type LanguageCode,
} from '../domain/clue-catalog';
import type { LocalPrivateProfile } from '../domain/passport';
import { PUBLIC_PASSPORT_MAX_CLUES } from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface PassportSharePreviewScreenProps {
  readonly profile: LocalPrivateProfile;
  readonly selection: PassportShareSelection;
  readonly previewItems: readonly PassportPreviewItem[] | null;
  readonly validationMessage: string | null;
  readonly onTogglePetName: () => void;
  readonly onTogglePetEmoji: () => void;
  readonly onToggleOwnerAlias: () => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleLanguage: (code: LanguageCode) => void;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

interface ToggleRowProps {
  readonly label: string;
  readonly value: string;
  readonly enabled: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}

function ToggleRow({
  label,
  value,
  enabled,
  disabled = false,
  onToggle,
}: ToggleRowProps) {
  return (
    <Pressable
      accessibilityLabel={`${label}、${value}、今回の共有 ${enabled ? 'ON' : 'OFF'}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.toggle,
        enabled ? styles.toggleEnabled : undefined,
        disabled ? styles.toggleDisabled : undefined,
        pressed ? styles.pressed : undefined,
      ]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleValue}>{value}</Text>
      </View>
      <Text style={styles.toggleState}>{enabled ? 'ON' : 'OFF'}</Text>
    </Pressable>
  );
}

export default function PassportSharePreviewScreen({
  profile,
  selection,
  previewItems,
  validationMessage,
  onTogglePetName,
  onTogglePetEmoji,
  onToggleOwnerAlias,
  onToggleClue,
  onToggleLanguage,
  onStart,
  onBack,
}: PassportSharePreviewScreenProps) {
  const clueMaximumReached =
    selection.clueIds.length >= PUBLIC_PASSPORT_MAX_CLUES;
  return (
    <AppScreen
      eyebrow="Step 3 / Share Preview"
      title="今回だけ共有する内容を確認する。"
      description="ON の項目だけが同じ Public Passport として QR / Peer Payload に入ります。Local Profile 全体は共有しません。"
    >
      <View accessibilityRole="summary" style={styles.warning}>
        <Text style={styles.warningTitle}>
          機密情報を共有しないでください。
        </Text>
        <Text style={styles.warningText}>
          Pet Name と会話材料 1 件以上が必須です。その他は項目単位で OFF
          にできます。
        </Text>
      </View>
      <Text style={styles.sectionTitle}>今回の共有 ON / OFF</Text>
      <ToggleRow
        enabled={selection.includePetName}
        label="Pet Name"
        onToggle={onTogglePetName}
        value={profile.petName}
      />
      <ToggleRow
        enabled={selection.includePetEmoji}
        label="Pet Emoji"
        onToggle={onTogglePetEmoji}
        value={profile.petEmoji}
      />
      {profile.ownerAlias ? (
        <ToggleRow
          enabled={selection.includeOwnerAlias}
          label="Owner Alias"
          onToggle={onToggleOwnerAlias}
          value={profile.ownerAlias}
        />
      ) : null}
      {profile.candidateClues.map((clue) => {
        const definition = clueById(clue.value);
        const enabled = selection.clueIds.includes(clue.value);
        return (
          <ToggleRow
            disabled={
              !clue.selectedForPassport || (clueMaximumReached && !enabled)
            }
            enabled={enabled}
            key={clue.value}
            label={definition.passportField}
            onToggle={() => onToggleClue(clue.value)}
            value={definition.label}
          />
        );
      })}
      {profile.languages.map((language) => (
        <ToggleRow
          enabled={selection.languageCodes.includes(language)}
          key={language}
          label="Language"
          onToggle={() => onToggleLanguage(language)}
          value={LANGUAGE_CATALOG[language].label}
        />
      ))}
      {validationMessage ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>Validation Error</Text>
          <Text style={styles.errorText}>{validationMessage}</Text>
        </View>
      ) : null}
      {previewItems ? (
        <View accessibilityRole="summary" style={styles.preview}>
          <Text style={styles.previewTitle}>QR / Peer Payload Preview</Text>
          {previewItems.map((item) => (
            <View key={item.key} style={styles.previewRow}>
              <Text style={styles.previewLabel}>{item.label}</Text>
              <Text style={styles.previewValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <ActionButton
        accessibilityHint="Preview と同じ Public Passport を投影して Lounge を開始します。"
        disabled={!previewItems}
        label="この Public Passport で Lounge に参加"
        onPress={onStart}
      />
      <ActionButton
        label="相手の公開内容へ戻る"
        onPress={onBack}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  warning: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.primary,
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
  toggle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 58,
    padding: spacing.md,
  },
  toggleEnabled: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  toggleDisabled: {
    opacity: 0.46,
  },
  pressed: {
    opacity: 0.72,
  },
  toggleText: {
    flex: 1,
    gap: 3,
  },
  toggleLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  toggleValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleState: {
    color: colors.primary,
    fontSize: 12,
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
  preview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  previewRow: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 3,
    paddingTop: spacing.sm,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  previewValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
});
