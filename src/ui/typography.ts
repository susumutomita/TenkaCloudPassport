import { Platform } from 'react-native';

/**
 * Issue 70: eyebrow・状態ラベル・カウンタ用の monospace フォント。
 * 依存を増やさずシステムフォントで実現する（仕様書の受け入れ基準）。
 * iOS はファミリー名の指定が必須のため Menlo、それ以外（Android / Web）は
 * generic な monospace へ解決させる。
 */
export const monoFontFamily = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

/**
 * Issue 72 C: mono 大文字キャプション（eyebrow を除く状態ラベル・カウンタ・ヒント）の
 * 共有書式。letterSpacing が画面ごとに 0.6〜1.6 でドリフトしていたため、この 1 箇所へ
 * 集約する。色は含めない。白地では mutedLight、ダーク面（ink 地）では white を
 * 利用側が上書きする。
 */
export const monoLabel = {
  fontFamily: monoFontFamily,
  fontSize: 11,
  fontWeight: '500',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
} as const;
