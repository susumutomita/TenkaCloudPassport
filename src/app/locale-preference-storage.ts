import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import { LOCALES, type Locale } from './i18n/locale';
import type { WebKeyValueStorage } from './web-local-profile-storage';

/**
 * Issue 111: 明示的に選んだ表示言語を端末内へ永続化する Port。
 * `local-deletion-journal.ts` と同じ「単一の小さな値、Web / Native 2 adapter、
 * `ProfileDocument` / `WebKeyValueStorage`（`local-profile-storage.ts` 系統の
 * 既存型）を再利用する」設計を踏襲する。`LocalProfileStoragePort` のような
 * JSON schema バージョニングは、値が `'ja' | 'en'` の 2 値でしかなく将来の
 * スキーマ進化を要しないため持たせない（ADR-0034 参照）。
 */
export const LOCALE_PREFERENCE_STORAGE_KEY =
  'tenkacloud-passport.locale-preference';

export interface LocalePreferenceStoragePort {
  /** 保存済みの明示選択。未保存・不正な値は `null`（自動判定へ委ねる）。 */
  load(): Promise<Locale | null>;
  save(locale: Locale): Promise<void>;
}

export type LocalePreferenceStorageErrorCode = 'READ_FAILED' | 'WRITE_FAILED';

export class LocalePreferenceStorageError extends Error {
  readonly code: LocalePreferenceStorageErrorCode;

  constructor(code: LocalePreferenceStorageErrorCode, cause: unknown) {
    super('端末内の表示言語の選択を保存・読込できませんでした。', { cause });
    this.name = 'LocalePreferenceStorageError';
    this.code = code;
  }
}

function isStoredLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export class WebLocalePreferenceStorageAdapter
  implements LocalePreferenceStoragePort
{
  constructor(private readonly storage: WebKeyValueStorage | null) {}

  async load(): Promise<Locale | null> {
    if (!this.storage) {
      throw new LocalePreferenceStorageError(
        'READ_FAILED',
        new Error('unavailable')
      );
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
    } catch (error: unknown) {
      throw new LocalePreferenceStorageError('READ_FAILED', error);
    }
    if (raw === null) return null;
    // Native adapter（ファイル I/O）と同じく trim する。`localStorage` 自体は
    // 前後の空白を書き込まないが、値の検証を両 adapter で揃える。
    const trimmed = raw.trim();
    return isStoredLocale(trimmed) ? trimmed : null;
  }

  async save(locale: Locale): Promise<void> {
    if (!this.storage) {
      throw new LocalePreferenceStorageError(
        'WRITE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      this.storage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, locale);
    } catch (error: unknown) {
      throw new LocalePreferenceStorageError('WRITE_FAILED', error);
    }
  }
}

export class ExpoFileSystemLocalePreferenceStorageAdapter
  implements LocalePreferenceStoragePort
{
  constructor(private readonly document: ProfileDocument | null) {}

  async load(): Promise<Locale | null> {
    if (!this.document) {
      throw new LocalePreferenceStorageError(
        'READ_FAILED',
        new Error('unavailable')
      );
    }
    let exists: boolean;
    try {
      exists = this.document.exists;
    } catch (error: unknown) {
      throw new LocalePreferenceStorageError('READ_FAILED', error);
    }
    if (!exists) return null;
    let raw: string;
    try {
      raw = await this.document.text();
    } catch (error: unknown) {
      throw new LocalePreferenceStorageError('READ_FAILED', error);
    }
    const trimmed = raw.trim();
    return isStoredLocale(trimmed) ? trimmed : null;
  }

  async save(locale: Locale): Promise<void> {
    if (!this.document) {
      throw new LocalePreferenceStorageError(
        'WRITE_FAILED',
        new Error('unavailable')
      );
    }
    try {
      await this.document.write(locale);
    } catch (error: unknown) {
      throw new LocalePreferenceStorageError('WRITE_FAILED', error);
    }
  }
}
