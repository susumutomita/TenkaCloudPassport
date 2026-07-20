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
