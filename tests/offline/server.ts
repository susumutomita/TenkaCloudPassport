/** Test-only transport: real embedded host and file-backed SQLite; no production network listener. */
import { Database } from 'bun:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ForensicHost, type PracticeSqlite } from '../../src/app/forensic/host';

const directory = mkdtempSync(join(tmpdir(), 'passport-browser-sqlite-'));
const result = await build({
  entryPoints: ['tests/offline/entry.tsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  resolveExtensions: [
    '.web.tsx',
    '.web.ts',
    '.web.js',
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.json',
  ],
  external: ['../fabric/NativeSvgSoundModule'],
  format: 'iife',
  jsx: 'automatic',
  alias: { 'react-native': 'react-native-web' },
  define: { 'process.env.NODE_ENV': '"test"', __DEV__: 'true' },
});
const script = result.outputFiles[0]?.text;
const sessions = new Map<
  string,
  { host: ForensicHost; db: Database; fail: boolean }
>();
const keys = new Map<string, string>();
function session(id: string) {
  let current = sessions.get(id);
  if (current) return current;
  const db = new Database(join(directory, `${id}.sqlite`));
  const adapter: PracticeSqlite = {
    execSync: (sql) => db.exec(sql),
    runSync: (sql, ...args) => {
      const owned = sessions.get(id);
      if (owned?.fail && sql.startsWith('INSERT')) {
        owned.fail = false;
        throw new Error('Synthetic save failure');
      }
      return db.query(sql).run(...args);
    },
    getFirstSync: <T>(sql: string, ...args: (string | number | null)[]) =>
      db.query(sql).get(...args) as T | null,
  };
  const host = new ForensicHost(
    async () => adapter,
    {
      read: async () => keys.get(id) ?? null,
      write: async (value) => {
        keys.set(id, value);
      },
      remove: async () => {
        keys.delete(id);
      },
    },
    () => 'a'.repeat(64),
    (operation) => operation()
  );
  current = { host, db, fail: false };
  sessions.set(id, current);
  return current;
}
Bun.serve({
  port: 4174,
  hostname: '127.0.0.1',
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/app.js')
      return new Response(script, {
        headers: { 'Content-Type': 'text/javascript' },
      });
    const route = /^\/api\/([a-z0-9-]+)\/(load|submit|restart|fail)$/.exec(
      path
    );
    if (route) {
      const id = route[1];
      if (!id) return new Response(null, { status: 400 });
      const current = session(id);
      if (route[2] === 'restart') {
        current.db.close();
        sessions.delete(id);
        return Response.json({ ok: true });
      }
      if (route[2] === 'fail') {
        current.fail = true;
        return Response.json({ ok: true });
      }
      try {
        return Response.json(
          route[2] === 'load'
            ? await current.host.load()
            : await current.host.submit(await request.json())
        );
      } catch {
        return Response.json(
          { error: 'synthetic test failure' },
          { status: 503 }
        );
      }
    }
    return new Response(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%}#root{display:flex;flex-direction:column}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  },
});
