import { object, requireValid } from './primitives';
export interface CatalogRelease {
  readonly version: string;
  readonly catalogSchemaVersion: 1;
  readonly commitSHA: string;
  readonly payloadPath: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface CatalogSource {
  readonly manifestURL: string;
  readonly catalogID: string;
  readonly title: string;
  readonly releases: readonly CatalogRelease[];
}
export function catalogURL(raw: string, immutable = false): URL {
  requireValid(
    raw.length <= 1000 &&
      !raw.includes('%') &&
      !raw.includes('\\') &&
      !/\/\.{1,2}(?:\/|$)/.test(raw)
  );
  const url = new URL(raw);
  requireValid(
    url.protocol === 'https:' &&
      url.hostname === 'raw.githubusercontent.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
  );
  const parts = url.pathname.split('/').slice(1);
  requireValid(
    parts.length >= 4 &&
      parts.every(
        (part) =>
          /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'
      )
  );
  if (immutable) requireValid(/^[a-f0-9]{40}$/.test(parts[2] ?? ''));
  return url;
}
export function validateSource(value: unknown): CatalogSource {
  const source = object(value);
  requireValid(
    source['schemaVersion'] === 1 &&
      Object.keys(source).every((key) =>
        [
          'schemaVersion',
          'manifestURL',
          'catalogID',
          'title',
          'releases',
        ].includes(key)
      )
  );
  requireValid(typeof source['manifestURL'] === 'string');
  catalogURL(source['manifestURL']);
  requireValid(
    typeof source['catalogID'] === 'string' &&
      source['catalogID'].length > 0 &&
      source['catalogID'].length <= 200
  );
  requireValid(
    typeof source['title'] === 'string' &&
      source['title'].length > 0 &&
      source['title'].length <= 500
  );
  requireValid(
    Array.isArray(source['releases']) && source['releases'].length <= 50
  );
  const releases = source['releases'].map((value: unknown) => {
    const release = object(value);
    requireValid(
      Object.keys(release).every((key) =>
        [
          'version',
          'catalogSchemaVersion',
          'commitSHA',
          'payloadPath',
          'bytes',
          'sha256',
        ].includes(key)
      )
    );
    requireValid(
      typeof release['version'] === 'string' &&
        /^\d+\.\d+\.\d+$/.test(release['version'])
    );
    requireValid(release['catalogSchemaVersion'] === 1);
    requireValid(
      typeof release['commitSHA'] === 'string' &&
        /^[a-f0-9]{40}$/.test(release['commitSHA'])
    );
    requireValid(
      typeof release['payloadPath'] === 'string' &&
        release['payloadPath']
          .split('/')
          .every(
            (part) =>
              /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'
          )
    );
    requireValid(
      Number.isSafeInteger(release['bytes']) &&
        (release['bytes'] as number) > 0 &&
        (release['bytes'] as number) <= 2_000_000
    );
    requireValid(
      typeof release['sha256'] === 'string' &&
        /^[a-f0-9]{64}$/.test(release['sha256'])
    );
    return {
      version: release['version'],
      catalogSchemaVersion: 1 as const,
      commitSHA: release['commitSHA'],
      payloadPath: release['payloadPath'],
      bytes: release['bytes'] as number,
      sha256: release['sha256'],
    };
  });
  requireValid(
    new Set(releases.map((item) => item.version)).size === releases.length
  );
  return value as CatalogSource;
}
export function payloadURL(
  source: CatalogSource,
  release: CatalogRelease
): string {
  const parts = catalogURL(source.manifestURL).pathname.split('/');
  return catalogURL(
    `https://raw.githubusercontent.com/${parts[1]}/${parts[2]}/${release.commitSHA}/${release.payloadPath}`,
    true
  ).href;
}
