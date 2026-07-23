import { DEFAULT_LOCALE, type Locale } from './i18n/locale';

/**
 * Issue 111: 端末 / ブラウザの優先言語（BCP-47 相当のタグ、優先順）を返す環境。
 * `reduced-motion-port.ts` と同じ「Port + 環境注入」設計であり、この Port 自体は
 * `expo-localization`（Native module、Web でも Native binding を経由し得る）を
 * 直接 import しない。これにより Native module を import できない `bun test`
 * 環境でも、実際の別実装（固定タグ列を返す環境、例外を投げる環境）で挙動を
 * 検証できる（No Mock、`docs/adr/0034-initial-locale-autodetection.md`）。
 */
export interface InitialLocaleEnvironment {
  preferredLanguageTags(): readonly string[];
}

export interface InitialLocalePort {
  resolveInitialLocale(): Locale;
}

/**
 * 優先言語タグの列から初期表示言語を決める純関数。
 *
 * - 先頭タグ（最優先言語）の言語サブタグ（`-` / `_` より前、大文字小文字を無視）が
 *   `ja` なら `'ja'`。
 * - それ以外の非空タグ（`LOCALES` に無い言語を含む）は `'en'` にフォールバックする。
 * - 空配列（判定手段が無い、権限拒否等で本当に何も分からない）は、既存の既定値を
 *   変えない保守的な選択として `DEFAULT_LOCALE`（`'ja'`）を返す
 *   （ADR-0034 の Tradeoff 節を参照）。
 */
export function pickInitialLocale(
  preferredLanguageTags: readonly string[]
): Locale {
  const primary = preferredLanguageTags[0];
  if (!primary) return DEFAULT_LOCALE;
  const [primarySubtag] = primary.split(/[-_]/);
  return primarySubtag?.toLowerCase() === 'ja' ? 'ja' : 'en';
}

/**
 * 取得に失敗した場合は既存の既定値（`ja`）を維持する fail-safe
 * （`reduced-motion-port.ts` と同じ方針）。
 */
export function createInitialLocalePort(
  environment: InitialLocaleEnvironment
): InitialLocalePort {
  return {
    resolveInitialLocale() {
      try {
        return pickInitialLocale(environment.preferredLanguageTags());
      } catch {
        return DEFAULT_LOCALE;
      }
    },
  };
}
