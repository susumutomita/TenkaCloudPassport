import type { Backup } from '../domain/backup';
import type { LocalPrivateProfile } from '../domain/passport';
import { migrateBackupToCurrent } from '../protocol/migration';
import { BACKUP_MAX_BYTES, EXTERNAL_JSON_MAX_DEPTH } from '../protocol/schema';
import {
  parseBoundedJson,
  type SchemaValidationCode,
  type SchemaValidationError,
} from '../protocol/validation';
import { type BackupPreviewItem, backupPreviewItems } from './backup-export';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
} from './local-profile-storage';

export interface BackupImportRejection {
  readonly kind: 'rejected';
  readonly code: SchemaValidationCode;
  readonly message: string;
}

export interface BackupImportCandidate {
  readonly kind: 'parsed';
  readonly backup: Backup;
  readonly items: readonly BackupPreviewItem[];
}

export type BackupImportParseResult =
  | BackupImportCandidate
  | BackupImportRejection;

/**
 * 不正 JSON、未知の Major Version、欠落 Field、64 KiB を超える過大な File はここで
 * `SchemaValidationError` として拒否し、例外を投げずに `rejected` を返す。呼び出し側が
 * catch を忘れて Storage を触ってしまう経路を作らないためである。検証に成功した場合だけ
 * `parsed` を返し、`items` は Export と同じ `backupPreviewItems` を再利用する。この関数は
 * 既存の `LocalPrivateProfile` に一切触れない。
 *
 * `parseBoundedJson` / `migrateBackupToCurrent` / `backupPreviewItems` は、内部の
 * `strictRecord` / `schemaError`（`src/protocol/validation.ts`）だけで構成された
 * 検証済み実装であり、`SchemaValidationError` 以外を throw することがない
 * （`clueById` は schema 検証済みの `ClueId` だけを受け取るため失敗しない）。この関数
 * 自身が「例外を投げない」契約を持つため、catch した内容を単一段の型 assertion で
 * `SchemaValidationError` として確定させる。
 */
export function parseBackupImportCandidate(
  raw: string
): BackupImportParseResult {
  try {
    const bounded = parseBoundedJson(
      raw,
      BACKUP_MAX_BYTES,
      EXTERNAL_JSON_MAX_DEPTH
    );
    const backup = migrateBackupToCurrent(bounded);
    return { kind: 'parsed', backup, items: backupPreviewItems(backup) };
  } catch (error: unknown) {
    const schemaValidationError = error as SchemaValidationError;
    return {
      kind: 'rejected',
      code: schemaValidationError.code,
      message: schemaValidationError.message,
    };
  }
}

export type BackupImportConflictChoice = 'keep-existing' | 'use-imported';

/** 既存 Profile が無い（初回 Import）場合は Conflict 選択を出さず、読み込んだ内容を使う。 */
export function defaultBackupImportChoice(
  hasExistingProfile: boolean
): BackupImportConflictChoice {
  return hasExistingProfile ? 'keep-existing' : 'use-imported';
}

export class BackupImportConflictError extends Error {
  constructor() {
    super(
      '既存 Profile が無いため keep-existing を選べません。use-imported を選んでください。'
    );
    this.name = 'BackupImportConflictError';
  }
}

/** Profile 単位（per-profile granularity）で Conflict を解決する。 */
export function resolveImportedProfile(
  candidate: Backup,
  existingProfile: LocalPrivateProfile | null,
  choice: BackupImportConflictChoice
): LocalPrivateProfile {
  if (choice === 'use-imported') return candidate.localPrivateProfile;
  if (!existingProfile) throw new BackupImportConflictError();
  return existingProfile;
}

function profileEquals(
  a: LocalPrivateProfile,
  b: LocalPrivateProfile
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 既存の `LocalProfileStoragePort.save()` を呼んだ直後に `storage.load()` で読み戻し、
 * 書き込んだ内容と一致することを確認する（write-then-verify）。
 *
 * `save()` 自体が reject した経路（実ファイルへ一切書き込まれない・quota 超過等）は、
 * 書き込みそのものが起きていないため、失敗前に Storage が保持していた Profile を
 * 確実に変更しない（`storage-test-kit.ts` の `WriteFailingProfileDocument` /
 * `WriteFailingWebStorage` による実 I/O テストで固定している）。
 *
 * `save()` が成功したのに読み戻した内容が一致しない経路（write-then-verify の不一致）は、
 * この時点ですでに書き込みが完了しているため、`LocalProfileStorageError` を投げて
 * 呼び出し側（`PassportApp`）に in-memory state を進めさせない・失敗を通知することは
 * できるが、すでに書き込まれてしまった内容を元の Profile へロールバックはしない
 * （ロールバックには書き込み前の内容を別途保持し、再書き込みする経路が要る）。
 * 現在の Web（`localStorage.setItem` は 1 key の原子的操作）・Native（実ファイル書き込みの
 * 直後の読み戻しは決定的にラウンドトリップする）実装ではこの不一致は実質的に発生しない
 * ため、この経路は「万一の不整合を検知して警告する」防御であり、Known follow-ups に
 * ロールバック実装の要否を残す。
 */
export async function commitBackupImport(
  storage: LocalProfileStoragePort,
  resolvedProfile: LocalPrivateProfile
): Promise<LocalPrivateProfile> {
  await storage.save(resolvedProfile);
  const verified = await storage.load();
  if (!verified || !profileEquals(verified, resolvedProfile)) {
    throw new LocalProfileStorageError(
      'WRITE_FAILED',
      'Import の書き込み内容を検証できなかったため、Commit を確定しません。',
      new Error('write-then-verify の検証に失敗しました。')
    );
  }
  return verified;
}
