import { describe, expect, it } from 'bun:test';
import { readableError } from './readable-error';

describe('readableError', () => {
  it('Error インスタンスなら message をそのまま返す', () => {
    expect(readableError(new Error('壊れました'), '既定文言')).toBe(
      '壊れました'
    );
  });

  it('Error 以外（文字列・null・undefined）は既定文言を返す', () => {
    expect(readableError('文字列エラー', '既定文言')).toBe('既定文言');
    expect(readableError(null, '既定文言')).toBe('既定文言');
    expect(readableError(undefined, '既定文言')).toBe('既定文言');
  });
});
