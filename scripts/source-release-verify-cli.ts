import {
  ReleaseCandidateError,
  validateSourceReleaseDirectory,
} from './source-release';

export async function verifySourceReleaseCli(
  arguments_: readonly string[],
  log: (message: string) => void = console.log
): Promise<void> {
  const [version, directory] = arguments_;
  if (
    version === undefined ||
    directory === undefined ||
    arguments_.length !== 2
  ) {
    throw new ReleaseCandidateError(
      'INVALID_VERSION',
      'Usage: source release verify <version> <candidate-directory>'
    );
  }

  const files = await validateSourceReleaseDirectory(directory, version);
  log(`Validated ${files.length} source release files.`);
}
