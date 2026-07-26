import { describe, expect, it } from 'bun:test';
import {
  MANAGED_MODEL_FILE_PATTERN,
  MANAGED_STAGED_FILE_PATTERN,
  resolveManagedFileName,
} from './container-relative-model-path';

const INVALID_NAME_MESSAGE = 'Managed model file name is invalid.';

const SHA256 =
  '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e';

/**
 * 実機の実 manifest（Issue 152）からそのまま採った stale な privateUri。
 * container UUID `FF11A9B9-...` は既にこの端末には存在しないが、実際の File は
 * 同じ file 名で `471BC8AB-...` container に移動済みだった。
 */
const REAL_STALE_PRIVATE_URI =
  'file:///Users/susumu/Library/Developer/CoreSimulator/Devices/11B71247-E422-4C26-82A0-EE386E49477E/data/Containers/Data/Application/FF11A9B9-4586-4CFB-9804-2DC152E52233/Documents/local-models/6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e.gguf';

const REAL_CURRENT_PRIVATE_URI =
  'file:///Users/susumu/Library/Developer/CoreSimulator/Devices/11B71247-E422-4C26-82A0-EE386E49477E/data/Containers/Data/Application/471BC8AB-7409-42B1-901F-6F48F2DF0BD3/Documents/local-models/6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e.gguf';

describe('Container-relative Managed Model File 名解決', () => {
  it('実機で観測した stale / 現行 container の絶対 URI から同じ file 名を抽出する', () => {
    expect(
      resolveManagedFileName(REAL_STALE_PRIVATE_URI, MANAGED_MODEL_FILE_PATTERN)
    ).toBe(`${SHA256}.gguf`);
    expect(
      resolveManagedFileName(
        REAL_CURRENT_PRIVATE_URI,
        MANAGED_MODEL_FILE_PATTERN
      )
    ).toBe(`${SHA256}.gguf`);
  });

  it('staged 削除 file 名 (`<sha256>.deleting.gguf`) も抽出する', () => {
    const stagedUri = `file:///private/container-a/local-models/${SHA256}.deleting.gguf`;
    expect(resolveManagedFileName(stagedUri, MANAGED_STAGED_FILE_PATTERN)).toBe(
      `${SHA256}.deleting.gguf`
    );
  });

  it('スキームやディレクトリを持たない裸の file 名もそのまま扱う', () => {
    expect(
      resolveManagedFileName(`${SHA256}.gguf`, MANAGED_MODEL_FILE_PATTERN)
    ).toBe(`${SHA256}.gguf`);
  });

  it('末尾スラッシュ付きの Directory URI を誤って渡した場合は Directory 名を候補にして拒否する', () => {
    expect(() =>
      resolveManagedFileName(
        'file:///private/local-models/',
        MANAGED_MODEL_FILE_PATTERN
      )
    ).toThrow(INVALID_NAME_MESSAGE);
  });

  it('`../` traversal を含む Path でも、basename が pattern に一致すれば file 名だけを返し、traversal 断片は含めない', () => {
    // これは意図的な仕様である。境界は呼び出し側が「返り値の file 名を、常に
    // 現在の managed directory から再構築する」ことで担保する（絶対 Path
    // prefix を信用しない・単純結合しない）。この関数自体が traversal 文字列を
    // 拒否するわけではない。
    const traversalPrefixedUri = `file:///private/local-models/../../etc/${SHA256}.gguf`;

    const name = resolveManagedFileName(
      traversalPrefixedUri,
      MANAGED_MODEL_FILE_PATTERN
    );

    expect(name).toBe(`${SHA256}.gguf`);
    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
  });

  it('allow-list pattern に一致しない file 名は Error で拒否する', () => {
    for (const invalid of [
      '',
      'not-a-model.gguf',
      `${SHA256}.GGUF`,
      `${SHA256.toUpperCase()}.gguf`,
      `${SHA256}.bin`,
      `${SHA256.slice(0, 63)}.gguf`,
      `file:///private/local-models/../../etc/passwd`,
      `file:///private/local-models/${SHA256}.deleting.gguf`,
    ]) {
      expect(() =>
        resolveManagedFileName(invalid, MANAGED_MODEL_FILE_PATTERN)
      ).toThrow(INVALID_NAME_MESSAGE);
    }
  });

  it('本体 pattern と staged pattern は互いの file 名を受理しない', () => {
    const finalUri = `file:///private/local-models/${SHA256}.gguf`;
    expect(() =>
      resolveManagedFileName(finalUri, MANAGED_STAGED_FILE_PATTERN)
    ).toThrow(INVALID_NAME_MESSAGE);
  });
});
