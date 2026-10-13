import type { LearningState } from '../../domain/learning/model';
export function emptyLearningState(): LearningState {
  return {
    schemaVersion: 1,
    nextAttemptID: 0,
    catalogs: [],
    progress: [],
    attempts: [],
    sources: [],
  };
}
