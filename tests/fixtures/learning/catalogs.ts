import type { LearningState } from '../../../src/domain/learning/model';
import { validateCatalog } from '../../../src/domain/learning/validation';
import algorithms from './native-algorithms.json';
import design from './native-design.json';
import foundations from './native-foundations.json';
import implementation from './native-implementation.json';
import interview from './native-interview.json';
import warmups from './native-warmups.json';
export const BUNDLED_CATALOGS = [
  algorithms,
  foundations,
  design,
  implementation,
  warmups,
  interview,
].map(validateCatalog);
export function emptyLearningState(): LearningState {
  return {
    schemaVersion: 1,
    nextAttemptID: 0,
    catalogs: BUNDLED_CATALOGS,
    progress: [],
    attempts: [],
  };
}
