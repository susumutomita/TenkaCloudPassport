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
  | 'INVALID_ANDROID_PACKAGE_ID'
  | 'ANDROID_CONFIG_CHANGED'
  | 'INVALID_PREVIOUS_VERSION_CODE'
  | 'VERSION_CODE_NOT_INCREMENTED'
  | 'INVALID_RELEASE_PROVENANCE'
  | 'INVALID_RELEASE_MANIFEST'
  | 'RELEASE_IDENTITY_MISMATCH'
  | 'INVALID_ANDROID_TOOL_PATH'
  | 'ANDROID_TOOL_FAILED'
  | 'GIT_SOURCE_MISMATCH'
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

export function reportAndroidArtifactCliFailure(
  error: unknown,
  unexpectedMessage: string
): void {
  console.error(
    error instanceof AndroidArtifactIntegrityError
      ? `${error.code}: ${error.message}`
      : `UNEXPECTED_ERROR: ${unexpectedMessage}`
  );
  process.exitCode = 1;
}
