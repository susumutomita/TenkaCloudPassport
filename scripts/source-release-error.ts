export type ReleaseCandidateErrorCode =
  | 'INVALID_VERSION'
  | 'INVALID_GIT_REF'
  | 'VERSION_MISMATCH'
  | 'INVALID_LOCKFILE'
  | 'INVALID_PACKAGE_METADATA'
  | 'FORBIDDEN_RELEASE_PATH'
  | 'FORBIDDEN_RELEASE_CONTENT'
  | 'UNSAFE_OUTPUT_DIRECTORY'
  | 'INVALID_SBOM'
  | 'INVALID_MANIFEST'
  | 'INVALID_CHECKSUM'
  | 'COMMAND_FAILED';

export class ReleaseCandidateError extends Error {
  constructor(
    readonly code: ReleaseCandidateErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ReleaseCandidateError';
  }
}
