import { PROTOCOL_VERSION } from '../protocol/peer-envelope';
import type { ProviderRuntimeStatus } from './agent-provider-session';
import type { CameraPermissionState } from './qr-scanner-port';

/**
 * Issue 118 / ADR-0033: schema v1 は JSON Backup 機能が存在した頃の
 * `storage.backupCacheCount` フィールドを含んでいたが、Backup 機能の削除後は
 * producer を失い常に `0` で構築される機能的残骸になっていた（Codex レビュー指摘）。
 * v2 でこのフィールドを削除する。schema version を上げずに黙って形を変えると、
 * 過去に共有された v1 の Report（`backupCacheCount` を含む）と今後の Report が
 * 同じ version 番号で異なる形になり、Report を読む側（サポート担当者・開発者）を
 * 誤解させるため、破壊的変更として明示的にバージョンを分ける。
 */
export const DIAGNOSTIC_REPORT_SCHEMA_VERSION = 2;
export const DIAGNOSTIC_REPORT_MAX_BYTES = 64 * 1024;

const MODEL_ARCHITECTURES = [
  'llama',
  'qwen',
  'gemma',
  'phi',
  'unknown',
] as const;
const TRANSPORT_STATES = [
  'unavailable',
  'idle',
  'hosting',
  'connected',
  'ended',
] as const;
const PERMISSION_STATES = [
  'not-determined',
  'granted',
  'denied',
  'revoked',
  'hardware-unavailable',
] as const satisfies readonly CameraPermissionState[];
const ERROR_CODES = [
  'TIMEOUT',
  'CANCELLED',
  'SCHEMA_ERROR',
  'LOAD_ERROR',
  'STORAGE_FAILURE',
  'DELETE_INTERRUPTED',
  'MODEL_IN_USE',
  'PERMISSION_DENIED',
  'TRANSPORT_UNAVAILABLE',
  'UNEXPECTED_FAILURE',
] as const;
const ERROR_PHASES = [
  'startup',
  'profile-read',
  'profile-write',
  'backup-export',
  'permission',
  'transport',
  'model-load',
  'model-output',
  'local-data-delete',
] as const;
const PROVIDER_STATUSES = [
  'rules',
  'loading-local-model',
  'local-model',
  'falling-back',
  'failed',
] as const satisfies readonly ProviderRuntimeStatus[];

export type DiagnosticModelArchitecture = (typeof MODEL_ARCHITECTURES)[number];
export type DiagnosticTransportState = (typeof TRANSPORT_STATES)[number];
export type DiagnosticErrorCode = (typeof ERROR_CODES)[number];
export type DiagnosticErrorPhase = (typeof ERROR_PHASES)[number];

export interface DiagnosticStorageSummary {
  readonly profileCount: number;
  readonly settingsCount: number;
  readonly modelCount: number;
  readonly totalBytes: number;
}

export interface DiagnosticReportInput {
  readonly appVersion: string;
  readonly providerStatus: ProviderRuntimeStatus;
  readonly model: {
    readonly architecture: DiagnosticModelArchitecture;
    readonly sizeBytes: number;
    readonly digest: string;
  } | null;
  readonly transport: {
    readonly state: DiagnosticTransportState;
    readonly peerCount: number;
    readonly permission: CameraPermissionState;
  };
  readonly lastError: {
    readonly code: DiagnosticErrorCode;
    readonly phase: DiagnosticErrorPhase;
  } | null;
  readonly storage: DiagnosticStorageSummary;
}

export interface DiagnosticReport {
  readonly reportSchema: 2;
  readonly version: {
    readonly app: string;
    readonly protocol: string;
    readonly profileSchema: 2;
  };
  readonly provider: { readonly status: ProviderRuntimeStatus };
  readonly model: {
    readonly architecture: DiagnosticModelArchitecture;
    readonly sizeBytes: number;
    readonly digestPrefix: string;
  } | null;
  readonly transport: {
    readonly state: DiagnosticTransportState;
    readonly peerCount: number;
    readonly permission: CameraPermissionState;
  };
  readonly error: {
    readonly code: DiagnosticErrorCode;
    readonly phase: DiagnosticErrorPhase;
  } | null;
  readonly storage: DiagnosticStorageSummary;
}

export interface DiagnosticPreviewItem {
  readonly key: string;
  readonly value: string;
}

export interface DiagnosticReportPreview {
  readonly report: DiagnosticReport;
  readonly json: string;
  readonly items: readonly DiagnosticPreviewItem[];
  readonly byteLength: number;
}

export class DiagnosticReportError extends Error {
  constructor() {
    super('診断 Report を読み取れませんでした。');
    this.name = 'DiagnosticReportError';
  }
}

function fail(): never {
  throw new DiagnosticReportError();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail();
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    fail();
  }
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys
): Record<Keys[number], unknown> {
  const candidate = record(value);
  exactKeys(candidate, expected);
  return candidate as Record<Keys[number], unknown>;
}

function boundedInteger(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > maximum
  ) {
    return fail();
  }
  return value as number;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) return fail();
  return value as T[number];
}

function parseModel(value: unknown): DiagnosticReport['model'] {
  if (value === null) return null;
  const model = exactRecord(value, [
    'architecture',
    'sizeBytes',
    'digestPrefix',
  ] as const);
  if (
    typeof model.digestPrefix !== 'string' ||
    !/^[0-9a-f]{8}$/.test(model.digestPrefix)
  ) {
    return fail();
  }
  return {
    architecture: enumValue(model.architecture, MODEL_ARCHITECTURES),
    sizeBytes: boundedInteger(model.sizeBytes),
    digestPrefix: model.digestPrefix,
  };
}

function parseTransport(value: unknown): DiagnosticReport['transport'] {
  const transport = exactRecord(value, [
    'state',
    'peerCount',
    'permission',
  ] as const);
  return {
    state: enumValue(transport.state, TRANSPORT_STATES),
    peerCount: boundedInteger(transport.peerCount, 6),
    permission: enumValue(transport.permission, PERMISSION_STATES),
  };
}

function parseError(value: unknown): DiagnosticReport['error'] {
  if (value === null) return null;
  const error = exactRecord(value, ['code', 'phase'] as const);
  return {
    code: enumValue(error.code, ERROR_CODES),
    phase: enumValue(error.phase, ERROR_PHASES),
  };
}

function parseStorage(value: unknown): DiagnosticStorageSummary {
  const storage = exactRecord(value, [
    'profileCount',
    'settingsCount',
    'modelCount',
    'totalBytes',
  ] as const);
  return {
    profileCount: boundedInteger(storage.profileCount),
    settingsCount: boundedInteger(storage.settingsCount),
    modelCount: boundedInteger(storage.modelCount),
    totalBytes: boundedInteger(storage.totalBytes),
  };
}

function parseVersion(value: unknown): DiagnosticReport['version'] {
  const version = exactRecord(value, [
    'app',
    'protocol',
    'profileSchema',
  ] as const);
  if (
    typeof version.app !== 'string' ||
    version.app.length === 0 ||
    version.app.length > 32 ||
    !/^[0-9A-Za-z.+-]+$/.test(version.app) ||
    version.protocol !==
      `${PROTOCOL_VERSION.major}.${PROTOCOL_VERSION.minor}` ||
    version.profileSchema !== 2
  ) {
    return fail();
  }
  return {
    app: version.app,
    protocol: version.protocol,
    profileSchema: 2,
  };
}

export function parseDiagnosticReport(raw: string): DiagnosticReport {
  if (
    typeof raw !== 'string' ||
    new TextEncoder().encode(raw).byteLength > DIAGNOSTIC_REPORT_MAX_BYTES
  ) {
    return fail();
  }
  let unknownValue: unknown;
  try {
    unknownValue = JSON.parse(raw);
  } catch {
    return fail();
  }
  const value = exactRecord(unknownValue, [
    'reportSchema',
    'version',
    'provider',
    'model',
    'transport',
    'error',
    'storage',
  ] as const);
  if (value.reportSchema !== DIAGNOSTIC_REPORT_SCHEMA_VERSION) return fail();
  const provider = exactRecord(value.provider, ['status'] as const);
  return {
    reportSchema: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    version: parseVersion(value.version),
    provider: { status: enumValue(provider.status, PROVIDER_STATUSES) },
    model: parseModel(value.model),
    transport: parseTransport(value.transport),
    error: parseError(value.error),
    storage: parseStorage(value.storage),
  };
}

function previewItems(report: DiagnosticReport): DiagnosticPreviewItem[] {
  const items: DiagnosticPreviewItem[] = [
    { key: 'version.app', value: report.version.app },
    { key: 'version.protocol', value: report.version.protocol },
    {
      key: 'version.profileSchema',
      value: String(report.version.profileSchema),
    },
    { key: 'provider.status', value: report.provider.status },
  ];
  if (report.model) {
    items.push(
      { key: 'model.architecture', value: report.model.architecture },
      { key: 'model.sizeBytes', value: String(report.model.sizeBytes) },
      { key: 'model.digestPrefix', value: report.model.digestPrefix }
    );
  }
  items.push(
    { key: 'transport.state', value: report.transport.state },
    { key: 'transport.peerCount', value: String(report.transport.peerCount) },
    { key: 'transport.permission', value: report.transport.permission }
  );
  if (report.error) {
    items.push(
      { key: 'error.code', value: report.error.code },
      { key: 'error.phase', value: report.error.phase }
    );
  }
  for (const key of [
    'profileCount',
    'settingsCount',
    'modelCount',
    'totalBytes',
  ] as const) {
    items.push({ key: `storage.${key}`, value: String(report.storage[key]) });
  }
  return items;
}

export function createDiagnosticReportPreview(
  input: DiagnosticReportInput
): DiagnosticReportPreview {
  if (!/^[0-9a-f]{64}$/.test(input.model?.digest ?? '0'.repeat(64))) fail();
  const candidate = {
    reportSchema: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    version: {
      app: input.appVersion,
      protocol: `${PROTOCOL_VERSION.major}.${PROTOCOL_VERSION.minor}`,
      profileSchema: 2,
    },
    provider: { status: input.providerStatus },
    model: input.model
      ? {
          architecture: input.model.architecture,
          sizeBytes: input.model.sizeBytes,
          digestPrefix: input.model.digest.slice(0, 8),
        }
      : null,
    transport: input.transport,
    error: input.lastError,
    storage: input.storage,
  };
  const json = JSON.stringify(candidate);
  const report = parseDiagnosticReport(json);
  return {
    report,
    json,
    items: previewItems(report),
    byteLength: new TextEncoder().encode(json).byteLength,
  };
}
