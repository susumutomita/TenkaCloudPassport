import { StyleSheet } from 'react-native';
import { colors, spacing } from '../ui/theme';

/**
 * Issue 180: `SettingsScreen.tsx`（`DataErasureSection`）と
 * `ModelAcquisitionSection.tsx`（Settings / 会話エージェント画面が共有する
 * 信頼済み Model 取得 UI）が同じ「カード」見た目を使う。jscpd（`.jscpd.json` の
 * `minLines: 5`）が同一の `StyleSheet.create` 定義の複製を検出するため、1 か所へ
 * 集約して両方から import する。
 *
 * `/simplify` 指摘（reuse）: カードの外枠（角丸・枠線・padding）は
 * `../components/Card.tsx`（Issue 72 D で「5 箇所コピペされていたカード意匠」を
 * 抽出した既存プリミティブ）が既に持つ。ここで再定義せず、`Card` の既定 style に
 * この画面群だけの差分（surface 背景・border 色・gap）を上書きする
 * `modelCardOverride` だけを持つ。
 */
export const modelCardOverride = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    gap: spacing.sm,
  },
}).card;

export const modelCardStyles = StyleSheet.create({
  modelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
});
