export type SchemaValidationCode =
  | 'INVALID_JSON'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'UNKNOWN_FIELD'
  | 'MISSING_FIELD'
  | 'LIMIT_EXCEEDED'
  | 'UNSUPPORTED_VERSION';

export class SchemaValidationError extends Error {
  readonly code: SchemaValidationCode;
  readonly path: string;

  constructor(code: SchemaValidationCode, path: string, message: string) {
    super(message);
    this.name = 'SchemaValidationError';
    this.code = code;
    this.path = path;
  }
}

export function schemaError(
  code: SchemaValidationCode,
  path: string,
  message: string
): never {
  throw new SchemaValidationError(code, path, message);
}

export function strictRecord<
  const RequiredKeys extends readonly string[],
  const OptionalKeys extends readonly string[] = readonly [],
>(
  value: unknown,
  path: string,
  requiredKeys: RequiredKeys,
  optionalKeys?: OptionalKeys
): { [Key in RequiredKeys[number]]: unknown } & {
  [Key in OptionalKeys[number]]?: unknown;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は object である必要があります。`
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は JSON object である必要があります。`
    );
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([...requiredKeys, ...(optionalKeys ?? [])]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return schemaError(
        'UNKNOWN_FIELD',
        `${path}.${key}`,
        `${path} に未知の field ${key} は指定できません。`
      );
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(record, key)) {
      return schemaError(
        'MISSING_FIELD',
        `${path}.${key}`,
        `${path}.${key} は必須です。`
      );
    }
  }
  return record as { [Key in RequiredKeys[number]]: unknown } & {
    [Key in OptionalKeys[number]]?: unknown;
  };
}

export function stringValue(
  value: unknown,
  path: string,
  maximumLength = 96
): string {
  if (typeof value !== 'string') {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は string である必要があります。`
    );
  }
  if (value.length < 1 || value.length > maximumLength) {
    return schemaError(
      'LIMIT_EXCEEDED',
      path,
      `${path} の文字列長が上限外です。`
    );
  }
  return value;
}

export function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は boolean である必要があります。`
    );
  }
  return value;
}

export function integerValue(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isSafeInteger(value)) {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は安全な整数である必要があります。`
    );
  }
  if (typeof value !== 'number' || value < minimum || value > maximum) {
    return schemaError(
      'LIMIT_EXCEEDED',
      path,
      `${path} は ${minimum} 以上 ${maximum} 以下である必要があります。`
    );
  }
  return value;
}

export function arrayValue(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number
): readonly unknown[] {
  if (!Array.isArray(value)) {
    return schemaError(
      'INVALID_TYPE',
      path,
      `${path} は array である必要があります。`
    );
  }
  if (value.length < minimumLength || value.length > maximumLength) {
    return schemaError('LIMIT_EXCEEDED', path, `${path} の件数が上限外です。`);
  }
  return value;
}

export function assertLiteral<T extends string | number | boolean>(
  value: unknown,
  literal: T,
  path: string
): T {
  if (value !== literal) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は許可された値ではありません。`
    );
  }
  return literal;
}

export function assertOneOf<const T extends readonly string[]>(
  value: unknown,
  literals: T,
  path: string
): T[number] {
  const candidate = stringValue(value, path);
  if (!literals.includes(candidate)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} は許可された値ではありません。`
    );
  }
  return candidate as T[number];
}

export function assertUniqueStrings(
  values: readonly string[],
  path: string
): void {
  if (new Set(values).size !== values.length) {
    schemaError(
      'INVALID_VALUE',
      path,
      `${path} に重複する値は指定できません。`
    );
  }
}

function exceedsJsonDepth(value: unknown, maximumDepth: number): boolean {
  const pending: Array<readonly [unknown, number]> = [[value, 0]];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const [item, parentDepth] = current;
    if (typeof item !== 'object' || item === null) continue;
    const depth = parentDepth + 1;
    if (depth > maximumDepth) return true;
    const children = Array.isArray(item)
      ? item
      : Object.values(item as Record<string, unknown>);
    for (const child of children) pending.push([child, depth]);
  }
  return false;
}

export function parseBoundedJson(
  raw: string,
  maximumBytes: number,
  maximumDepth: number
): unknown {
  if (boundedUtf8ByteLength(raw, maximumBytes) > maximumBytes) {
    return schemaError(
      'LIMIT_EXCEEDED',
      '$',
      '外部 JSON の UTF-8 byte 数が上限を超えています。'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return schemaError(
      'INVALID_JSON',
      '$',
      '外部入力は有効な JSON ではありません。'
    );
  }
  if (exceedsJsonDepth(parsed, maximumDepth)) {
    return schemaError(
      'LIMIT_EXCEEDED',
      '$',
      '外部 JSON のネスト深度が上限を超えています。'
    );
  }
  return parsed;
}

export function boundedUtf8ByteLength(
  raw: string,
  maximumBytes: number
): number {
  if (raw.length > maximumBytes) return maximumBytes + 1;
  return new TextEncoder().encode(raw).byteLength;
}
