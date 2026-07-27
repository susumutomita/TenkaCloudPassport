// ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: `getInfoAsync(uri, { md5:
// true })` によるネイティブ MD5 計算は `expo-file-system/legacy` にしか無い
// （新 API の `File.info()` は md5 を提供しない）。native 専用ファイルに
// とどめ、web を壊さない。
import * as LegacyFileSystem from 'expo-file-system/legacy';

/**
 * `/simplify` 指摘（reuse）: 「`getInfoAsync(uri, { md5: true })` を呼び、
 * `exists`/`md5` の両方を確認できなければ throw する」という同じ手順が
 * `expo-model-file-store.native.ts`（import 時・activate 時）と
 * `expo-trusted-model-download.native.ts`（取得時、`Paths.cache` 上の一時領域）の
 * 2 か所で複製されていたため、ここへ一本化する。
 *
 * code-reviewer 指摘（low、casing 防御）: iOS（`NSData+EXFileSystem.m` の
 * `%02x` フォーマット）・Android（`FileSystemLegacyModule.kt` の Apache Commons
 * Codec `Hex.encodeHex`）とも実装は小文字 hex を返すことを一次情報で確認済み
 * だが、`trusted-model-catalog.ts` の pinned 値（小文字固定）との比較が将来の
 * `expo-file-system` 更新で casing 起因に壊れないよう、ここで明示的に
 * 小文字化してから返す。
 */
export async function nativeMd5OfFile(uri: string): Promise<string> {
  const info = await LegacyFileSystem.getInfoAsync(uri, { md5: true });
  if (!info.exists || !info.md5) {
    throw new Error('Model file MD5 is unavailable.');
  }
  return info.md5.toLowerCase();
}
