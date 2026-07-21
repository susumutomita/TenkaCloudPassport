import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateBrandMarkIconPng } from './brand-mark-icon';

/**
 * Issue 88: `bun run build:web`（`expo export --platform web`）が書き出した
 * `dist/` を、GitHub Pages `/TenkaCloudPassport/app/` サブパスでの PWA
 * （ホーム画面への追加）配信に必要な形へ仕上げる。設計は
 * `docs/design/2026-07-21-web-app-pages-distribution.md` を正本とする。
 *
 * Expo のデフォルト web template や `public/index.html` 差し替え機能は使わず、
 * build 後の `dist/index.html` を直接書き換える。理由は同設計書「案 b」を参照。
 */

export type PrepareWebAppExportErrorCode =
  | 'DIST_DIR_NOT_FOUND'
  | 'INDEX_HTML_NOT_FOUND'
  | 'INDEX_HTML_MALFORMED';

export class PrepareWebAppExportError extends Error {
  readonly code: PrepareWebAppExportErrorCode;

  constructor(code: PrepareWebAppExportErrorCode, message: string) {
    super(message);
    this.name = 'PrepareWebAppExportError';
    this.code = code;
  }
}

/** `dist/index.html` へ複数回実行しても二重挿入しないための marker。 */
const INJECTION_MARKER = '<!-- tenkacloud-pwa-meta -->';

export interface PrepareWebAppExportOptions {
  readonly distDir: string;
  readonly appName?: string;
  readonly shortName?: string;
  readonly startUrl?: string;
  readonly themeColor?: string;
  readonly backgroundColor?: string;
}

export interface PrepareWebAppExportResult {
  readonly indexHtmlPath: string;
  readonly manifestPath: string;
  readonly iconPaths: readonly string[];
  readonly headAlreadyInjected: boolean;
}

const DEFAULT_APP_NAME = 'TenkaCloud Passport';
const DEFAULT_SHORT_NAME = 'Passport';
const DEFAULT_START_URL = '/TenkaCloudPassport/app/';
const DEFAULT_THEME_COLOR = '#1d1d1f';
const DEFAULT_BACKGROUND_COLOR = '#ffffff';

/** manifest.webmanifest が参照する PWA アイコンのサイズ。 */
const ICON_SIZES = [192, 512] as const;

function iconFileName(sizePx: number): string {
  return `icon-${sizePx}.png`;
}

function buildHeadInjection(iconPaths: readonly string[]): string {
  const [firstIconPath] = iconPaths;
  const appleTouchIconHref = firstIconPath ?? iconFileName(ICON_SIZES[0]);
  return [
    INJECTION_MARKER,
    '<link rel="manifest" href="manifest.webmanifest">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    // Chromium は apple-mobile-web-app-capable を deprecated として警告し、標準化された
    // こちらの meta も併記するよう促す（Safari 向けには apple- 版が引き続き必要なため両方書く）。
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    `<meta name="theme-color" content="${DEFAULT_THEME_COLOR}">`,
    `<link rel="apple-touch-icon" href="${appleTouchIconHref}">`,
  ].join('\n');
}

function buildManifest(options: {
  appName: string;
  shortName: string;
  startUrl: string;
  themeColor: string;
  backgroundColor: string;
  iconPaths: readonly string[];
}): string {
  const manifest = {
    name: options.appName,
    short_name: options.shortName,
    display: 'standalone',
    start_url: options.startUrl,
    background_color: options.backgroundColor,
    theme_color: options.themeColor,
    icons: ICON_SIZES.map((size, index) => ({
      src: options.iconPaths[index] ?? iconFileName(size),
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function assertDistDirReady(
  distDir: string,
  indexHtmlPath: string
): Promise<void> {
  const distStat = await stat(distDir).catch(() => null);
  if (!distStat?.isDirectory()) {
    throw new PrepareWebAppExportError(
      'DIST_DIR_NOT_FOUND',
      `distDir が見つからない（先に bun run build:web を実行する）: ${distDir}`
    );
  }
  const indexStat = await stat(indexHtmlPath).catch(() => null);
  if (!indexStat?.isFile()) {
    throw new PrepareWebAppExportError(
      'INDEX_HTML_NOT_FOUND',
      `index.html が見つからない（build:web が失敗している可能性がある）: ${indexHtmlPath}`
    );
  }
}

/**
 * `options.distDir` を PWA 配信向けに仕上げる。
 *
 * 1. `index.html` の `</head>` 直前へ manifest link / apple-mobile-web-app-* meta /
 *    apple-touch-icon link を注入する（既に注入済みならスキップして idempotent にする）。
 * 2. `manifest.webmanifest` を書き出す。
 * 3. `icons/icon-192.png` と `icons/icon-512.png` を BrandMark 幾何定数から生成する。
 */
export async function prepareWebAppExport(
  options: PrepareWebAppExportOptions
): Promise<PrepareWebAppExportResult> {
  const distDir = path.resolve(options.distDir);
  const indexHtmlPath = path.join(distDir, 'index.html');
  await assertDistDirReady(distDir, indexHtmlPath);

  const appName = options.appName ?? DEFAULT_APP_NAME;
  const shortName = options.shortName ?? DEFAULT_SHORT_NAME;
  const startUrl = options.startUrl ?? DEFAULT_START_URL;
  const themeColor = options.themeColor ?? DEFAULT_THEME_COLOR;
  const backgroundColor = options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;

  const iconsDir = path.join(distDir, 'icons');
  await mkdir(iconsDir, { recursive: true });
  const iconPaths = ICON_SIZES.map((size) => `icons/${iconFileName(size)}`);
  await Promise.all(
    ICON_SIZES.map((size) =>
      writeFile(
        path.join(iconsDir, iconFileName(size)),
        generateBrandMarkIconPng(size)
      )
    )
  );

  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  await writeFile(
    manifestPath,
    buildManifest({
      appName,
      shortName,
      startUrl,
      themeColor,
      backgroundColor,
      iconPaths,
    })
  );

  const originalHtml = await readFile(indexHtmlPath, 'utf8');
  const headAlreadyInjected = originalHtml.includes(INJECTION_MARKER);
  if (!headAlreadyInjected) {
    if (!originalHtml.includes('</head>')) {
      throw new PrepareWebAppExportError(
        'INDEX_HTML_MALFORMED',
        `index.html に </head> が見つからない: ${indexHtmlPath}`
      );
    }
    const injectedHtml = originalHtml.replace(
      '</head>',
      `${buildHeadInjection(iconPaths)}\n</head>`
    );
    await writeFile(indexHtmlPath, injectedHtml);
  }

  return { indexHtmlPath, manifestPath, iconPaths, headAlreadyInjected };
}

async function main(): Promise<void> {
  const [distDirArgument] = Bun.argv.slice(2);
  const result = await prepareWebAppExport({
    distDir: distDirArgument ?? 'dist',
  });
  console.log(`index.html を更新した: ${result.indexHtmlPath}`);
  console.log(`manifest.webmanifest を書き出した: ${result.manifestPath}`);
  for (const iconPath of result.iconPaths) {
    console.log(`icon を書き出した: ${iconPath}`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof PrepareWebAppExportError) {
      console.error(`[${error.code}] ${error.message}`);
    } else {
      console.error('Web App Export の準備に失敗した。', error);
    }
    process.exitCode = 1;
  });
}
