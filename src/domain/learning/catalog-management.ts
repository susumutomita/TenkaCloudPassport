import {
  type Catalog,
  catalogKey,
  type LearningState,
  lessonKey,
} from './model';
import { requireValid, validateState } from './validation';
export function removeCatalog(
  state: LearningState,
  catalog: Catalog
): LearningState {
  requireValid(
    state.catalogs.some((item) => catalogKey(item) === catalogKey(catalog))
  );
  const keys = new Set(
    catalog.lessons.map((lesson) => lessonKey(catalog, lesson))
  );
  return validateState({
    ...state,
    catalogs: state.catalogs.filter(
      (item) => catalogKey(item) !== catalogKey(catalog)
    ),
    progress: state.progress.filter((item) => !keys.has(item.key)),
    attempts: state.attempts.filter((item) => !keys.has(item.key)),
  });
}
