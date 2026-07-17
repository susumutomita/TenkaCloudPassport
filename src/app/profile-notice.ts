import { LocalProfileStorageError } from './local-profile-storage';

export type ProfileNotice =
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'restored'; readonly message: string }
  | { readonly kind: 'validation-error'; readonly message: string }
  | { readonly kind: 'save-error'; readonly message: string }
  | { readonly kind: 'storage-unavailable'; readonly message: string }
  | { readonly kind: 'invalid-data'; readonly message: string }
  | { readonly kind: 'read-error'; readonly message: string };

export function profileNoticeFromStorageError(
  error: unknown,
  operation: 'load' | 'save'
): ProfileNotice {
  if (error instanceof LocalProfileStorageError) {
    if (error.code === 'UNAVAILABLE') {
      return { kind: 'storage-unavailable', message: error.message };
    }
    if (error.code === 'INVALID_DATA') {
      return { kind: 'invalid-data', message: error.message };
    }
    if (operation === 'load') {
      return { kind: 'read-error', message: error.message };
    }
    return { kind: 'save-error', message: error.message };
  }
  return {
    kind: operation === 'load' ? 'read-error' : 'save-error',
    message:
      error instanceof Error
        ? error.message
        : 'Storage の処理に失敗しました。もう一度実行してください。',
  };
}
