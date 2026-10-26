import type { ExclusiveOutputRecord } from './exclusive-output-writer';
import { ReleaseCandidateError } from './source-release-error';

/** Own successful writer records without exposing a mutable registry or aliases. */
export class ReleaseOutputOwnership {
  readonly #records = new Map<string, Readonly<ExclusiveOutputRecord>>();

  get size(): number {
    return this.#records.size;
  }

  record(fileName: string, record: ExclusiveOutputRecord): void {
    const snapshot = Object.freeze({ ...record });
    if (snapshot.fileName !== fileName || this.#records.has(fileName)) {
      throw new ReleaseCandidateError(
        'UNSAFE_OUTPUT_DIRECTORY',
        'Release output writer did not create one unique regular file.'
      );
    }
    this.#records.set(fileName, snapshot);
  }

  get(fileName: string): Readonly<ExclusiveOutputRecord> | undefined {
    return this.#records.get(fileName);
  }

  values(): readonly Readonly<ExclusiveOutputRecord>[] {
    return Object.freeze([...this.#records.values()]);
  }
}
