export type AndroidArtifactIntegrityErrorCode =
  | 'INVALID_APK_PATH'
  | 'SYMLINK_NOT_ALLOWED'
  | 'EMPTY_ARTIFACT'
  | 'ARTIFACT_CHANGED'
  | 'INVALID_CHECKSUM_RECORD'
  | 'CHECKSUM_RECORD_CHANGED'
  | 'ARTIFACT_NAME_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_ANDROID_VERSION_CODE'
  | 'ANDROID_CONFIG_CHANGED'
  | 'INVALID_PREVIOUS_VERSION_CODE'
  | 'VERSION_CODE_NOT_INCREMENTED'
  | 'INVALID_COMMAND';

export class AndroidArtifactIntegrityError extends Error {
  constructor(
    readonly code: AndroidArtifactIntegrityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AndroidArtifactIntegrityError';
  }
}
