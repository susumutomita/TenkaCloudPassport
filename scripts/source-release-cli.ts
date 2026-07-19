import { ReleaseCandidateError, runCli } from './source-release';

export function formatSourceReleaseCliError(error: unknown): string {
  if (error instanceof ReleaseCandidateError) {
    return `${error.code}: ${error.message}`;
  }
  return 'UNEXPECTED_RELEASE_ERROR';
}

export async function executeSourceReleaseCli(
  arguments_: readonly string[],
  repositoryRoot = process.cwd(),
  log: (message: string) => void = console.log,
  logError: (message: string) => void = console.error
): Promise<number> {
  try {
    await runCli(arguments_, repositoryRoot, log);
    return 0;
  } catch (error) {
    logError(formatSourceReleaseCliError(error));
    return 1;
  }
}
