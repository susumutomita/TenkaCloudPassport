/**
 * Ink / Summit ブランドの色トークン正本（Issue 70）。
 * 対応表と AA 判定の根拠は `docs/design/2026-07-20-ink-summit-redesign.md`。
 * mutedLight / success / accent は白地の本文に使わない
 * （ドット・mono ラベル・ダーク面上のラベルに限定する）。
 */
export const colors = {
  background: '#ffffff',
  surface: '#f5f5f7',
  ink: '#1d1d1f',
  muted: '#6e6e73',
  mutedLight: '#86868b',
  border: '#d2d2d7',
  borderSubtle: '#e8e8ed',
  primary: '#1d1d1f',
  primaryPressed: '#000000',
  primarySoft: '#f5f5f7',
  accent: '#ff6a32',
  success: '#2f9e63',
  successText: '#1f7a49',
  info: '#3b82f6',
  warning: '#b07708',
  warningText: '#8a6a12',
  danger: '#9f3434',
  disabled: '#c7c7cc',
  white: '#ffffff',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
