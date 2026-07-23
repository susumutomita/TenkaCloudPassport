import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { isEmptyIntroCardDraft } from '../app/intro-card-storage';
import ActionButton from '../components/ActionButton';
import AppScreen from '../components/AppScreen';
import ClueSelector from '../components/ClueSelector';
import SettingsLinkFooter from '../components/SettingsLinkFooter';
import type { ClueId } from '../domain/clue-catalog';
import {
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_MAX_THEMES,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
  type IntroCardField,
  validateIntroCardFieldValue,
} from '../domain/intro-card';
import { QR_ENCODER_MAX_BYTES } from '../qr/encoder';
import { colors, spacing } from '../ui/theme';
import { MIN_TOUCH_TARGET } from '../ui/touch-target';
import IntroCardPreview from './IntroCardPreview';
import {
  buildIntroCardLinks,
  type IntroCardLinkFieldKey,
  normalizedLinkFieldValue,
} from './intro-card-links';

/**
 * Issue 92: 保存失敗時に focus・直下エラー表示の対象にする入力欄の識別子。
 * 名前・肩書き・所属・自己紹介・メール・電話は `IntroCardField`
 * （`src/domain/intro-card.ts`）から `Exclude` で導出し（手で列挙し直すと
 * `IntroCardField` が変わったときに drift しうる、code-reviewer 指摘）、
 * リンク系は `IntroCardLinkFieldKey`（`intro-card-links.ts`）を再利用する
 * （domain から見ると `links` は単一フィールドだが、画面には複数の
 * 名前付き欄があるため、それだけは別の型に置き換える）。
 */
export type IntroCardEditFieldKey =
  | Exclude<IntroCardField, 'links'>
  | IntroCardLinkFieldKey;

function isIntroCardLinkFieldKey(
  key: IntroCardEditFieldKey
): key is IntroCardLinkFieldKey {
  return (
    key === 'linkX' ||
    key === 'linkGithub' ||
    key === 'linkLinkedin' ||
    key === 'linkPortfolio' ||
    key.startsWith('otherLink-')
  );
}

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
  /**
   * Issue 104 / ADR-0036: 端末内会話エージェントが使う会話テーマ
   * （`clue-catalog.ts` 再利用、最大 `INTRO_CARD_MAX_THEMES` 件）。
   * `ClueSelector`（`PassportCreationScreen` と同じ component）で選ぶ。
   */
  readonly themeIds: readonly ClueId[];
  readonly notice: IntroCardNotice;
  /**
   * Issue 92: 保存失敗の原因になった 1 欄（`PassportApp.tsx` が保存時点の
   * draft から解決済み）。この欄へ focus し、直下にエラーメッセージを表示する。
   */
  readonly errorFieldKey: IntroCardEditFieldKey | undefined;
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
  readonly onToggleThemeId: (id: ClueId) => void;
  readonly onSave: () => void;
  readonly onChangeLocale: (locale: Locale) => void;
  /**
   * Issue 130（Codex 指摘 blocker）: #127 が外した Settings 導線を復活させる。
   * カード保存前（初回起動時等）もクイズ・診断・モデル管理へ到達できるよう、
   * `IntroCardScreen` と同じ導線をここにも持つ（`IntroCardScreen.tsx` 参照）。
   */
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
 * Issue 92: 保存失敗の原因になった欄の直下に、上部 Notice と同じ message を
 * 表示する。上部 Notice（`storage-unavailable` 等、フィールド非依存のエラーは
 * 引き続きそちらだけで案内する）と重複するが、長いフォームのどこが悪いかを
 * 探す手間を減らすトレードオフとして許容する（Plan.md 設計節）。
 */
function FieldError({ message }: { readonly message: string | null }) {
  if (message === null) return null;
  return (
    <Text accessibilityRole="alert" style={styles.dangerCaption}>
      {message}
    </Text>
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
  // Issue 93 の altitude レビュー指摘: 保存失敗時に focus したい欄が、
  // 折りたたまれた任意項目セクションの中にあってまだ mount されていない
  // ケースがある（`optionalSectionExpanded` が自動的に `true` へ変わっても、
  // 対象欄の `TextInput` が実際に mount されるのは次の commit）。前回は
  // フォーカス用 `useEffect` の依存配列に `optionalSectionExpanded` を
  // （本体では読まないまま）追加し、展開後の再実行に賭ける対症療法だった。
  // 根本対応として、「まだ mount されていない focus 対象」を覚えておき、
  // `registerFieldRef` の ref callback（＝実際に mount された瞬間）で
  // focus する仕組みに一般化する。これにより、mount タイミングに関する
  // 前提を呼び出し側（画面の `useEffect` 群）に一切持たせずに済む。
  const pendingFocusKeyRef = useRef<string | undefined>(undefined);

  // simplify レビュー指摘: `registerFieldRef`・`focusOrDismiss` を毎 render
  // 新しい関数として作ると、Issue 92 の保存失敗 focus 用 `useEffect` の依存配列に
  // `focusOrDismiss` を含めた際、他の欄への入力（無関係な再 render）のたびに
  // effect 本体が再実行されてしまう。`fieldRefs`（`useRef`、参照が安定）だけを
  // 閉じ込めるため `useCallback` で安定化し、根本から解消する（対症療法の
  // 追加 ref ガードを effect 側に持たせない）。
  const registerFieldRef = useCallback(
    (key: string) => (instance: TextInput | null) => {
      fieldRefs.current[key] = instance;
      if (instance && pendingFocusKeyRef.current === key) {
        pendingFocusKeyRef.current = undefined;
        instance.focus();
      }
    },
    []
  );

  const focusOrDismiss = useCallback((nextKey: string | undefined): void => {
    if (nextKey === undefined) {
      pendingFocusKeyRef.current = undefined;
      Keyboard.dismiss();
      return;
    }
    const instance = fieldRefs.current[nextKey];
    if (instance) {
      pendingFocusKeyRef.current = undefined;
      instance.focus();
      return;
    }
    // 対象欄がまだ mount されていない。展開等で実際に mount された瞬間に
    // `registerFieldRef` の ref callback が focus する（上記）。
    pendingFocusKeyRef.current = nextKey;
  }, []);

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
 * Issue 93 で、名前だけの即時生成を段階的開示（任意項目セクションの折りたたみ）・
 * 名前欄直下のライブプレビュー・保存前の onBlur バリデーション・
 * sticky footer（`AppScreen` の `footer` prop）で成立させる。新しい Stage・
 * 新しい Screen ファイルは増やさず、この 1 画面の中で完結させる
 * （`docs/design/2026-07-22-intro-card-creation-flow.md` 案 B）。
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
  themeIds,
  notice,
  errorFieldKey,
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
  onToggleThemeId,
  onSave,
  onChangeLocale,
  onOpenSettings,
}: IntroCardEditScreenProps) {
  const t = MESSAGES[locale].introCard;
  const overBudget = cardUrlByteUsage > QR_ENCODER_MAX_BYTES;
  // Issue 93 の simplify/efficiency レビュー指摘: 以前は `nonEmptyLinkCount`
  // 用の `linksDraft` object literal と、ライブプレビュー用 `useMemo` の中で
  // 同じ 5 フィールドをもう 1 度組み立て直しており、`buildIntroCardLinks`
  // （正規化 + trim + filter）を毎 render 2 回実行していた。1 つの
  // `useMemo` へ統合し、`linkCount` もその結果（`previewLinks.length`）から
  // 導出することで、二重計算と二重の object literal をどちらも解消する。
  const previewLinks = useMemo(
    () =>
      buildIntroCardLinks({
        x: linkX,
        github: linkGithub,
        linkedin: linkLinkedin,
        portfolio: linkPortfolio,
        otherLinks,
      }),
    [linkX, linkGithub, linkLinkedin, linkPortfolio, otherLinks]
  );
  const linkCount = previewLinks.length;
  const canAddOtherLink = linkCount < INTRO_CARD_MAX_LINKS;
  // code-reviewer 指摘: 追加時にしか上限を強制していないため、既に追加済みの
  // 空欄へ入力した結果 5 件を超えるケースがある。保存時に汎用エラーで初めて
  // 気づくと分かりにくいため、byte 予算超過（`overBudget`）と同じ見た目で
  // 上限超過を可視化する。
  const overLinkCount = linkCount > INTRO_CARD_MAX_LINKS;

  const { registerFieldRef, focusOrDismiss } = useFieldFocusChain();
  const { rowIds, appendRowId, removeRowIdAt } = useOtherLinkRowIds(otherLinks);
  const afterPortfolioKey = otherLinks.length > 0 ? 'otherLink-0' : undefined;

  // Issue 93: 任意項目セクションの開閉。初期値は mount 時点の値だけで決め
  // （lazy initializer）、その後の入力で自動的に閉じ直すことはない
  // （一度開いたら、任意項目を全部消してもユーザーの意図で閉じている状態と
  // 区別できないため、閉じ直さない方が驚きが少ない）。
  // Issue 93 の simplify レビュー指摘: 「任意項目のどれか 1 つでも値があるか」は
  // `IntroCardDraftFields`（`../app/intro-card-storage`）が既に持つ
  // `isEmptyIntroCardDraft` と同じ形の判定（10 フィールドの空判定）であり、
  // 画面層で別の型・別のロジックとして再実装しない。`name` は判定対象外
  // （名前だけの新規作成でも任意項目は閉じたままにしたい）のため、空文字で
  // 上書きしてから渡す。
  const [optionalSectionExpanded, setOptionalSectionExpanded] = useState(
    () =>
      !isEmptyIntroCardDraft({
        name: '',
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
      })
  );
  // code-reviewer 指摘（Issue 93）: 名前欄の return キーは無条件で 'title' へ
  // focus を移していたが、任意項目セクションが折りたたまれている（真っさらな
  // 新規作成の既定状態）ときは `title` の `TextInput` が mount されておらず
  // `focusOrDismiss('title')` が無音の no-op になり、return キーを押しても
  // 何も起きなかった。セクションが閉じているときは最後の欄として扱い
  // `focusOrDismiss(undefined)`（Keyboard.dismiss）にフォールバックする。
  const afterNameKey = optionalSectionExpanded ? 'title' : undefined;

  // Issue 93: 保存前（onBlur）の欄単位バリデーション結果。key が存在すれば
  // （値が null でも）、保存時のエラーより優先して表示する。新しい保存結果
  // （成功・失敗を問わない）が来るたびにリセットする。
  const [liveFieldErrors, setLiveFieldErrors] = useState<
    Partial<Record<IntroCardEditFieldKey, string | null>>
  >({});

  function handleFieldBlur(key: IntroCardEditFieldKey, rawValue: string): void {
    const message = isIntroCardLinkFieldKey(key)
      ? validateIntroCardFieldValue({
          field: 'links',
          value: normalizedLinkFieldValue(key, rawValue),
        })
      : validateIntroCardFieldValue({ field: key, value: rawValue });
    setLiveFieldErrors((current) => ({ ...current, [key]: message }));
  }

  // Issue 92: 保存失敗時、画面上部へ戻さず該当欄へ focus する。RN の
  // `ScrollView`（`AppScreen`）は内部の `TextInput` が `.focus()` で
  // first responder になった時点で可視領域へ自動スクロールするネイティブ機構を
  // 持つため、追加の座標計算・手動 scroll は行わない（Plan.md 設計節、
  // 代替案 A を却下した理由）。
  // 「再 focus すべき新しい失敗が起きたか」は `notice`（`saveIntroCard` の
  // catch 節で保存の都度新しいオブジェクト参照になる、`PassportApp.tsx`）を
  // 依存に含めて判定する（`errorFieldKey` の値だけを依存にすると、同じ欄が
  // 原因のまま連続して保存に失敗したとき 2 回目以降 focus されない
  // code-reviewer 指摘があったため）。`focusOrDismiss` は `useFieldFocusChain`
  // 側で `useCallback` により安定した参照になっているため（simplify レビュー
  // 指摘、対症療法のガード ref を追加する代わりに根本を安定化した）、
  // 他の欄への入力（無関係な再 render）のたびに effect 本体が再実行される
  // ことはない。
  // Issue 93: 保存失敗の原因が任意項目セクション内の欄なら、閉じたままだと
  // エラーに気付けない（隠さない）ため自動的に開く。フォーカス用 effect（次）
  // より前に置く: セクションが閉じている状態で保存に失敗した場合、この effect
  // が `setOptionalSectionExpanded(true)` を呼んでも、その結果 該当欄の
  // `TextInput` が実際に mount されるのは次の commit であり、同じ commit 内で
  // 後続実行されるフォーカス effect からはまだ ref が登録されていない
  // （code-reviewer 指摘: 2 つの effect の実行順序・ref mount タイミングにより
  // focus が無音で no-op になっていた）。
  useEffect(() => {
    if (errorFieldKey !== undefined && errorFieldKey !== 'name') {
      setOptionalSectionExpanded(true);
    }
  }, [errorFieldKey]);

  useEffect(() => {
    // Issue 93: 新しい保存結果（成功・失敗どちらでも）が来るたびに、onBlur の
    // 生きた検証結果をリセットする。古い保存結果に基づく live error が、次の
    // 保存の結果表示と食い違って残り続けないようにする。
    setLiveFieldErrors({});
    // `notice.kind` を明示的に読むことで、`notice`（値そのものは使わず参照の
    // 変化だけをトリガーにしたい）を biome の exhaustive-deps 違反にせず
    // 依存として保つ。加えて、`errorFieldKey` は validation-error 以外の
    // notice では常に undefined のはずだが、ここでも二重に確認しておく。
    // 対象欄が折りたたまれた任意項目セクション内でまだ mount されていない
    // 場合も、`focusOrDismiss`（`useFieldFocusChain`）が pending focus として
    // 覚え、実際に mount された瞬間に focus する（altitude レビュー指摘の
    // 再発防止、上の `useFieldFocusChain` 参照）。
    if (notice.kind !== 'validation-error') return;
    if (errorFieldKey !== undefined) focusOrDismiss(errorFieldKey);
  }, [errorFieldKey, notice, focusOrDismiss]);

  const errorFieldMessage =
    notice.kind === 'validation-error' ? notice.message : null;

  function fieldErrorMessage(key: IntroCardEditFieldKey): string | null {
    // Issue 93: onBlur で一度でも検証した欄は、その場の結果（valid なら null）
    // を保存時のエラーより優先する。まだ blur していない欄は、従来どおり
    // 保存時のエラーだけを表示する。
    if (key in liveFieldErrors) return liveFieldErrors[key] ?? null;
    return errorFieldKey === key ? errorFieldMessage : null;
  }

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
      footer={
        <ActionButton
          accessibilityHint={t.saveButtonHint}
          disabled={saving}
          label={t.saveButton(saving)}
          onPress={handleSave}
        />
      }
      keyboardDismissMode="on-drag"
      locale={locale}
      onChangeLocale={onChangeLocale}
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
          onBlur={() => handleFieldBlur('name', name)}
          onChangeText={onChangeName}
          onSubmitEditing={() => focusOrDismiss(afterNameKey)}
          placeholder={t.namePlaceholder}
          ref={registerFieldRef('name')}
          returnKeyType={afterNameKey === undefined ? 'done' : 'next'}
          style={styles.input}
          value={name}
        />
        <FieldError message={fieldErrorMessage('name')} />
        <Text style={styles.limit}>
          {t.nameCounter(name.length, INTRO_CARD_NAME_MAX_LENGTH)}
        </Text>
      </View>
      <IntroCardPreview
        email={email}
        links={previewLinks}
        name={name}
        namePlaceholder={t.previewNamePlaceholder}
        organization={organization}
        phone={phone}
        selfIntro={selfIntro}
        title={title}
      />
      <ActionButton
        accessibilityHint={
          optionalSectionExpanded
            ? t.optionalSectionHideHint
            : t.optionalSectionShowHint
        }
        label={
          optionalSectionExpanded
            ? t.optionalSectionHideLabel
            : t.optionalSectionShowLabel
        }
        onPress={() => setOptionalSectionExpanded((current) => !current)}
        variant="secondary"
      />
      {optionalSectionExpanded ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>{t.titleLabel}</Text>
            <TextInput
              submitBehavior="submit"
              maxLength={INTRO_CARD_TITLE_MAX_LENGTH}
              onBlur={() => handleFieldBlur('title', title)}
              onChangeText={onChangeTitle}
              onSubmitEditing={() => focusOrDismiss('organization')}
              placeholder={t.titlePlaceholder}
              ref={registerFieldRef('title')}
              returnKeyType="next"
              style={styles.input}
              value={title}
            />
            <FieldError message={fieldErrorMessage('title')} />
            <Text style={styles.limit}>
              {t.titleCounter(title.length, INTRO_CARD_TITLE_MAX_LENGTH)}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.organizationLabel}</Text>
            <TextInput
              submitBehavior="submit"
              maxLength={INTRO_CARD_ORGANIZATION_MAX_LENGTH}
              onBlur={() => handleFieldBlur('organization', organization)}
              onChangeText={onChangeOrganization}
              onSubmitEditing={() => focusOrDismiss('selfIntro')}
              placeholder={t.organizationPlaceholder}
              ref={registerFieldRef('organization')}
              returnKeyType="next"
              style={styles.input}
              value={organization}
            />
            <FieldError message={fieldErrorMessage('organization')} />
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
              onBlur={() => handleFieldBlur('selfIntro', selfIntro)}
              onChangeText={onChangeSelfIntro}
              placeholder={t.selfIntroPlaceholder}
              ref={registerFieldRef('selfIntro')}
              style={[styles.input, styles.multilineInput]}
              value={selfIntro}
            />
            <FieldError message={fieldErrorMessage('selfIntro')} />
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
              autoCorrect={false}
              submitBehavior="submit"
              keyboardType="email-address"
              onBlur={() => handleFieldBlur('email', email)}
              onChangeText={onChangeEmail}
              onSubmitEditing={() => focusOrDismiss('phone')}
              placeholder={t.emailPlaceholder}
              ref={registerFieldRef('email')}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
            <FieldError message={fieldErrorMessage('email')} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.phoneLabel}</Text>
            <TextInput
              submitBehavior="submit"
              keyboardType="phone-pad"
              onBlur={() => handleFieldBlur('phone', phone)}
              onChangeText={onChangePhone}
              onSubmitEditing={() => focusOrDismiss('linkX')}
              placeholder={t.phonePlaceholder}
              ref={registerFieldRef('phone')}
              returnKeyType="next"
              style={styles.input}
              value={phone}
            />
            <FieldError message={fieldErrorMessage('phone')} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.linksLabel}</Text>
            <Text style={styles.limit}>{t.linksHint}</Text>
            <View style={styles.linkField}>
              <Text style={styles.linkFieldLabel}>{t.linkXLabel}</Text>
              <TextInput
                autoCapitalize="none"
                submitBehavior="submit"
                keyboardType="url"
                onBlur={() => handleFieldBlur('linkX', linkX)}
                onChangeText={onChangeLinkX}
                onSubmitEditing={() => focusOrDismiss('linkGithub')}
                placeholder={t.linkXPlaceholder}
                ref={registerFieldRef('linkX')}
                returnKeyType="next"
                style={styles.input}
                value={linkX}
              />
              <FieldError message={fieldErrorMessage('linkX')} />
            </View>
            <View style={styles.linkField}>
              <Text style={styles.linkFieldLabel}>{t.linkGithubLabel}</Text>
              <TextInput
                autoCapitalize="none"
                submitBehavior="submit"
                keyboardType="url"
                onBlur={() => handleFieldBlur('linkGithub', linkGithub)}
                onChangeText={onChangeLinkGithub}
                onSubmitEditing={() => focusOrDismiss('linkLinkedin')}
                placeholder={t.linkGithubPlaceholder}
                ref={registerFieldRef('linkGithub')}
                returnKeyType="next"
                style={styles.input}
                value={linkGithub}
              />
              <FieldError message={fieldErrorMessage('linkGithub')} />
            </View>
            <View style={styles.linkField}>
              <Text style={styles.linkFieldLabel}>{t.linkLinkedinLabel}</Text>
              <TextInput
                autoCapitalize="none"
                submitBehavior="submit"
                keyboardType="url"
                onBlur={() => handleFieldBlur('linkLinkedin', linkLinkedin)}
                onChangeText={onChangeLinkLinkedin}
                onSubmitEditing={() => focusOrDismiss('linkPortfolio')}
                placeholder={t.linkLinkedinPlaceholder}
                ref={registerFieldRef('linkLinkedin')}
                returnKeyType="next"
                style={styles.input}
                value={linkLinkedin}
              />
              <FieldError message={fieldErrorMessage('linkLinkedin')} />
            </View>
            <View style={styles.linkField}>
              <Text style={styles.linkFieldLabel}>{t.linkPortfolioLabel}</Text>
              <TextInput
                autoCapitalize="none"
                submitBehavior="submit"
                keyboardType="url"
                onBlur={() => handleFieldBlur('linkPortfolio', linkPortfolio)}
                onChangeText={onChangeLinkPortfolio}
                onSubmitEditing={() => focusOrDismiss(afterPortfolioKey)}
                placeholder={t.linkPortfolioPlaceholder}
                ref={registerFieldRef('linkPortfolio')}
                returnKeyType={
                  afterPortfolioKey === undefined ? 'done' : 'next'
                }
                style={styles.input}
                value={linkPortfolio}
              />
              <FieldError message={fieldErrorMessage('linkPortfolio')} />
            </View>
            {otherLinks.map((link, index) => {
              // ref/フォーカスチェーン用の key は現在の描画順（position）に対する
              // 一時的な参照名でよいが、React の `key` prop は
              // `rowIds[index]`（mount 以降不変）を使い、削除時に別の行の
              // TextInput が誤ってアンマウントされないようにする
              // （code-reviewer 指摘、上の `useOtherLinkRowIds` を参照）。
              const refKey = `otherLink-${index}` as const;
              const nextRefKey =
                index + 1 < otherLinks.length
                  ? `otherLink-${index + 1}`
                  : undefined;
              return (
                <View
                  key={rowIds[index] ?? refKey}
                  style={styles.otherLinkGroup}
                >
                  <View style={styles.otherLinkRow}>
                    <TextInput
                      autoCapitalize="none"
                      submitBehavior="submit"
                      keyboardType="url"
                      onBlur={() => handleFieldBlur(refKey, link)}
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
                  <FieldError message={fieldErrorMessage(refKey)} />
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
            <Text style={overLinkCount ? styles.dangerCaption : styles.limit}>
              {t.linksCounter(linkCount, INTRO_CARD_MAX_LINKS)}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.themeIdsLabel}</Text>
            <Text style={styles.limit}>{t.themeIdsHint}</Text>
            <ClueSelector
              locale={locale}
              maximum={INTRO_CARD_MAX_THEMES}
              onToggle={onToggleThemeId}
              selectedIds={themeIds}
            />
            <Text style={styles.limit}>
              {t.themeIdsCounter(themeIds.length, INTRO_CARD_MAX_THEMES)}
            </Text>
          </View>
        </>
      ) : null}
      <Text style={overBudget ? styles.dangerCaption : styles.limit}>
        {overBudget
          ? t.byteUsageOverBudget(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)
          : t.byteUsageLabel(cardUrlByteUsage, QR_ENCODER_MAX_BYTES)}
      </Text>
      {/* Issue 130（Codex 指摘 blocker）: カード保存前（初回起動時等）でも
          クイズ・診断へ到達できるよう、フォーム内容の末尾に控えめな Settings
          リンクを置く（保存ボタン＝ footer とは別の位置にし、footer は
          Save 専用のまま保つ、Issue 118 の footer 契約を崩さない）。 */}
      <SettingsLinkFooter
        hint={t.settingsButtonHint}
        label={t.settingsButton}
        onPress={onOpenSettings}
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
  // byte 予算超過（保存前の見積り）と、保存失敗の原因になった欄の直下エラー
  // （Issue 92）は見た目が同じ「警告色の注記」のため 1 つのスタイルを共用する
  // （simplify レビュー指摘: 内容が同一のスタイルを 2 つ定義していた）。
  dangerCaption: {
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
  // Issue 92: 自由リンク 1 行分（入力+削除ボタンの otherLinkRow）と、その
  // 直下のエラー表示をまとめる外側の View。key はこちらへ移した
  // （`otherLinkRow` 自体のスタイルは維持し、内側の行構造は変えない）。
  otherLinkGroup: {
    gap: spacing.xs,
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
