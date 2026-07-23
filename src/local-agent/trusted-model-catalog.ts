/**
 * Issue 104 PR #132（Codex 指摘 major、モデル入手経路）: 通常の利用者は Document
 * Picker 経由の手動 GGUF import しか経路を持たず、`EXPO_PUBLIC_LOCAL_MODEL_PATH`
 * を自分でビルド設定へ書ける owner 以外は Native でも実質 Rules-only になって
 * いた。v1.0 の推奨 Model（ADR-0037、Qwen2.5-1.5B-Instruct・Q4_K_M・Apache-2.0）を
 * 信頼済み URL・期待 SHA-256 として設定に切り出し、`trusted-model-download.ts` の
 * orchestration から参照する。ハードコードした値は一次情報（Hugging Face）で
 * 確認済み（下記 `source` 参照）。将来 Bonsai 等を追加する場合もこのカタログへ
 * エントリを足すだけで済む形にする。
 */

export interface TrustedModelSource {
  /** Manifest 上の識別子。将来カタログへ複数エントリを足す場合の一意 key。 */
  readonly id: string;
  readonly displayName: string;
  readonly license: string;
  readonly licenseUrl: string;
  /** Hugging Face の `resolve/main/...` 安定 URL（Range request 対応、`accept-ranges: bytes` 確認済み）。 */
  readonly url: string;
  /** 期待 SHA-256（小文字 64 桁 hex）。ダウンロード後にこの値と一致することを検証する。 */
  readonly sha256: string;
  readonly sizeBytes: number;
  /** 一次情報の出典。owner・レビュアが値を再確認できるようにする。 */
  readonly source: string;
}

/**
 * Qwen2.5-1.5B-Instruct-GGUF の Q4_K_M 量子化版。
 * - URL・SHA-256・サイズは 2026-07-23 に Hugging Face の Git LFS ポインタと
 *   `resolve/main/...` の実 HTTP レスポンスヘッダー
 *   （`x-linked-size` / `x-linked-etag` / `accept-ranges: bytes`）の両方で確認済み。
 * - ライセンス Apache-2.0 は ADR-0037 で確認済み（`qwen-research` ライセンスの
 *   Qwen2.5-3B-Instruct-GGUF とは異なる）。
 */
export const QWEN2_5_1_5B_INSTRUCT_Q4_K_M: TrustedModelSource = {
  id: 'qwen2.5-1.5b-instruct-q4_k_m',
  displayName: 'Qwen2.5-1.5B-Instruct (Q4_K_M)',
  license: 'Apache-2.0',
  licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  sizeBytes: 1_117_320_736,
  source: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
};

export const TRUSTED_MODEL_CATALOG: readonly TrustedModelSource[] = [
  QWEN2_5_1_5B_INSTRUCT_Q4_K_M,
];

export function findTrustedModelSource(id: string): TrustedModelSource | null {
  return TRUSTED_MODEL_CATALOG.find((candidate) => candidate.id === id) ?? null;
}
