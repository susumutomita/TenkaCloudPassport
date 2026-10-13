import { fetch } from 'expo/fetch';
import type { CatalogTransport } from './catalog-download';
export const catalogTransport: CatalogTransport = {
  fetch: (url, signal) =>
    fetch(url, {
      signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json, text/plain' },
    }),
};
