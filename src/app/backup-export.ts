import type {
  Backup,
  DeviceSettings,
  ModelVerification,
} from '../domain/backup';
import {
  CATALOG_VERSION,
  clueById,
  LANGUAGE_CATALOG,
} from '../domain/clue-catalog';
import type { LocalPrivateProfile } from '../domain/passport';
import { parseBackup } from '../protocol/schema';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';

export interface BackupPreviewItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface BackupExportInput {
  readonly localPrivateProfile: LocalPrivateProfile;
  readonly deviceSettings: DeviceSettings;
  readonly modelVerification: ModelVerification | null;
  /** ISO 8601（UTC）の Export 日時。呼び出し側が `new Date().toISOString()` で生成する。 */
  readonly exportedAt: string;
}

export interface BackupExportPreview {
  readonly backup: Backup;
  readonly json: string;
  readonly items: readonly BackupPreviewItem[];
  readonly byteLength: number;
}

/**
 * M1 には Device Settings の値を永続化する専用 Storage Port がまだ無いため
 * （Known follow-up、`docs/design/backup-export-import.md` 参照）、Export 時点の
 * `language`（Issue 15 の Settings 画面が切り替える UI 表示言語）と `reduceMotion`
 * （`src/app/reduced-motion-port.ts` が判定した OS 設定）をその場で渡せるようにする。
 * 両方省略した既定値（`ja` / Reduce Motion OFF）は既存呼び出しと Byte-for-byte 互換。
 */
export function createDefaultDeviceSettings(
  language: Locale = DEFAULT_LOCALE,
  reduceMotion = false
): DeviceSettings {
  return {
    language,
    reduceMotion,
    selectedModelDigest: null,
    catalogVersion: CATALOG_VERSION,
  };
}

/**
 * Backup が持つ全 field を、Export Preview と Import Preview の両方が共有する
 * 1 行 1 項目の表示用配列へ展開する。allowlist から逸脱した field は Backup の型に
 * そもそも入り得ないため、この一覧は Export・Import される内容と構造的に一致する。
 */
export function backupPreviewItems(backup: Backup): BackupPreviewItem[] {
  const profile = backup.localPrivateProfile;
  const items: BackupPreviewItem[] = [
    {
      key: 'backupSchemaVersion',
      label: 'Backup Schema Version',
      value: String(backup.backupSchemaVersion),
    },
    { key: 'exportedAt', label: 'Export 日時', value: backup.exportedAt },
    { key: 'petName', label: 'Pet Name', value: profile.petName },
    { key: 'petEmoji', label: 'Pet Emoji', value: profile.petEmoji },
  ];
  if (profile.ownerAlias) {
    items.push({
      key: 'ownerAlias',
      label: 'Owner Alias',
      value: profile.ownerAlias,
    });
  }
  for (const clue of profile.candidateClues) {
    const definition = clueById(clue.value);
    items.push({
      key: `candidateClue:${clue.value}`,
      label: `候補手掛かり（${definition.passportField}）`,
      value: clue.selectedForPassport
        ? `${definition.label}（公開対象）`
        : definition.label,
    });
  }
  for (const excludedId of profile.excludedTopics) {
    items.push({
      key: `excludedTopic:${excludedId}`,
      label: '除外トピック',
      value: clueById(excludedId).label,
    });
  }
  for (const language of profile.languages) {
    items.push({
      key: `language:${language}`,
      label: 'Language',
      value: LANGUAGE_CATALOG[language].label,
    });
  }
  items.push(
    {
      key: 'deviceSettings.language',
      label: '端末設定の Language',
      value: backup.deviceSettings.language,
    },
    {
      key: 'deviceSettings.reduceMotion',
      label: '端末設定の Reduce Motion',
      value: backup.deviceSettings.reduceMotion ? 'ON' : 'OFF',
    },
    {
      key: 'deviceSettings.selectedModelDigest',
      label: '端末設定の選択中モデル digest',
      value: backup.deviceSettings.selectedModelDigest ?? '(未選択)',
    },
    {
      key: 'deviceSettings.catalogVersion',
      label: '端末設定のカタログ版',
      value: backup.deviceSettings.catalogVersion,
    }
  );
  if (backup.modelVerification) {
    items.push(
      {
        key: 'modelVerification.digest',
        label: 'モデル検証記録の digest',
        value: backup.modelVerification.digest,
      },
      {
        key: 'modelVerification.sizeBytes',
        label: 'モデル検証記録のサイズ',
        value: String(backup.modelVerification.sizeBytes),
      },
      {
        key: 'modelVerification.result',
        label: 'モデル検証結果',
        value: backup.modelVerification.result,
      },
      {
        key: 'modelVerification.appVersion',
        label: '検証したアプリ版',
        value: backup.modelVerification.appVersion,
      }
    );
  }
  return items;
}

/** Export 対象のファイル名を、コロンをファイル名に使えない環境向けに正規化して組み立てる。 */
export function backupExportFileName(exportedAt: string): string {
  const sanitized = exportedAt.replace(/[:.]/g, '-');
  return `tenkacloud-passport-backup-${sanitized}.json`;
}

/**
 * Export の入力から、既存の strict schema（`parseBackup`）を経由して Backup を確定し、
 * Preview 表示用の全項目一覧と Share Sheet へ渡す JSON 文字列を組み立てる。既存 schema を
 * 再利用することで、Export 側だけが allowlist から逸脱した field を持つ経路を作らない。
 */
export function createBackupExportPreview(
  input: BackupExportInput
): BackupExportPreview {
  const backup = parseBackup({
    backupSchemaVersion: 2,
    exportedAt: input.exportedAt,
    localPrivateProfile: input.localPrivateProfile,
    deviceSettings: input.deviceSettings,
    modelVerification: input.modelVerification,
  });
  const json = JSON.stringify(backup);
  return {
    backup,
    json,
    items: backupPreviewItems(backup),
    byteLength: new TextEncoder().encode(json).byteLength,
  };
}
