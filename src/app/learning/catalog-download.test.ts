import { describe, expect, it } from 'bun:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { BUNDLED_CATALOGS } from '../../../tests/fixtures/learning/catalogs';
import { type CatalogSource, catalogURL } from '../../domain/learning/source';
import { registerSource } from '../../domain/learning/source-registry';
import {
  addCatalog,
  currentProgress,
  startLesson,
} from '../../domain/learning/transitions';
import { validateState } from '../../domain/learning/validation';
import { emptyLearningState } from './bundled';
import {
  boundedDownload,
  type CatalogResponse,
  type CatalogTransport,
  fetchCatalog,
  fetchManifest,
} from './catalog-download';
import { PUBLISHED_CATALOGS } from './published-catalogs';
import { LearningSession } from './storage';

const catalog = BUNDLED_CATALOGS[0];
if (!catalog) throw new Error('Missing fixture');
const bytes = new TextEncoder().encode(JSON.stringify(catalog));
const manifestURL =
  'https://raw.githubusercontent.com/owner/content/main/manifest.json';
const source: CatalogSource & { schemaVersion: 1 } = {
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
};
const release = source.releases[0];
if (!release) throw new Error('Missing release');
function response(
  url: string,
  data: Uint8Array,
  override: Partial<CatalogResponse> = {}
): CatalogResponse {
  return {
    ok: true,
    status: 200,
    url,
    redirected: false,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }),
    ...override,
  };
}
function transport(
  data: Uint8Array,
  override: Partial<CatalogResponse> = {}
): CatalogTransport {
  return {
    async fetch(url) {
      return response(url, data, override);
    },
  };
}
function signal() {
  return new AbortController().signal;
}
describe('external catalogs and atomic application', () => {
  it('offers content-based discovery identities while leaving versioned payloads external', () => {
    expect(BUNDLED_CATALOGS.length).toBe(PUBLISHED_CATALOGS.length);
    for (const entry of PUBLISHED_CATALOGS) {
      expect(catalogURL(entry.manifestURL).pathname).toMatch(
        /^\/susumutomita\/TenkaCloudInterviewCatalog\/main\/native-[a-z]+-manifest\.json$/
      );
      expect(
        BUNDLED_CATALOGS.some(
          (catalog) => catalog.catalogID === entry.catalogID
        )
      ).toBe(true);
    }
  });
  it('starts with no bundled learning content; manifest registration is validated', async () => {
    expect(emptyLearningState().catalogs).toEqual([]);
    const manifest = await fetchManifest(
      transport(new TextEncoder().encode(JSON.stringify(source))),
      manifestURL,
      signal()
    );
    expect(registerSource(emptyLearningState(), manifest).sources?.length).toBe(
      1
    );
  });
  it('downloads exact pinned bytes/digest and allows offline reload preserving history', async () => {
    const fetched = await fetchCatalog(
      transport(bytes),
      source,
      release,
      signal()
    );
    const state = addCatalog(
      registerSource(emptyLearningState(), source),
      fetched
    );
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(fetched).toEqual({
      ...catalog,
      importedSource: fetched.importedSource,
    });
    const forged = JSON.parse(JSON.stringify(state));
    forged.catalogs[0].title = 'Modified backup';
    expect(() => validateState(forged)).toThrow();
    expect(
      (fetched.importedSource as { contentSHA256: string }).contentSHA256
    ).toBe(release.sha256);
  });
  it('rejects private/custom/credential/redirect URLs and traversal', async () => {
    for (const url of [
      'http://raw.githubusercontent.com/o/r/main/m.json',
      'https://127.0.0.1/m.json',
      'https://localhost/m.json',
      'https://user:password@raw.githubusercontent.com/o/r/main/m.json',
      'https://raw.githubusercontent.com/o/r/main/../m.json',
      'https://raw.githubusercontent.com/o/r/main/%2e%2e/m.json',
      'https://raw.githubusercontent.com/o/r/main/m.json?token=x',
    ])
      expect(() => catalogURL(url)).toThrow();
    await expect(
      boundedDownload(
        transport(bytes, { redirected: true }),
        manifestURL,
        2_000_000,
        signal()
      )
    ).rejects.toThrow();
    await expect(
      boundedDownload(
        transport(bytes, { url: 'https://localhost/x' }),
        manifestURL,
        2_000_000,
        signal()
      )
    ).rejects.toThrow();
  });
  it('rejects over-size streams, disguised MIME, corrupted/forged digests and schemas', async () => {
    await expect(
      boundedDownload(transport(new Uint8Array(11)), manifestURL, 10, signal())
    ).rejects.toThrow();
    await expect(
      boundedDownload(
        transport(bytes, {
          headers: new Headers({ 'content-type': 'text/html' }),
        }),
        manifestURL,
        2_000_000,
        signal()
      )
    ).rejects.toThrow();
    await expect(
      fetchCatalog(transport(bytes.slice(1)), source, release, signal())
    ).rejects.toThrow();
    const forged = {
      ...source,
      releases: [{ ...release, sha256: 'b'.repeat(64) }],
    };
    await expect(
      fetchCatalog(
        transport(bytes),
        forged,
        forged.releases[0] as typeof release,
        signal()
      )
    ).rejects.toThrow();
    await expect(
      fetchManifest(
        transport(
          new TextEncoder().encode(
            JSON.stringify({ ...source, schemaVersion: 2 })
          )
        ),
        manifestURL,
        signal()
      )
    ).rejects.toThrow();
  });
  it('times out and cancels pending transport; a subsequent retry succeeds', async () => {
    const stuck: CatalogTransport = {
      fetch: () => new Promise(() => undefined),
    };
    await expect(
      boundedDownload(stuck, manifestURL, 10, signal(), 10)
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      boundedDownload(
        transport(bytes),
        manifestURL,
        bytes.length,
        controller.signal
      )
    ).rejects.toThrow();
    expect(
      (
        await boundedDownload(
          transport(bytes),
          manifestURL,
          bytes.length,
          signal()
        )
      ).length
    ).toBe(bytes.length);
  });
  it('keeps old ID/version snapshots and state on failed updates or persistence', async () => {
    const state = addCatalog(
      registerSource(emptyLearningState(), source),
      catalog
    );
    expect(() =>
      registerSource(state, {
        ...source,
        releases: [{ ...release, sha256: 'b'.repeat(64) }],
      })
    ).toThrow();
    expect(() =>
      addCatalog(state, { ...catalog, title: 'replacement' })
    ).toThrow();
    const session = new LearningSession(state, {
      async save() {
        throw new Error('disk full');
      },
    });
    await expect(
      session.commit(0, (current) =>
        addCatalog(current, { ...catalog, version: '2.0.0' })
      )
    ).rejects.toThrow();
    expect(session.state).toEqual(state);
  });
  it('bounds decoded compressed responses rather than comparing wire Content-Length', async () => {
    const compressedHeaders = new Headers({
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': '10',
    });
    expect(
      await boundedDownload(
        transport(bytes, { headers: compressedHeaders }),
        manifestURL,
        bytes.length,
        signal()
      )
    ).toEqual(bytes);
    await expect(
      boundedDownload(
        transport(bytes, { headers: compressedHeaders }),
        manifestURL,
        10,
        signal()
      )
    ).rejects.toThrow();
  });
  it('retains withdrawn releases and refuses registry identity changes', () => {
    const registered = registerSource(emptyLearningState(), source);
    expect(registerSource(registered, source).sources).toEqual(
      registered.sources
    );
    const updated = registerSource(registered, {
      ...source,
      releases: [{ ...release, version: '2.0.0' }],
    });
    expect(updated.sources?.[0]?.releases.length).toBe(2);
    expect(() =>
      registerSource(registered, { ...source, catalogID: 'different' })
    ).toThrow();
    const lesson = catalog.lessons[0];
    if (!lesson) throw new Error('Missing lesson');
    expect(currentProgress(registered, catalog, lesson)).toBeUndefined();
    const loaded = addCatalog(registered, catalog);
    const key = JSON.stringify([catalog.catalogID, catalog.version, lesson.id]);
    const started = startLesson(loaded, key, 'registry-check');
    expect(startLesson(started, key, 'ignored-resume')).toBe(started);
    expect(currentProgress(started, catalog, lesson)?.session).toBe(
      'registry-check'
    );
  });
  it('rejects truncated responses and cancels a stalled body', async () => {
    await expect(
      boundedDownload(
        transport(bytes, {
          headers: new Headers({
            'content-type': 'application/json',
            'content-length': String(bytes.length + 1),
          }),
        }),
        manifestURL,
        bytes.length + 1,
        signal()
      )
    ).rejects.toThrow();
    const stalled = transport(bytes, {
      body: new ReadableStream({
        pull() {
          return new Promise(() => undefined);
        },
      }),
    });
    await expect(
      boundedDownload(stalled, manifestURL, bytes.length, signal(), 10)
    ).rejects.toThrow();
    const exact = await boundedDownload(
      transport(bytes, {
        headers: new Headers({
          'content-type': 'text/plain',
          'content-length': String(bytes.length),
        }),
      }),
      manifestURL,
      bytes.length,
      signal()
    );
    expect(exact).toEqual(bytes);
    const broken = transport(bytes, {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(11));
        },
        cancel() {
          throw new Error('transport already closed');
        },
      }),
    });
    await expect(
      boundedDownload(broken, manifestURL, 10, signal())
    ).rejects.toThrow();
    await Promise.resolve();
  });
  it('separates identical lesson IDs across catalog identity and version', () => {
    const state = addCatalog(addCatalog(emptyLearningState(), catalog), {
      ...catalog,
      catalogID: 'other-catalog',
    });
    expect(state.catalogs.length).toBe(2);
    expect(state.catalogs[0]?.lessons[0]?.id).toBe(
      state.catalogs[1]?.lessons[0]?.id
    );
  });
});
