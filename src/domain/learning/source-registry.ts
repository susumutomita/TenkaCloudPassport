import type { LearningState } from './model';
import type { CatalogSource } from './source';
import { canonicalJSON, requireValid, validateState } from './validation';
export function registerSource(
  state: LearningState,
  source: CatalogSource
): LearningState {
  const existing = state.sources?.find(
    (item) => item.manifestURL === source.manifestURL
  );
  if (existing) {
    requireValid(existing.catalogID === source.catalogID);
    for (const old of existing.releases) {
      const updated = source.releases.find(
        (item) => item.version === old.version
      );
      if (updated) requireValid(canonicalJSON(old) === canonicalJSON(updated));
    }
  }
  const retained =
    existing?.releases.filter(
      (old) => !source.releases.some((item) => item.version === old.version)
    ) ?? [];
  const registered = { ...source, releases: [...source.releases, ...retained] };
  return validateState({
    ...state,
    sources: [
      ...(state.sources ?? []).filter(
        (item) => item.manifestURL !== source.manifestURL
      ),
      registered,
    ],
  });
}
