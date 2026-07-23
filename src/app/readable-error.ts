/**
 * `unknown` として catch した例外を、Owner に見せてよい文字列へ変換する共通 helper。
 * `Error` インスタンスならその `message` を、そうでなければ呼び出し側が指定した
 * 既定文言を返す。複数箇所（`PassportApp.tsx` 等）が同じ形の変換をそれぞれ個別に
 * 実装していたため、ここへ集約する（Reuse/Simplification レビュー指摘の反映）。
 */
export function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
