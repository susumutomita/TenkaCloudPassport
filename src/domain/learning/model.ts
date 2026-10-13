import type { CatalogSource } from './source';
export interface Choice {
  readonly id: string;
  readonly text: string;
  readonly explanation: string;
}
export interface Step {
  readonly id: string;
  readonly phase: string;
  readonly prompt: string;
  readonly choices: readonly Choice[];
  readonly correctChoiceID: string | null;
  readonly explanation: string;
  readonly title?: string | null;
  readonly code?: string | null;
  readonly hints?: readonly string[];
  readonly reference?: string | null;
  readonly check?: string | null;
}
export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly summary: string;
  readonly authors: readonly {
    readonly name: string;
    readonly type?: string;
    readonly profileURL?: string;
  }[];
  readonly steps: readonly Step[];
  readonly sources?: readonly {
    readonly title: string;
    readonly url: string;
  }[];
  readonly originalRecordJSON?: string;
  readonly contentVersion?: string;
  readonly estimatedDuration?: string | null;
  readonly prerequisites?: readonly string[];
  readonly englishPrompt?: string | null;
  readonly notes?: string | null;
}
export interface Catalog {
  readonly schemaVersion: 1;
  readonly catalogID: string;
  readonly version: string;
  readonly title: string;
  readonly lessons: readonly Lesson[];
  readonly sourceRelease?: unknown;
  readonly importedSource?: unknown;
}
export interface Progress {
  readonly key: string;
  readonly index: number;
  readonly session: string;
  readonly completed: boolean;
  readonly review: boolean;
}
export interface Attempt {
  readonly id: string;
  readonly key: string;
  readonly stepID: string;
  readonly session: string;
  readonly timestamp: number;
  readonly choiceID: string | null;
  readonly result: 'correct' | 'incorrect' | 'self-ready' | 'self-review';
}
export interface LearningState {
  readonly sources?: readonly CatalogSource[];
  readonly nextAttemptID: number;
  readonly schemaVersion: 1;
  readonly catalogs: readonly Catalog[];
  readonly progress: readonly Progress[];
  readonly attempts: readonly Attempt[];
}
export function lessonKey(catalog: Catalog, lesson: Lesson): string {
  return JSON.stringify([catalog.catalogID, catalog.version, lesson.id]);
}
export function catalogKey(catalog: Catalog): string {
  return JSON.stringify([catalog.catalogID, catalog.version]);
}
export const LIMITS = {
  catalogBytes: 2_000_000,
  backupBytes: 20_000_000,
  catalogs: 20,
  lessons: 200,
  steps: 100,
  attempts: 10_000,
};
