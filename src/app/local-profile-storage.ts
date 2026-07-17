import type { LocalPrivateProfile } from '../domain/passport';
import {
  parseLocalPrivateProfile,
  parseLocalPrivateProfileJson,
} from '../protocol/schema';

export interface LocalProfileStoragePort {
  load(): Promise<LocalPrivateProfile | null>;
  save(profile: LocalPrivateProfile): Promise<void>;
}

export type LocalProfileStorageErrorCode =
  | 'UNAVAILABLE'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'INVALID_DATA';

export class LocalProfileStorageError extends Error {
  readonly code: LocalProfileStorageErrorCode;

  constructor(
    code: LocalProfileStorageErrorCode,
    message: string,
    cause: unknown
  ) {
    super(message, { cause });
    this.name = 'LocalProfileStorageError';
    this.code = code;
  }
}

export function parseStoredLocalProfile(raw: string): LocalPrivateProfile {
  try {
    return parseLocalPrivateProfileJson(raw);
  } catch (error: unknown) {
    throw new LocalProfileStorageError(
      'INVALID_DATA',
      '端末内の Local Profile は有効な保存データではありません。',
      error
    );
  }
}

export function serializeLocalProfile(profile: LocalPrivateProfile): string {
  try {
    return JSON.stringify(parseLocalPrivateProfile(profile));
  } catch (error: unknown) {
    throw new LocalProfileStorageError(
      'INVALID_DATA',
      'Local Profile を保存可能な形式へ変換できません。',
      error
    );
  }
}

export function unavailableStorageError(): LocalProfileStorageError {
  return new LocalProfileStorageError(
    'UNAVAILABLE',
    'この環境では端末内 Storage を利用できません。',
    new Error('Local Profile の保存媒体がありません。')
  );
}

export class UnavailableLocalProfileStorageAdapter
  implements LocalProfileStoragePort
{
  constructor(private readonly unavailableCause: unknown) {}

  load(): Promise<LocalPrivateProfile | null> {
    return Promise.reject(
      new LocalProfileStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }

  save(_profile: LocalPrivateProfile): Promise<void> {
    return Promise.reject(
      new LocalProfileStorageError(
        'UNAVAILABLE',
        'この環境では端末内 Storage を利用できません。',
        this.unavailableCause
      )
    );
  }
}
