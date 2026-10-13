import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Catalog } from '../../domain/learning/model';
import {
  type CatalogRelease,
  type CatalogSource,
  catalogURL,
  payloadURL,
  validateSource,
} from '../../domain/learning/source';
import {
  importCatalog,
  object,
  parseJSON,
  requireValid,
} from '../../domain/learning/validation';
export interface CatalogResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly url: string;
  readonly redirected: boolean;
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
}
export interface CatalogTransport {
  fetch(url: string, signal: AbortSignal): Promise<CatalogResponse>;
}
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('取得を中断しました。');
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(
        new Error('取得を中断しました。時間切れの場合は再試行してください。')
      );
    };
    signal.addEventListener('abort', cancel, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}
export async function boundedDownload(
  transport: CatalogTransport,
  url: string,
  limit: number,
  signal: AbortSignal,
  timeout = 15000
): Promise<Uint8Array> {
  catalogURL(url);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, timeout);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (controller.signal.aborted) throw new Error('取得を中断しました。');
    const response = await abortable(
      transport.fetch(url, controller.signal),
      controller.signal
    );
    requireValid(
      response.ok &&
        response.status === 200 &&
        !response.redirected &&
        response.url === url
    );
    requireValid(
      /^(application\/json|text\/plain)(?:;|$)/i.test(
        response.headers.get('content-type') ?? ''
      )
    );
    const declared = response.headers.get('content-length');
    if (declared !== null)
      requireValid(/^\d+$/.test(declared) && Number(declared) <= limit);
    requireValid(response.body);
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await abortable(reader.read(), controller.signal);
      requireValid(!controller.signal.aborted);
      if (next.done) break;
      size += next.value.length;
      requireValid(size <= limit);
      chunks.push(next.value);
    }
    // Fetch exposes decoded bytes; Content-Length describes the compressed wire body.
    const encoding = response.headers.get('content-encoding');
    if (declared !== null && (!encoding || encoding === 'identity')) {
      requireValid(size === Number(declared));
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    controller.abort();
    if (reader) void reader.cancel().catch(() => undefined);
  }
}
export async function fetchManifest(
  transport: CatalogTransport,
  manifestURL: string,
  signal: AbortSignal
): Promise<CatalogSource> {
  const url = catalogURL(manifestURL).href;
  const bytes = await boundedDownload(transport, url, 256_000, signal);
  const manifest = object(
    parseJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 256_000)
  );
  requireValid(manifest['schemaVersion'] === 1);
  return validateSource({ ...manifest, manifestURL: url });
}
export async function fetchCatalog(
  transport: CatalogTransport,
  source: CatalogSource,
  release: CatalogRelease,
  signal: AbortSignal
): Promise<Catalog> {
  validateSource(source);
  requireValid(source.releases.includes(release));
  const bytes = await boundedDownload(
    transport,
    payloadURL(source, release),
    release.bytes,
    signal
  );
  requireValid(
    bytes.length === release.bytes &&
      bytesToHex(sha256(bytes)) === release.sha256
  );
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  const repository = catalogURL(source.manifestURL)
    .pathname.split('/')
    .slice(1, 3)
    .join('/');
  const catalog = importCatalog(
    JSON.stringify({
      schemaVersion: 1,
      source: {
        repositoryURL: `https://github.com/${repository}`,
        commitSHA: release.commitSHA,
        contentSHA256: release.sha256,
        payloadBase64: btoa(chunks.join('')),
      },
    })
  );
  requireValid(
    catalog.catalogID === source.catalogID &&
      catalog.version === release.version
  );
  return catalog;
}
