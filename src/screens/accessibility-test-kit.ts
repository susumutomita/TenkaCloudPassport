import { expect } from 'bun:test';

/**
 * この repo は React レンダリング用のテスト基盤（React Testing Library 相当）を
 * 持たないため（新規依存を増やさない方針）、Screen / Component の Accessibility 契約と
 * 文言順序をソーステキスト検査で固定する。複数の Accessibility Test file で同じ
 * 読み込み・順序検査を重複させず、ここへ集約する。
 */
export async function readSourceFile(
  baseUrl: string,
  fileName: string
): Promise<string> {
  return Bun.file(new URL(fileName, baseUrl)).text();
}

export function expectInOrder(text: string, labels: readonly string[]): void {
  let previous = -1;
  for (const label of labels) {
    const position = text.indexOf(label);
    expect(position).toBeGreaterThan(previous);
    previous = position;
  }
}
