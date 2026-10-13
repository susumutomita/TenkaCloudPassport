import {
  type Catalog,
  catalogKey,
  type LearningState,
  type Lesson,
  LIMITS,
  lessonKey,
  type Progress,
} from './model';
import { canonicalJSON, requireValid, validateState } from './validation';

export function currentProgress(
  state: LearningState,
  catalog: Catalog,
  lesson: Lesson
): Progress | undefined {
  return state.progress.find((item) => item.key === lessonKey(catalog, lesson));
}
function replaceProgress(
  state: LearningState,
  progress: Progress
): LearningState {
  return {
    ...state,
    progress: [
      ...state.progress.filter((item) => item.key !== progress.key),
      progress,
    ],
  };
}
function resolve(state: LearningState, key: string): Lesson {
  const lesson = state.catalogs.flatMap((catalog) =>
    catalog.lessons.filter((item) => lessonKey(catalog, item) === key)
  );
  requireValid(lesson.length === 1 && lesson[0]);
  return lesson[0];
}
export function startLesson(
  state: LearningState,
  key: string,
  session: string,
  restart = false
): LearningState {
  resolve(state, key);
  if (!restart && state.progress.some((item) => item.key === key)) return state;
  requireValid(session.length > 0 && session.length <= 200);
  return replaceProgress(state, {
    key,
    index: 0,
    session,
    completed: false,
    review: false,
  });
}
export interface AnswerRequest {
  readonly key: string;
  readonly stepID: string;
  readonly session: string;
  readonly choiceID: string | null;
  readonly selfReady?: boolean;
  readonly timestamp: number;
}
export function answer(
  state: LearningState,
  request: AnswerRequest
): LearningState {
  const lesson = resolve(state, request.key);
  const progress = state.progress.find((item) => item.key === request.key);
  requireValid(
    progress && !progress.completed && progress.session === request.session
  );
  const step = lesson.steps[progress.index];
  requireValid(step && step.id === request.stepID);
  const choice = step.choices.find((item) => item.id === request.choiceID);
  requireValid(
    step.choices.length
      ? choice
      : request.choiceID === null && typeof request.selfReady === 'boolean'
  );
  const result = choice
    ? choice.id === step.correctChoiceID
      ? 'correct'
      : 'incorrect'
    : request.selfReady
      ? 'self-ready'
      : 'self-review';
  requireValid(state.nextAttemptID < Number.MAX_SAFE_INTEGER);
  const next = replaceProgress(state, {
    ...progress,
    review:
      progress.review || result === 'incorrect' || result === 'self-review',
  });
  return validateState({
    ...next,
    nextAttemptID: state.nextAttemptID + 1,
    attempts: [
      ...next.attempts.slice(-(LIMITS.attempts - 1)),
      {
        id: String(state.nextAttemptID),
        key: request.key,
        stepID: request.stepID,
        session: request.session,
        choiceID: request.choiceID,
        timestamp: request.timestamp,
        result,
      },
    ],
  });
}
export function advance(
  state: LearningState,
  key: string,
  session: string,
  stepID: string
): LearningState {
  const lesson = resolve(state, key);
  const progress = state.progress.find((item) => item.key === key);
  requireValid(progress && !progress.completed && progress.session === session);
  const step = lesson.steps[progress.index];
  requireValid(step?.id === stepID);
  const latest = state.attempts
    .filter(
      (item) =>
        item.key === key && item.session === session && item.stepID === stepID
    )
    .at(-1);
  requireValid(latest && latest.result !== 'incorrect');
  const index = progress.index + 1;
  return replaceProgress(state, {
    ...progress,
    index,
    completed: index === lesson.steps.length,
  });
}
export function addCatalog(
  state: LearningState,
  catalog: Catalog
): LearningState {
  const existing = state.catalogs.find(
    (item) => catalogKey(item) === catalogKey(catalog)
  );
  if (existing) {
    requireValid(canonicalJSON(existing) === canonicalJSON(catalog));
    return state;
  }
  return validateState({ ...state, catalogs: [...state.catalogs, catalog] });
}
