import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BRAND_MARK_ICON_GEOMETRY,
  generateBrandMarkIconPng,
} from './brand-mark-icon';

/**
 * Issue 91: アプリアイコン 4 アセット（`assets/icon.png` /
 * `assets/adaptive-icon.png` / `assets/favicon.png` / `assets/splash-icon.png`）を
 * TenkaCloud の Ink / Summit 山頂マーク（`docs/design/2026-07-20-ink-summit-redesign.md`）へ
 * 差し替える。ラスタライズは Issue 88 の `scripts/brand-mark-icon.ts` を
 * 再利用する（幾何・アンチエイリアスの実装は 1 箇所のまま、`markScale` /
 * `colors` の options だけをアセットごとに切り替える）。
 *
 * 手描き・外部 GUI ツールでのバイナリ持ち込みはしない。再実行しても常に同じ
 * バイト列を出力する決定論的な生成（`generate-app-icons.test.ts` の
 * 「再実行しても決定論的に同一バイト列を生成する」で担保）。
 */

/** iOS App Icon（マスク前提。角丸は入れない）。1024px 角。 */
const ICON_SIZE_PX = 1024;
/** Android adaptive icon の foreground。1024px 角。 */
const ADAPTIVE_ICON_SIZE_PX = 1024;
/** Web favicon。 */
const FAVICON_SIZE_PX = 48;
/** Splash 画面中央のマーク。既存アセットと同じ 512px 角を維持する。 */
const SPLASH_ICON_SIZE_PX = 512;

/**
 * Android adaptive icon の safe zone 比率。
 * Android 公式ガイドでは 108dp キャンバスに対し中央 72dp（=2/3≈66.7%）が
 * 全ランチャーのマスク形状に関わらず欠けずに見える safe zone とされる。
 * Issue 91 の詳細設計が明示する「中央 66%」に合わせて 0.66 を採用する
 * （2/3 との差は 1024px 換算で数 px 程度であり、より安全側に丸めている）。
 */
export const ADAPTIVE_ICON_SAFE_ZONE_RATIO = 0.66;

export interface GeneratedAppIcon {
  /** リポジトリルートからの相対パス。 */
  readonly assetPath: string;
  readonly png: Uint8Array;
}

/**
 * TenkaCloud アプリアイコン 4 アセットを決定論的に生成する。
 * 純関数（ファイル I/O を行わない）。実際に `assets/` へ書き出すには
 * `writeAppIconAssets` を使う。
 */
export function generateAppIconAssets(): readonly GeneratedAppIcon[] {
  return [
    {
      assetPath: 'assets/icon.png',
      // Ink 背景 + 白マーク・等倍（Issue 88 の og.png / PWA アイコンと同一デザイン）。
      // iOS はプラットフォーム側でマスクを付けるため角丸は入れない。
      png: generateBrandMarkIconPng(ICON_SIZE_PX),
    },
    {
      assetPath: 'assets/adaptive-icon.png',
      // マークを Android のセーフゾーン（中央 66%）へ収める。背景色は
      // `app.json` の `android.adaptiveIcon.backgroundColor` (#1d1d1f) と揃える。
      png: generateBrandMarkIconPng(ADAPTIVE_ICON_SIZE_PX, {
        markScale: ADAPTIVE_ICON_SAFE_ZONE_RATIO,
      }),
    },
    {
      assetPath: 'assets/favicon.png',
      png: generateBrandMarkIconPng(FAVICON_SIZE_PX),
    },
    {
      assetPath: 'assets/splash-icon.png',
      // splash は白地の画面（`app.json` の `splash.backgroundColor` = #ffffff）
      // に載るため、配色を反転して白地 + Ink マークにする。
      png: generateBrandMarkIconPng(SPLASH_ICON_SIZE_PX, {
        colors: {
          background: BRAND_MARK_ICON_GEOMETRY.white,
          mark: BRAND_MARK_ICON_GEOMETRY.ink,
        },
      }),
    },
  ];
}

export interface WriteAppIconAssetsOptions {
  /** アセットパスの解決基点。通常はリポジトリルート。 */
  readonly repoRoot: string;
}

/**
 * `generateAppIconAssets()` の出力を `repoRoot` 配下の実ファイルへ書き出す。
 * `assets/` ディレクトリは事前に存在している前提とし（`assets/` はこの
 * リポジトリに既存のディレクトリであり、存在しない場合は書き込み先の前提が
 * 崩れているため fail-closed で Error にする）、書き出した絶対パスの一覧を返す。
 *
 * 4 ファイルを逐次書き込むため、途中（例: 3 番目）で書き込みが失敗すると
 * 一部だけ新デザインへ上書き済みという中間状態が `assets/` に残り得る。
 * 生成内容は決定論的（同じコードからは常に同じバイト列）なので再実行すれば
 * 収束するが、呼び出し側で途中失敗時のロールバックは行わない。
 */
export async function writeAppIconAssets(
  options: WriteAppIconAssetsOptions
): Promise<readonly string[]> {
  const writtenPaths: string[] = [];
  for (const asset of generateAppIconAssets()) {
    const absolutePath = path.join(options.repoRoot, asset.assetPath);
    await writeFile(absolutePath, asset.png);
    writtenPaths.push(absolutePath);
  }
  return writtenPaths;
}

async function main(): Promise<void> {
  const repoRoot = path.join(import.meta.dir, '..');
  const writtenPaths = await writeAppIconAssets({ repoRoot });
  for (const writtenPath of writtenPaths) {
    console.log(
      `app icon を書き出した: ${path.relative(repoRoot, writtenPath)}`
    );
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('アプリアイコンの生成に失敗した。', error);
    process.exitCode = 1;
  });
}
