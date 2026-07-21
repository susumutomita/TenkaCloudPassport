import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../ui/theme';

/**
 * `exactOptionalPropertyTypes` の下では、値が明示 `undefined` になりうる
 * optional key は `?:` ではなく union で宣言する（`IntroCardOptionalFields`
 * と同じ方針）。表示画面（`IntroCardScreen`）は保存済み `IntroCard` の
 * `string | undefined` フィールドをそのまま渡し、編集画面
 * （`IntroCardEditScreen`）は常に `string`（空文字を含む）を渡す。
 */
export interface IntroCardPreviewProps {
  readonly name: string;
  readonly title: string | undefined;
  readonly organization: string | undefined;
  readonly selfIntro: string | undefined;
  readonly email: string | undefined;
  readonly phone: string | undefined;
  readonly links: readonly string[] | undefined;
  /**
   * Issue 93: 編集画面のライブプレビュー（保存前）で、名前が未入力のときに
   * 表示するプレースホルダ。表示画面（保存済みカード）は常に有効な
   * `card.name` を渡すため使わない（省略する、`undefined` を明示的に渡さない）。
   */
  readonly namePlaceholder?: string;
}

/**
 * Issue 79 の表示画面（`IntroCardScreen`）が持っていたカード要約の描画を、
 * Issue 93 で編集画面のライブプレビューとも共有するために切り出した。
 * 表示画面は保存済み・検証済みの `IntroCard` を渡し、編集画面は保存前
 * （バリデーション未確定）の生の入力値をそのまま渡す。どちらも「値がなければ
 * その行を出さない」という同じ表示規則を守る（空文字と未入力を区別しない）。
 */
export default function IntroCardPreview({
  name,
  title,
  organization,
  selfIntro,
  email,
  phone,
  links = [],
  namePlaceholder,
}: IntroCardPreviewProps) {
  const subtitle = [title, organization]
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  const displayName = name.length > 0 ? name : (namePlaceholder ?? '');

  return (
    <View style={styles.summary}>
      <Text style={styles.name}>{displayName}</Text>
      {subtitle.length > 0 ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}
      {selfIntro ? <Text style={styles.selfIntro}>{selfIntro}</Text> : null}
      {email ? <Text style={styles.contact}>{email}</Text> : null}
      {phone ? <Text style={styles.contact}>{phone}</Text> : null}
      {/*
        code-reviewer 指摘: Portfolio と自由リンクに同じ URL を入れる等、
        2 件以上のリンクが同一文字列になりうるため、値そのものだけでは key が
        衝突しうる（ライブプレビューはキーストロークごとに再描画されるため、
        表示画面より重複に遭遇しやすい）。この一覧は読み取り専用（並び替え・
        単独アンマウントを伴う操作を持たない）ため、値と位置情報を組み合わせた
        key で十分安全に重複を避けられる。
      */}
      {links.map((link, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 読み取り専用の一覧で並び替えは発生しない
        <Text key={`${index}-${link}`} style={styles.contact}>
          {link}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
  },
  name: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
  },
  selfIntro: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.sm,
  },
  contact: {
    color: colors.muted,
    fontSize: 14,
  },
});
