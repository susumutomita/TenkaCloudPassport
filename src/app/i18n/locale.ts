/**
 * Issue 15: 日本語・英語の Runtime Language Switch。この repo に React Context の前例が
 * 無く、レンダリング用の統合テスト基盤（React Testing Library 相当）も持たないため、
 * `Locale` は他の横断状態（`backupFlow` 等）と同じ「`PassportApp` が `useState` で保持し、
 * Prop として渡す」設計に揃える（`docs/design/i18n-and-accessibility.md` を正本とする）。
 *
 * Domain 層の `LanguageCode`（`src/domain/clue-catalog.ts`）は Passport の会話材料としての
 * 言語選択であり、概念上この `Locale`（UI 表示言語）とは別物である。値がたまたま同じ
 * `'ja' | 'en'` であっても、型を統合せず独立に定義する。
 */
export type Locale = 'ja' | 'en';

export const DEFAULT_LOCALE: Locale = 'ja';

export const LOCALES: readonly Locale[] = ['ja', 'en'];

export const LOCALE_LABELS: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
};
