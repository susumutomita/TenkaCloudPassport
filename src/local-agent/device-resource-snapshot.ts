import type { DeviceResourceSnapshot } from './model-lifecycle';

const THERMAL_STATES = new Set([
  'unknown',
  'nominal',
  'fair',
  'serious',
  'critical',
]);

type ResourceSnapshotRecord = Record<string, unknown> & {
  readonly physicalMemoryBytes?: unknown;
  readonly processMemoryLimitBytes?: unknown;
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
    processMemoryBytes: null,
    thermalState: 'unknown',
    batteryLevelPermille: null,
  };
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
    'thermalState',
  ];
  if (
    keys.length !== expected.length ||
    !keys.every((key, index) => key === expected[index])
  ) {
    return unavailableSnapshot();
  }
  const thermalState = value.thermalState;
  return {
    physicalMemoryBytes: nullablePositiveInteger(value.physicalMemoryBytes),
    processMemoryLimitBytes: nullablePositiveInteger(
      value.processMemoryLimitBytes
    ),
    processMemoryBytes: nullablePositiveInteger(value.processMemoryBytes),
    thermalState:
      typeof thermalState === 'string' && THERMAL_STATES.has(thermalState)
        ? (thermalState as DeviceResourceSnapshot['thermalState'])
        : 'unknown',
    batteryLevelPermille: nullableBatteryPermille(value.batteryLevelPermille),
  };
}
