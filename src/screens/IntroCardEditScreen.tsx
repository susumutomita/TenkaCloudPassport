import { useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DEFAULT_LOCALE, type Locale } from '../app/i18n/locale';
import { MESSAGES } from '../app/i18n/messages';
import type { IntroCardNotice } from '../app/intro-card-notice';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import {
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
} from '../domain/intro-card';
import { QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
import { nonEmptyLinkCount } from './intro-card-links';

export interface IntroCardEditScreenProps {
  readonly name: string;
  readonly title: string;
  readonly organization: string;
  readonly selfIntro: string;
  readonly email: string;
  readonly phone: string;
  readonly linkX: string;
  readonly linkGithub: string;
  readonly linkLinkedin: string;
  readonly linkPortfolio: string;
  readonly otherLinks: readonly string[];
  readonly notice: IntroCardNotice;
  readonly saving: boolean;
  readonly cardUrlByteUsage: number;
  readonly locale?: Locale;
  readonly onChangeName: (value: string) => void;
  readonly onChangeTitle: (value: string) => void;
  readonly onChangeOrganization: (value: string) => void;
  readonly onChangeSelfIntro: (value: string) => void;
  readonly onChangeEmail: (value: string) => void;
  readonly onChangePhone: (value: string) => void;
  readonly onChangeLinkX: (value: string) => void;
  readonly onChangeLinkGithub: (value: string) => void;
  readonly onChangeLinkLinkedin: (value: string) => void;
  readonly onChangeLinkPortfolio: (value: string) => void;
  readonly onChangeOtherLink: (index: number, value: string) => void;
  readonly onAddOtherLink: () => void;
  readonly onRemoveOtherLink: (index: number) => void;
  readonly onSave: () => void;
  readonly onOpenBackup: () => void;
  readonly onOpenSettings: () => void;
}

function Notice({
  notice,
  locale,
}: {
  readonly notice: IntroCardNotice;
  readonly locale: Locale;
}) {
  const isError = !['empty', 'saved'].includes(notice.kind);
  const title = MESSAGES[locale].introCard.noticeTitles[notice.kind];
  return (
    <View
      accessibilityRole={isError ? 'alert' : 'summary'}
      style={[styles.notice, isError ? styles.errorNotice : undefined]}
    >
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}

/**
 * Issue 90: 単一行入力（名前・肩書き・所属・メール・電話・各名前付きリンク・
 * 自由リンク行）の return キーで次の欄へフォーカスを移す。`useRef` は
 * key（フィールド名 / `otherLink-<index>`）で引く map にし、自由リンクの
 * 行数が動的に変わっても同じ仕組みで最後の 1 行だけ `done` + 明示
 * `Keyboard.dismiss()` にできるようにする。`submitBehavior="submit"` を
 * チェーン対象の全単一行入力に固定し、フォーカス移動時のキーボード点滅を防ぐ
 * （最後の欄は `submitBehavior` の値に関係なく明示 `Keyboard.dismiss()` で閉じる）。
 */
function useFieldFocusChain() {
  const fieldRefs = useRef<Record<string, TextInput | null>>({});

  function registerFieldRef(key: string) {
    return (instance: TextInput | null) => {
      fieldRefs.current[key] = instance;
    };
  }

  function focusOrDismiss(nextKey: string | undefined): void {
    if (nextKey === undefined) {
      Keyboard.dismiss();
      return;
    }
    fieldRefs.current[nextKey]?.focus();
  }

  return { registerFieldRef, focusOrDismiss };
}

/**
 * code-reviewer 指摘（high）: 自由リンク行の React `key` を配列 index にすると、
 * 削除時に「削除した行」ではなく「削除前の最後の行」が unmount され、
 * 別の行を編集・フォーカス中に途中の行を削除すると意図しないタイミングで
 * フォーカスやキーボードが失われうる（`AppScreen` は
 * `keyboardShouldPersistTaps="handled"` のため、入力中でも削除ボタンの
 * `onPress` 自体は発火できる）。行の見た目上の `value` は空欄・重複がありえて
 * 同一性の代わりには使えないため、追加・削除イベントに同期して発行する
 * mount 内不変の行 id をこの component だけで管理する
 * （`intro-card-links.ts` の公開シェイプ・`PassportApp.tsx` の state 形は
 * どちらも変えない、画面 component 内で完結する対応）。
 */
function useOtherLinkRowIds(initialOtherLinks: readonly string[]) {
  const nextRowNumberRef = useRef(0);

  function nextRowId(): string {
    nextRowNumberRef.current += 1;
    return `row-${nextRowNumberRef.current}`;
  }

  const rowIdsRef = useRef<string[] | null>(null);
  if (rowIdsRef.current === null) {
    rowIdsRef.current = initialOtherLinks.map(() => nextRowId());
  }

  function appendRowId(): void {
    rowIdsRef.current = [...(rowIdsRef.current ?? []), nextRowId()];
  }

  function removeRowIdAt(index: number): void {
    rowIdsRef.current = (rowIdsRef.current ?? []).filter((_, i) => i !== index);
  }

  return { rowIds: rowIdsRef.current, appendRowId, removeRowIdAt };
}

/**
 * 自己紹介カードピボット Step 1（Issue 79）の作成・編集画面。Issue 90 で、
 * リンク欄を「1 行 1 リンクの改行区切り textarea」から「X / GitHub /
 * LinkedIn / Portfolio の名前付き単一行入力 4 つ + 自由リンクの動的追加」へ
 * 変更した。正規化・件数計算は `./intro-card-links` の純粋関数へ切り出し、
 * `IntroCard.links: readonly string[]`（最大 5 件）という domain 契約は
 * 変えない（配列への組み立ては呼び出し側の `PassportApp.tsx` が担う）。
 */
export default function IntroCardEditScreen({
  name,
  title,
  organization,
  selfIntro,
  email,
  phone,
  linkX,
  linkGithub,
  linkLinkedin,
  linkPortfolio,
  otherLinks,
  notice,
  saving,
  cardUrlByteUsage,
  locale = DEFAULT_LOCALE,
  onChangeName,
  onChangeTitle,
  onChangeOrganization,
  onChangeSelfIntro,
  onChangeEmail,
  onChangePhone,
  onChangeLinkX,
  onChangeLinkGithub,
  onChangeLinkLinkedin,
  onChangeLinkPortfolio,
  onChangeOtherLink,
  onAddOtherLink,
  onRemoveOtherLink,
  onSave,
  onOpenBackup,
  onOpenSettings,
}: IntroCardEditScreenProps) {
  const t = MESSAGES[locale].introCard;
  const common = MESSAGES[locale].common;
  const overBudget = cardUrlByteUsage > QR_ENCODER_MAX_BYTES;
  const linkCount = nonEmptyLinkCount({
    x: linkX,
    github: linkGithub,
    linkedin: linkLinkedin,
    portfolio: linkPortfolio,
    otherLinks,
  });
  const canAddOtherLink = linkCount < INTRO_CARD_MAX_LINKS;
  // code-reviewer 指摘: 追加時にしか上限を強制していないため、既に追加済みの
  // 空欄へ入力した結果 5 件を超えるケースがある。保存時に汎用エラーで初めて
  // 気づくと分かりにくいため、byte 予算超過（`overBudget`）と同じ見た目で
  // 上限超過を可視化する。
  const overLinkCount = linkCount > INTRO_CARD_MAX_LINKS;

  const { registerFieldRef, focusOrDismiss } = useFieldFocusChain();
  const { rowIds, appendRowId, removeRowIdAt } = useOtherLinkRowIds(otherLinks);
  const afterPortfolioKey = otherLinks.length > 0 ? 'otherLink-0' : undefined;

  function handleSave(): void {
    Keyboard.dismiss();
    onSave();
  }

  function handleAddOtherLink(): void {
    appendRowId();
    onAddOtherLink();
  }

  function handleRemoveOtherLink(index: number): void {
    removeRowIdAt(index);
    onRemoveOtherLink(index);
  }

  return (
    <AppScreen
      description={t.editDescription}
      eyebrow={t.editEyebrow}
      keyboardDismissMode="on-drag"
      title={t.editTitle}
    >
      <Notice locale={locale} notice={notice} />
      <View style={styles.field}>
        <Text style={styles.label}>{t.nameLabel}</Text>
        <TextInput
          accessibilityHint={t.nameHint(INTRO_CARD_NAME_MAX_LENGTH)}
          accessibilityLabel={t.nameAccessibilityLabel}
          submitBehavior="submit"
          maxLength={INTRO_CARD_NAME_MAX_LENGTH}
          onChangeText={onChangeName}
          onSubmitEditing={() => focusOrDismiss('title')}
          placeholder={t.namePlaceholder}
          ref={registerFieldRef('name')}
          returnKeyType="next"
          style={styles.input}
          value={name}
        />
        <Text style={styles.limit}>
          {t.nameCounter(name.length, INTRO_CARD_NAME_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.titleLabel}</Text>
        <TextInput
          submitBehavior="submit"
          maxLength={INTRO_CARD_TITLE_MAX_LENGTH}
          onChangeText={onChangeTitle}
          onSubmitEditing={() => focusOrDismiss('organization')}
          placeholder={t.titlePlaceholder}
          ref={registerFieldRef('title')}
          returnKeyType="next"
          style={styles.input}
          value={title}
        />
        <Text style={styles.limit}>
          {t.titleCounter(title.length, INTRO_CARD_TITLE_MAX_LENGTH)}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.organizationLabel}</Text>
        <TextInput
          submitBehavior="submit"
          maxLength={INTRO_CARD_ORGANIZATION_MAX_LENGTH}
          onChangeText={onChangeOrganization}
          onSubmitEditing={() => focusOrDismiss('selfIntro')}
          placeholder={t.organizationPlaceholder}
          ref={registerFieldRef('organization')}
          returnKeyType="next"
          style={styles.input}
          value={organization}
        />
        <Text style={styles.limit}>
          {t.organizationCounter(
            organization.length,
            INTRO_CARD_ORGANIZATION_MAX_LENGTH
          )}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.selfIntroLabel}</Text>
        <Text style={styles.limit}>{t.selfIntroHint}</Text>
        <TextInput
          maxLength={INTRO_CARD_SELF_INTRO_MAX_LENGTH}
          multiline
          onChangeText={onChangeSelfIntro}
          placeholder={t.selfIntroPlaceholder}
          ref={registerFieldRef('selfIntro')}
          style={[styles.input, styles.multilineInput]}
          value={selfIntro}
        />
        <Text style={styles.limit}>
          {t.selfIntroCounter(
            selfIntro.length,
            INTRO_CARD_SELF_INTRO_MAX_LENGTH
          )}
        </Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          submitBehavior="submit"
          keyboardType="email-address"
          onChangeText={onChangeEmail}
          onSubmitEditing={() => focusOrDismiss('phone')}
          placeholder={t.emailPlaceholder}
          ref={registerFieldRef('email')}
          returnKeyType="next"
          style={styles.input}
          value={email}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.phoneLabel}</Text>
        <TextInput
          submitBehavior="submit"
          keyboardType="phone-pad"
          onChangeText={onChangePhone}
          onSubmitEditing={() => focusOrDismiss('linkX')}
          placeholder={t.phonePlaceholder}
          ref={registerFieldRef('phone')}
          returnKeyType="next"
          style={styles.input}
          value={phone}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t.linksLabel}</Text>
        <Text style={styles.limit}>{t.linksHint}</Text>
        <View style={styles.linkField}>
          <Text style={styles.linkFieldLabel}>{t.linkXLabel}</Text>
          <TextInput
            autoCapitalize="none"
            submitBehavior="submit"
            onChangeText={onChangeLinkX}
            onSubmitEditing={() => focusOrDismiss('linkGithub')}
            placeholder={t.linkXPlaceholder}
            ref={registerFieldRef('linkX')}
            returnKeyType="next"
            style={styles.input}
            value={linkX}
          />
        </View>
        <View style={styles.linkField}>
          <Text style={styles.linkFieldLabel}>{t.linkGithubLabel}</Text>
          <TextInput
            autoCapitalize="none"
            submitBehavior="submit"
            onChangeText={onChangeLinkGithub}
            onSubmitEditing={() => focusOrDismiss('linkLinkedin')}
            placeholder={t.linkGithubPlaceholder}
            ref={registerFieldRef('linkGithub')}
            returnKeyType="next"
            style={styles.input}
            value={linkGithub}
          />
        </View>
        <View style={styles.linkField}>
          <Text style={styles.linkFieldLabel}>{t.linkLinkedinLabel}</Text>
          <TextInput
            autoCapitalize="none"
            submitBehavior="submit"
            onChangeText={onChangeLinkLinkedin}
            onSubmitEditing={() => focusOrDismiss('linkPortfolio')}
            placeholder={t.linkLinkedinPlaceholder}
            ref={registerFieldRef('linkLinkedin')}
            returnKeyType="next"
            style={styles.input}
            value={linkLinkedin}
          />
        </View>
        <View style={styles.linkField}>
          <Text style={styles.linkFieldLabel}>{t.linkPortfolioLabel}</Text>
          <TextInput
            autoCapitalize="none"
            submitBehavior="submit"
            keyboardType="url"
            onChangeText={onChangeLinkPortfolio}
            onSubmitEditing={() => focusOrDismiss(afterPortfolioKey)}
            placeholder={t.linkPortfolioPlaceholder}
            ref={registerFieldRef('linkPortfolio')}
            returnKeyType={afterPortfolioKey === undefined ? 'done' : 'next'}
            style={styles.input}
            value={linkPortfolio}
          />
        </View>
        {otherLinks.map((link, index) => {
          // ref/フォーカスチェーン用の key は現在の描画順（position）に対する
          // 一時的な参照名でよいが、React の `key` prop は
          // `rowIds[index]`（mount 以降不変）を使い、削除時に別の行の
          // TextInput が誤ってアンマウントされないようにする
          // （code-reviewer 指摘、上の `useOtherLinkRowIds` を参照）。
          const refKey = `otherLink-${index}`;
          const nextRefKey =
            index + 1 < otherLinks.length
              ? `otherLink-${index + 1}`
              : undefined;
          return (
            <View key={rowIds[index] ?? refKey} style={styles.otherLinkRow}>
              <TextInput
                autoCapitalize="none"
                submitBehavior="submit"
                keyboardType="url"
                onChangeText={(value) => onChangeOtherLink(index, value)}
                onSubmitEditing={() => focusOrDismiss(nextRefKey)}
                placeholder={t.otherLinkPlaceholder}
                ref={registerFieldRef(refKey)}
                returnKeyType={nextRefKey === undefined ? 'done' : 'next'}
                style={[styles.input, styles.otherLinkInput]}
                value={link}
              />
              <Pressable
                accessibilityLabel={t.removeLinkButtonLabel(index + 1)}
                accessibilityRole="button"
                onPress={() => handleRemoveOtherLink(index)}
                style={styles.removeLinkButton}
              >
                <Text style={styles.removeLinkButtonGlyph}>×</Text>
              </Pressable>
            </View>
          );
        })}
        <ActionButton
          accessibilityHint={t.addLinkButtonHint}
          disabled={!canAddOtherLink}
          label={t.addLinkButton}
          onPress={handleAddOtherLink}
          variant="secondary"
        />
        <Text style={overLinkCount ? styles.byteUsageOverBudget : styles.limit}>
          {t.linksCounter(linkCount, INTRO_CARD_MAX_LINKS)}
        </Text>
      </View>
      <Text style={overBudget ? styles.byteUsageOverBudget : styles.limit}>
        {overBudget
          ? t.byteUsageOverBudget(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)
          : t.byteUsageLabel(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)}
      </Text>
      <ActionButton
        accessibilityHint={t.saveButtonHint}
        disabled={saving}
        label={t.saveButton(saving)}
        onPress={handleSave}
      />
      <ActionButton
        accessibilityHint={MESSAGES[locale].passportCreation.backupButtonHint}
        disabled={saving}
        label={MESSAGES[locale].passportCreation.backupButton}
        onPress={onOpenBackup}
        variant="secondary"
      />
      <ActionButton
        accessibilityHint={common.settingsButtonHint}
        disabled={saving}
        label={common.settingsButton}
        onPress={onOpenSettings}
        variant="secondary"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  errorNotice: {
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  limit: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  byteUsageOverBudget: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  linkField: {
    gap: spacing.xs,
  },
  linkFieldLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  otherLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  otherLinkInput: {
    flex: 1,
  },
  removeLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
  },
  removeLinkButtonGlyph: {
    color: colors.danger,
    fontSize: 22,
    fontWeight: '700',
  },
});
