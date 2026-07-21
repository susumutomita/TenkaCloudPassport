import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeRgbaPng } from './png-encoder';
import {
  PrepareWebAppExportError,
  prepareWebAppExport,
} from './prepare-web-app-export';

const MINIMAL_INDEX_HTML =
  '<!doctype html>\n<html lang="en">\n<head>\n<title>%WEB_TITLE%</title>\n</head>\n<body><div id="root"></div></body>\n</html>\n';

const directories: string[] = [];

async function temporaryDistDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tenka-web-app-export-'));
  directories.push(directory);
  return directory;
}

async function writeMinimalDist(distDir: string): Promise<void> {
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'index.html'), MINIMAL_INDEX_HTML);
}

afterEach(async () => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe('prepareWebAppExport', () => {
  it('index.html へ manifest link / apple-mobile-web-app meta / apple-touch-icon を注入する', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    const result = await prepareWebAppExport({ distDir });

    expect(result.headAlreadyInjected).toBe(false);
    const html = await readFile(result.indexHtmlPath, 'utf8');
    expect(html).toContain('<!-- tenkacloud-pwa-meta -->');
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes">'
    );
    expect(html).toContain(
      '<meta name="mobile-web-app-capable" content="yes">'
    );
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
    );
    expect(html).toContain('<meta name="theme-color" content="#1d1d1f">');
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="icons/icon-192.png">'
    );
    // 既存の head 内容（title のプレースホルダ）を壊さない。
    expect(html).toContain('<title>%WEB_TITLE%</title>');
  });

  it('manifest.webmanifest に既定値（TenkaCloud Passport / Cloudflare Workers の /app/ URL）を書く', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    const result = await prepareWebAppExport({ distDir });

    const manifestText = await readFile(result.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(manifest.name).toBe('TenkaCloud Passport');
    expect(manifest.short_name).toBe('Passport');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/app/');
    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.theme_color).toBe('#1d1d1f');
    expect(manifest.icons).toEqual([
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ]);
  });

  it('manifest の name / short_name / start_url / 色をオプションで上書きできる', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    const result = await prepareWebAppExport({
      distDir,
      appName: 'Custom App',
      shortName: 'Custom',
      startUrl: '/custom/',
      themeColor: '#000000',
      backgroundColor: '#111111',
    });

    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    expect(manifest.name).toBe('Custom App');
    expect(manifest.short_name).toBe('Custom');
    expect(manifest.start_url).toBe('/custom/');
    expect(manifest.background_color).toBe('#111111');
    // meta[theme-color] は固定の Ink トークンで注入するため、manifest 側だけが変わる。
    expect(manifest.theme_color).toBe('#000000');
  });

  it('icons/icon-192.png と icons/icon-512.png を実 PNG として書き出す', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    const result = await prepareWebAppExport({ distDir });

    expect(result.iconPaths).toEqual([
      'icons/icon-192.png',
      'icons/icon-512.png',
    ]);
    for (const [index, iconPath] of result.iconPaths.entries()) {
      const bytes = await readFile(join(distDir, iconPath));
      const decoded = decodeRgbaPng(new Uint8Array(bytes));
      const expectedSize = index === 0 ? 192 : 512;
      expect(decoded.width).toBe(expectedSize);
      expect(decoded.height).toBe(expectedSize);
    }
  });

  it('2 回実行しても index.html の注入マーカーは 1 個のまま（idempotent）', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    await prepareWebAppExport({ distDir });
    const second = await prepareWebAppExport({ distDir });

    expect(second.headAlreadyInjected).toBe(true);
    const html = await readFile(second.indexHtmlPath, 'utf8');
    const markerCount = html.split('<!-- tenkacloud-pwa-meta -->').length - 1;
    expect(markerCount).toBe(1);
  });

  it('distDir 自体が存在しなければ DIST_DIR_NOT_FOUND を投げる', async () => {
    const distDir = join(tmpdir(), 'tenka-web-app-export-missing-dir');

    await expect(prepareWebAppExport({ distDir })).rejects.toThrow(
      PrepareWebAppExportError
    );
    await expect(prepareWebAppExport({ distDir })).rejects.toMatchObject({
      code: 'DIST_DIR_NOT_FOUND',
    });
  });

  it('distDir はあるが index.html がなければ INDEX_HTML_NOT_FOUND を投げる', async () => {
    const distDir = await temporaryDistDir();
    await mkdir(distDir, { recursive: true });

    await expect(prepareWebAppExport({ distDir })).rejects.toMatchObject({
      code: 'INDEX_HTML_NOT_FOUND',
    });
  });

  it('index.html に </head> がなければ INDEX_HTML_MALFORMED を投げる', async () => {
    const distDir = await temporaryDistDir();
    await mkdir(distDir, { recursive: true });
    await writeFile(
      join(distDir, 'index.html'),
      '<html><body>no head here</body></html>'
    );

    await expect(prepareWebAppExport({ distDir })).rejects.toMatchObject({
      code: 'INDEX_HTML_MALFORMED',
    });
  });
});

/**
 * `spawnSync` の stdout/stderr パイプではなく、シェルリダイレクトで実ファイルへ
 * 書き出させてから読み直す。`bun test` 経由で子プロセスを起動する CLI 統合テストは
 * `scripts/architecture-harness.test.ts` でも同じ `spawnSync` パイプ方式を使っており
 * 通常は問題ないが、本ファイルではリダイレクト方式の方が安定して実行結果を取得できた
 * ため、実ファイル I/O ベースのこちらを採用する（モックではなく実プロセス・実ファイル）。
 */
function runCliRedirected(
  scriptPath: string,
  args: readonly string[],
  outDir: string
): { status: number | null; stdout: string; stderr: string } {
  const stdoutPath = join(outDir, 'cli-stdout.txt');
  const stderrPath = join(outDir, 'cli-stderr.txt');
  const quotedArgs = [scriptPath, ...args]
    .map((value) => `'${value.replaceAll("'", "'\\''")}'`)
    .join(' ');
  const result = spawnSync(
    'bash',
    ['-c', `bun ${quotedArgs} > '${stdoutPath}' 2> '${stderrPath}'`],
    { encoding: 'utf8' }
  );
  return {
    status: result.status,
    stdout: readFileSync(stdoutPath, 'utf8'),
    stderr: readFileSync(stderrPath, 'utf8'),
  };
}

describe('CLI: bun scripts/prepare-web-app-export.ts <distDir>', () => {
  const scriptPath = join(import.meta.dir, 'prepare-web-app-export.ts');

  it('distDir を引数で渡すと成功し、生成物が実ファイルとして残る', async () => {
    const distDir = await temporaryDistDir();
    await writeMinimalDist(distDir);

    const result = runCliRedirected(scriptPath, [distDir], distDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('manifest.webmanifest を書き出した');
    const html = await readFile(join(distDir, 'index.html'), 'utf8');
    expect(html).toContain('<!-- tenkacloud-pwa-meta -->');
  });

  it('distDir が存在しなければ exit code 1 でエラーコードを stderr へ出す', async () => {
    const missingDir = join(tmpdir(), 'tenka-web-app-export-cli-missing');
    const outDir = await temporaryDistDir();

    const result = runCliRedirected(scriptPath, [missingDir], outDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[DIST_DIR_NOT_FOUND]');
  });
});
