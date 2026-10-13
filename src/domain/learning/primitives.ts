export function requireValid(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      '学習 JSON の形式・参照・容量が不正です。保存内容は変更していません。'
    );
}
export function object(value: unknown): Record<string, unknown> {
  requireValid(
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
  return value as Record<string, unknown>;
}
