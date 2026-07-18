import { describe, expect, it } from 'bun:test';
import { parseDeviceResourceSnapshot } from './device-resource-snapshot';
import type { DeviceResourceSnapshot } from './model-lifecycle';

const VALID = {
  physicalMemoryBytes: 8_000_000_000,
  processMemoryLimitBytes: 5_000_000_000,
  processMemoryBytes: 900_000_000,
  thermalState: 'fair',
  batteryLevelPermille: 730,
} satisfies DeviceResourceSnapshot;

describe('Native Device Resource Telemetry boundary', () => {
  it('許可した 5 項目だけを bounded snapshot として受理する', () => {
    expect(parseDeviceResourceSnapshot(VALID)).toEqual(VALID);
  });

  it('Object 以外、Prototype 付き、欠落・過剰 key は全項目 unavailable にする', () => {
    for (const value of [
      null,
      [],
      Object.create({ ...VALID }),
      {
        physicalMemoryBytes: VALID.physicalMemoryBytes,
        processMemoryLimitBytes: VALID.processMemoryLimitBytes,
        processMemoryBytes: VALID.processMemoryBytes,
        thermalState: VALID.thermalState,
      },
      { ...VALID, deviceName: 'secret' },
    ]) {
      expect(parseDeviceResourceSnapshot(value)).toEqual({
        physicalMemoryBytes: null,
        processMemoryLimitBytes: null,
        processMemoryBytes: null,
        thermalState: 'unknown',
        batteryLevelPermille: null,
      });
    }
  });

  it('不正 number と未知 Thermal だけを null / unknown に落とす', () => {
    expect(
      parseDeviceResourceSnapshot({
        ...VALID,
        physicalMemoryBytes: -1,
        processMemoryLimitBytes: 1.5,
        processMemoryBytes: 0,
        thermalState: 'hot',
        batteryLevelPermille: 1_001,
      })
    ).toEqual({
      physicalMemoryBytes: null,
      processMemoryLimitBytes: null,
      processMemoryBytes: null,
      thermalState: 'unknown',
      batteryLevelPermille: null,
    });
  });
});
