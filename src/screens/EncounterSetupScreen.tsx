import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import PetEmojiSelector from '../components/PetEmojiSelector';
import type { ClueId } from '../domain/clue-catalog';
import {
  PET_NAME_MAX_LENGTH,
  type PetEmoji,
  PUBLIC_PASSPORT_MAX_CLUES,
} from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface EncounterSetupScreenProps {
  readonly privatePetName: string;
  readonly privateClueCount: number;
  readonly encounteredPetName: string;
  readonly encounteredPetEmoji: PetEmoji;
  readonly selectedIds: readonly ClueId[];
  readonly confirmed: boolean;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onToggle: (id: ClueId) => void;
  readonly onToggleConfirmed: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly errorMessage: string | null;
}

export default function EncounterSetupScreen({
  privatePetName,
  privateClueCount,
  encounteredPetName,
  encounteredPetEmoji,
  selectedIds,
  confirmed,
  onChangePetName,
  onSelectPetEmoji,
  onToggle,
  onToggleConfirmed,
  onContinue,
  onBack,
  errorMessage,
}: EncounterSetupScreenProps) {
  return (
    <AppScreen
      eyebrow="Step 2 / Encounter"
      title="相手が公開した手掛かりを受け取る。"
      description="実在する相手がこの場で公開した項目だけを入力します。氏名、連絡先、位置情報、機密情報は入力しないでください。"
    >
      <View accessibilityRole="summary" style={styles.summary}>
        <Text style={styles.summaryLabel}>この端末の Local Profile</Text>
        <Text style={styles.summaryValue}>
          {privatePetName}・候補 {privateClueCount} 件
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>相手の Pet Name</Text>
        <TextInput
          accessibilityLabel="相手の Pet Name"
          accessibilityHint={`${PET_NAME_MAX_LENGTH} 文字以下で、相手が公開した Pet Name を入力します。`}
          maxLength={PET_NAME_MAX_LENGTH}
          onChangeText={onChangePetName}
          placeholder="相手が公開した Pet Name"
          style={styles.input}
          value={encounteredPetName}
        />
        <Text style={styles.limit}>
          {encounteredPetName.length} / {PET_NAME_MAX_LENGTH}
          。機密情報を入力しないでください。
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>相手の Pet Emoji</Text>
        <PetEmojiSelector
          onSelect={onSelectPetEmoji}
          selected={encounteredPetEmoji}
        />
      </View>
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>相手の公開項目</Text>
        <Text style={styles.counter}>
          {selectedIds.length} / {PUBLIC_PASSPORT_MAX_CLUES}
        </Text>
      </View>
      <Text style={styles.limit}>
        カタログから最大 {PUBLIC_PASSPORT_MAX_CLUES}{' '}
        件です。自由記述の機密情報は入力できません。
      </Text>
      <ClueSelector
        maximum={PUBLIC_PASSPORT_MAX_CLUES}
        onToggle={onToggle}
        selectedIds={selectedIds}
      />
      <Pressable
        accessibilityLabel="相手が今回公開した内容であることを確認"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={onToggleConfirmed}
        style={({ pressed }) => [
          styles.confirmation,
          confirmed ? styles.confirmed : undefined,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <View style={[styles.checkbox, confirmed ? styles.checked : undefined]}>
          {confirmed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.confirmationText}>
          相手が現在の Lounge で公開した内容だと確認しました。
        </Text>
      </Pressable>
      {errorMessage ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorTitle}>Validation Error</Text>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      ) : null}
      <ActionButton
        accessibilityHint="自分が今回共有する項目の最終 Preview へ進みます。"
        disabled={
          encounteredPetName.trim().length === 0 ||
          selectedIds.length === 0 ||
          !confirmed
        }
        label="今回の共有 Preview へ"
        onPress={onContinue}
      />
      <ActionButton
        label="Local Profile を編集"
        onPress={onBack}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    gap: spacing.xs,
    padding: spacing.md,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  field: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  limit: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  counterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  counter: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  confirmation: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  confirmed: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.72,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  confirmationText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
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
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
