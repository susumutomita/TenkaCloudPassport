import type { LearningState } from '../../domain/learning/model';
import type { CatalogSource } from '../../domain/learning/source';
import { registerSource } from '../../domain/learning/source-registry';
import { addCatalog } from '../../domain/learning/transitions';
import {
  type CatalogTransport,
  fetchCatalog,
  fetchManifest,
} from './catalog-download';

export function latestRelease(source: CatalogSource) {
  const release = [...source.releases].sort((a, b) =>
    b.version.localeCompare(a.version, 'en', { numeric: true })
  )[0];
  if (!release) throw new Error('この教材には公開された版がありません。');
  return release;
}

/** One explicit download prepares a single atomic save; existing versions/history survive. */
export async function downloadCurrentCatalog(
  transport: CatalogTransport,
  state: LearningState,
  manifestURL: string,
  expectedCatalogID: string,
  signal: AbortSignal,
  onCatalog: () => void
): Promise<LearningState> {
  const source = await fetchManifest(transport, manifestURL, signal);
  if (source.catalogID !== expectedCatalogID)
    throw new Error(
      '選択した教材と配信された教材が一致しません。 / Catalog identity mismatch.'
    );
  const registered = registerSource(state, source);
  onCatalog();
  const catalog = await fetchCatalog(
    transport,
    source,
    latestRelease(source),
    signal
  );
  return addCatalog(registered, catalog);
}
