import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ProfileNotice } from '../app/profile-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import LanguageSelector from '../components/LanguageSelector';
import PetEmojiSelector from '../components/PetEmojiSelector';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import {
  OWNER_ALIAS_MAX_LENGTH,
  PET_NAME_MAX_LENGTH,
  type PetEmoji,
  PROFILE_MAX_CLUES,
} from '../domain/passport';
import { colors, spacing } from '../ui/theme';

interface PassportCreationScreenProps {
  readonly petName: string;
  readonly petEmoji: PetEmoji;
  readonly ownerAlias: string;
  readonly selectedIds: readonly ClueId[];
  readonly languageCodes: readonly LanguageCode[];
  readonly notice: ProfileNotice;
  readonly saving: boolean;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onChangeOwnerAlias: (value: string) => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleLanguage: (code: LanguageCode) => void;
  readonly onSave: () => void;
}

const NOTICE_TITLES: Record<ProfileNotice['kind'], string> = {
  empty: '保存済み Profile はありません。',
  restored: 'Local Profile を復元しました。',
  'validation-error': '入力を確認してください。',
  'save-error': '保存に失敗しました。',
  'storage-unavailable': '端末内 Storage を利用できません。',
  'invalid-data': '端末内の保存データが不正です。',
  'read-error': '保存済み Profile を読み込めません。',
};

function Notice({ notice }: { readonly notice: ProfileNotice }) {
  const isError = !['empty', 'restored'].includes(notice.kind);
  return (
    <View
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.notice, isError ? styles.errorNotice : undefined]}
    >
      <Text style={styles.noticeTitle}>{NOTICE_TITLES[notice.kind]}</Text>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}

export default function PassportCreationScreen({
  petName,
  petEmoji,
  ownerAlias,
  selectedIds,
  languageCodes,
  notice,
  saving,
  onChangePetName,
  onSelectPetEmoji,
  onChangeOwnerAlias,
  onToggleClue,
  onToggleLanguage,
  onSave,
}: PassportCreationScreenProps) {
  return (
    <AppScreen
      eyebrow="Step 1 / Local Profile"
      title="アカウントなしで Pet を準備する。"
      description="入力は明示保存するまで端末へ残りません。氏名、メール、電話、住所、会社名、機密情報は入力しないでください。"
    >
      <Notice notice={notice} />
      <View style={styles.field}>
        <Text nativeID="pet-name-label" style={styles.label}>
          Pet Name（必須）
        </Text>
        <TextInput
          accessibilityLabel="Pet Name"
          accessibilityHint={`${PET_NAME_MAX_LENGTH} 文字以下の Pet の表示名を入力します。`}
          maxLength={PET_NAME_MAX_LENGTH}
          onChangeText={onChangePetName}
          placeholder="例: こむぎ"
          style={styles.input}
          value={petName}
        />
        <Text style={styles.limit}>
          {petName.length} / {PET_NAME_MAX_LENGTH}
          。機密情報を入力しないでください。
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Pet Emoji（6 種類から 1 件）</Text>
        <PetEmojiSelector selected={petEmoji} onSelect={onSelectPetEmoji} />
      </View>
      <View style={styles.field}>
        <Text nativeID="owner-alias-label" style={styles.label}>
          Owner Alias（任意、本名不要）
        </Text>
        <TextInput
          accessibilityLabel="Owner Alias、任意"
          accessibilityHint={`${OWNER_ALIAS_MAX_LENGTH} 文字以下の呼び名を入力します。空でも保存できます。`}
          maxLength={OWNER_ALIAS_MAX_LENGTH}
          onChangeText={onChangeOwnerAlias}
          placeholder="空のままで構いません"
          style={styles.input}
          value={ownerAlias}
        />
        <Text style={styles.limit}>
          {ownerAlias.length} / {OWNER_ALIAS_MAX_LENGTH}
          。本名や連絡先を入力しないでください。
        </Text>
      </View>
      <View style={styles.counterRow}>
        <Text style={styles.sectionTitle}>会話の材料</Text>
        <Text style={styles.counter}>
          {selectedIds.length} / {PROFILE_MAX_CLUES}
        </Text>
      </View>
      <Text style={styles.limit}>
        Topics 3 件、Offer 3 件、Looking For 3 件、Goal 1
        件までです。カタログ外の機密情報は入力できません。
      </Text>
      <ClueSelector
        enforceFieldLimits
        maximum={PROFILE_MAX_CLUES}
        onToggle={onToggleClue}
        selectedIds={selectedIds}
      />
      <View style={styles.field}>
        <Text style={styles.sectionTitle}>Languages（3 件まで）</Text>
        <Text style={styles.limit}>
          同梱カタログから選びます。機密情報を入力する欄ではありません。
        </Text>
        <LanguageSelector
          onToggle={onToggleLanguage}
          selectedCodes={languageCodes}
        />
      </View>
      <ActionButton
        accessibilityHint="検証済みの Local Profile をこの端末だけに保存します。"
        disabled={saving}
        label={saving ? '端末内に保存中' : 'Local Profile を端末内に明示保存'}
        onPress={onSave}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorNotice: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
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
});
