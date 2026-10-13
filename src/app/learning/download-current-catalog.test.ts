import { expect, it } from 'bun:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { BUNDLED_CATALOGS } from '../../../tests/fixtures/learning/catalogs';
import { lessonKey } from '../../domain/learning/model';
import type { CatalogSource } from '../../domain/learning/source';
import { startLesson } from '../../domain/learning/transitions';
import { emptyLearningState } from './bundled';
import {
  type CatalogResponse,
  type CatalogTransport,
  fetchCatalog,
} from './catalog-download';
import {
  downloadCurrentCatalog,
  latestRelease,
} from './download-current-catalog';
import { LearningSession } from './storage';

const catalog = BUNDLED_CATALOGS[0];
if (!catalog) throw new Error('Missing learning fixture');
const first = catalog.lessons[0];
if (!first) throw new Error('Missing lesson');
const raw = JSON.stringify(catalog);
const bytes = new TextEncoder().encode(raw);
const manifestURL =
  'https://raw.githubusercontent.com/owner/content/main/manifest.json';
const source = {
  schemaVersion: 1,
  manifestURL,
  catalogID: catalog.catalogID,
  title: catalog.title,
  releases: [
    {
      version: catalog.version,
      catalogSchemaVersion: 1,
      commitSHA: 'a'.repeat(40),
      payloadPath: 'catalog.json',
      bytes: bytes.length,
      sha256: bytesToHex(sha256(bytes)),
    },
  ],
} as const;
function transport(fail = false, corrupt = false): CatalogTransport {
  return {
    fetch: async (url) => {
      if (fail) throw new Error('Synthetic offline');
      const payload =
        url === manifestURL ? JSON.stringify(source) : corrupt ? '{}' : raw;
      return {
        ok: true,
        status: 200,
        redirected: false,
        url,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: new Blob([payload]).stream(),
      } satisfies CatalogResponse;
    },
  };
}
const downloaded = await fetchCatalog(
  transport(),
  source,
  source.releases[0],
  new AbortController().signal
);
const state = startLesson(
  { ...emptyLearningState(), catalogs: [downloaded] },
  lessonKey(catalog, first),
  'existing-session'
);
it('one explicit download registers the source and preserves saved progress without duplicating a version', async () => {
  let payloadStage = false;
  const next = await downloadCurrentCatalog(
    transport(),
    state,
    manifestURL,
    new AbortController().signal,
    () => {
      payloadStage = true;
    }
  );
  expect(payloadStage).toBe(true);
  expect(next.catalogs).toEqual(state.catalogs);
  expect(next.progress).toEqual(state.progress);
  expect(next.sources?.[0]?.catalogID).toBe(catalog.catalogID);
  expect(state.sources).toEqual([]);
});
it('network failure, integrity failure and cancellation leave saved data intact and permit retry', async () => {
  const original = JSON.stringify(state);
  for (const port of [transport(true), transport(false, true)]) {
    await expect(
      downloadCurrentCatalog(
        port,
        state,
        manifestURL,
        new AbortController().signal,
        () => undefined
      )
    ).rejects.toThrow();
  }
  const controller = new AbortController();
  await expect(
    downloadCurrentCatalog(
      transport(),
      state,
      manifestURL,
      controller.signal,
      () => controller.abort()
    )
  ).rejects.toThrow();
  expect(JSON.stringify(state)).toBe(original);
  const next = await downloadCurrentCatalog(
    transport(),
    state,
    manifestURL,
    new AbortController().signal,
    () => undefined
  );
  const session = new LearningSession(state, {
    save: async () => {
      throw new Error('Synthetic full disk');
    },
  });
  await expect(session.commit(0, () => next)).rejects.toThrow(
    'Synthetic full disk'
  );
  expect(session.state).toBe(state);
  expect(session.revision).toBe(0);
});
it('chooses the newest numeric version regardless of manifest order', () => {
  const release = source.releases[0];
  const versions = ['2026.10.9', '2026.10.1000', '2026.9.9999'];
  expect(
    latestRelease({
      ...source,
      releases: versions.map((version) => ({ ...release, version })),
    } as CatalogSource).version
  ).toBe('2026.10.1000');
  expect(() =>
    latestRelease({ ...source, releases: [] } as CatalogSource)
  ).toThrow();
});
