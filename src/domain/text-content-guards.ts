/*
 * Issue 155: モデル由来の表示文を複数機能で同じ基準へ収束させる Pure Domain Guard。
 * Grounded Quote と会話例の双方が、連絡先らしい内容・制御文字・改行を個別実装せず
 * このモジュールを正本として使う。
 */

/**
 * メールアドレス、URL、電話番号らしい数字列。短い年号や件数は許可する。
 * 3 つ目は先頭と末尾が数字で、その間に数字・空白・電話記号が 5 文字以上ある形
 * （最短 7 桁相当）だけを対象にする。
 */
const CONTACT_LIKE_PATTERNS: readonly RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
  /(?:https?:\/\/|www\.)\S+/iu,
  /\d[\d\s()+-]{5,}\d/u,
];

/** C0/C1 制御文字、書式制御、Default Ignorable を表示文へ通さない。 */
const FORBIDDEN_TEXT_UNICODE =
  /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/** JavaScript の改行に加え、Unicode の行・段落区切りも単一行表示では拒否する。 */
const LINE_BREAK_PATTERN = /[\r\n\u2028\u2029]/u;

export function containsContactLikeText(value: string): boolean {
  return CONTACT_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsForbiddenTextUnicode(value: string): boolean {
  return FORBIDDEN_TEXT_UNICODE.test(value);
}

export function isSingleLineText(value: string): boolean {
  return !LINE_BREAK_PATTERN.test(value);
}
