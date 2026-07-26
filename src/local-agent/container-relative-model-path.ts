/**
 * iOS / Android は再インストール・Clean Build・App 更新のたびに app-private data
 * container（iOS のアプリ専用 Data Container UUID など）を差し替える。Import 時に
 * 保存した絶対 File URI（`Documents/local-models/<sha256>.gguf` を含む絶対 Path）は
 * その時点の container を焼き込んでおり、Model File 自体が新 container の同じ相対
 * Path へそのまま移動していても、保存済み絶対 URI は古い container を指したまま残る
 * （ADR-0045、Issue 152 の実機調査で確認）。
 *
 * この絶対 URI を「保存時の値と現在の値が一致するか」という境界チェックに使うと、
 * container が変わるたびに正当な Model File を private storage の外にあると誤判定
 * する。信用してよいのは file 名（allow-list pattern で検証済み）だけであり、
 * 絶対 Path prefix ではない。`resolveManagedFileName` は候補 URI から file 名だけを
 * 取り出し、pattern に一致することだけを確認する。呼び出し側はこの file 名を、
 * 常に「現在の」managed directory から再構築する（保存済み絶対 URI とは比較しない）。
 *
 * file 名の抽出は `expo-file-system` の `File#name` と同じ値を返すが、あえて
 * ここで自前実装する。この module は Expo / React を import しない pure module
 * として保つことで bun test から直接呼び出して検証できるようにするためであり
 * （`expo-file-system` は React Native runtime 前提で bun test 単体では import
 * できない）、native binding への依存を増やさない。
 */
/** Model 本体 File 名の allow-list（sha256 の小文字 16 進 64 桁 + `.gguf`）。 */
export const MANAGED_MODEL_FILE_PATTERN = /^([a-f0-9]{64})\.gguf$/;
/** 削除 staging 中の File 名の allow-list。 */
export const MANAGED_STAGED_FILE_PATTERN = /^([a-f0-9]{64})\.deleting\.gguf$/;

function basenameOfUri(uri: string): string {
  const withoutTrailingSlash = uri.endsWith('/') ? uri.slice(0, -1) : uri;
  const separatorIndex = withoutTrailingSlash.lastIndexOf('/');
  return separatorIndex === -1
    ? withoutTrailingSlash
    : withoutTrailingSlash.slice(separatorIndex + 1);
}

/**
 * 候補 URI（絶対 File URI・裸の file 名のいずれでもよい）から file 名を取り出し、
 * `pattern` に一致することを確認する。一致しなければ `Error` を投げる。絶対 Path
 * prefix（container を含む部分、`../` 等の traversal 断片を含む）は一切見ない。
 * 返すのは file 名の文字列だけであり、呼び出し側は必ずこの file 名を「現在の」
 * managed directory から再構築しなければならない。返り値を信頼できない Path
 * prefix と単純結合したり、そのまま外部へ渡したりしない限り、`../` を含む候補
 * URI（basename が偶然 pattern に一致するものも含む）が private storage の外を
 * 指すことはない。呼び出し側はこの Error を型で判別しない（file store の他の
 * 内部整合性エラーと同じく、一律 catch して型付き Lifecycle Error へ正規化する）
 * ため、専用の Error subclass ではなく他の内部エラーと同じ plain `Error` にする。
 */
export function resolveManagedFileName(
  candidateUri: string,
  pattern: RegExp
): string {
  const name = basenameOfUri(candidateUri);
  if (!pattern.test(name)) {
    throw new Error('Managed model file name is invalid.');
  }
  return name;
}
