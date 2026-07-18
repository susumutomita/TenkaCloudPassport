import { describe, expect, it } from 'bun:test';
import { parseBoundedJson, SchemaValidationError } from './validation';

function nestedObject(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

describe('外部 JSON の共通上限', () => {
  it('UTF-8 byte 数が上限と同じ JSON を受理する', () => {
    const raw = JSON.stringify('x'.repeat(4_094));

    expect(new TextEncoder().encode(raw).byteLength).toBe(4_096);
    expect(parseBoundedJson(raw, 4_096, 8)).toBe('x'.repeat(4_094));
  });

  it('UTF-8 byte 数が上限を 1 byte 超える JSON を拒否する', () => {
    const raw = JSON.stringify('x'.repeat(4_095));

    expect(new TextEncoder().encode(raw).byteLength).toBe(4_097);
    expect(() => parseBoundedJson(raw, 4_096, 8)).toThrow(
      SchemaValidationError
    );
  });

  it('巨大な外部文字列は全体を UTF-8 encode する前に code unit 下限で拒否する', () => {
    const raw = 'あ'.repeat(1_000_000);

    expect(() => parseBoundedJson(raw, 4_096, 8)).toThrow(
      SchemaValidationError
    );
  });

  it('ネスト深度が上限と同じ JSON を受理する', () => {
    const value = nestedObject(8);
    const raw = JSON.stringify(value);

    expect(parseBoundedJson(raw, 4_096, 8)).toEqual(value);
  });

  it('ネスト深度が上限を 1 超える JSON を拒否する', () => {
    const raw = JSON.stringify(nestedObject(9));

    expect(() => parseBoundedJson(raw, 4_096, 8)).toThrow(
      SchemaValidationError
    );
  });
});
