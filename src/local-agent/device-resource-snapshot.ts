import type { ProcessMemoryLimitProvenance } from './local-model-manifest';
import type { DeviceResourceSnapshot } from './model-lifecycle';

const THERMAL_STATES = new Set([
  'unknown',
  'nominal',
  'fair',
  'serious',
  'critical',
]);

/**
 * major（Issue 104 PR #132、Codex 指摘）: iOS（`os-process-ceiling`）と Android
 * （`system-wide-available`）で `processMemoryLimitBytes` の意味が異なるため、
 * Native からこの provenance を渡してもらい、`evaluateModelResourceRisk` が
 * 信頼度に応じた扱いをできるようにする。
 */
const PROCESS_MEMORY_LIMIT_PROVENANCES = new Set([
  'os-process-ceiling',
  'system-wide-available',
  'unavailable',
]);

type ResourceSnapshotRecord = Record<string, unknown> & {
  readonly physicalMemoryBytes?: unknown;
  readonly processMemoryLimitBytes?: unknown;
  readonly processMemoryLimitProvenance?: unknown;
  readonly processMemoryBytes?: unknown;
  readonly thermalState?: unknown;
  readonly batteryLevelPermille?: unknown;
};

function isPlainRecord(value: unknown): value is ResourceSnapshotRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function nullableBatteryPermille(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000
    ? value
    : null;
}

function unavailableSnapshot(): DeviceResourceSnapshot {
  return {
    physicalMemoryBytes: null,
    processMemoryLimitBytes: null,
    processMemoryLimitProvenance: 'unavailable',
    processMemoryBytes: null,
    thermalState: 'unknown',
    batteryLevelPermille: null,
  };
}

function resolvedProcessMemoryLimitProvenance(
  value: unknown
): ProcessMemoryLimitProvenance {
  if (
    typeof value === 'string' &&
    PROCESS_MEMORY_LIMIT_PROVENANCES.has(value)
  ) {
    return value as ProcessMemoryLimitProvenance;
  }
  return 'unavailable';
}

/** Native dictionary を exact key / bounded number で fail closed に投影する。 */
export function parseDeviceResourceSnapshot(
  value: unknown
): DeviceResourceSnapshot {
  if (!isPlainRecord(value)) return unavailableSnapshot();
  const keys = Object.keys(value).sort();
  const expected = [
    'batteryLevelPermille',
    'physicalMemoryBytes',
    'processMemoryBytes',
    'processMemoryLimitBytes',
    'processMemoryLimitProvenance',
    'thermalState',
  ];
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index])
  ) {
    return unavailableSnapshot();
  }
  const thermalState = value.thermalState;
  // fail-closed（Issue 104 PR #132、Codex 指摘）: `evaluateModelResourceRisk`
  // が要求する「provenance が `unavailable` のときは値も必ず `null`」という
  // 整合性を、Native からの入力の時点で保証する。provenance を先に解決し、
  // `unavailable` に丸まった場合は数値側も強制的に `null` にする（自己矛盾した
  // Native 値を通さない）。
  const processMemoryLimitProvenance = resolvedProcessMemoryLimitProvenance(
    value.processMemoryLimitProvenance
  );
  const processMemoryLimitBytes =
    processMemoryLimitProvenance === 'unavailable'
      ? null
      : nullablePositiveInteger(value.processMemoryLimitBytes);
  return {
    physicalMemoryBytes: nullablePositiveInteger(value.physicalMemoryBytes),
    processMemoryLimitBytes,
    processMemoryLimitProvenance,
    processMemoryBytes: nullablePositiveInteger(value.processMemoryBytes),
    thermalState:
      typeof thermalState === 'string' && THERMAL_STATES.has(thermalState)
        ? (thermalState as DeviceResourceSnapshot['thermalState'])
        : 'unknown',
    batteryLevelPermille: nullableBatteryPermille(value.batteryLevelPermille),
  };
}
