import { getLocales } from 'expo-localization';
import {
  createInitialLocalePort,
  type InitialLocalePort,
} from './initial-locale-port';

/**
 * Composition Root（`App.tsx`）向けの既定 Port。`expo-localization` を直接
 * import するのはこのファイルだけであり、`initial-locale-port.ts` 自体は
 * Native module を知らない（No Mock でテストできる理由、ADR-0034 参照）。
 * `getLocales()` は iOS / Android / Web / Expo Go のいずれでも動作し、
 * `languageTag`（BCP-47、地域コード込み）は常に非 null のためそのまま渡せる。
 */
export function createDefaultInitialLocalePort(): InitialLocalePort {
  return createInitialLocalePort({
    preferredLanguageTags: () =>
      getLocales().map((locale) => locale.languageTag),
  });
}
