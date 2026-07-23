import { describe, expect, it } from 'bun:test';
import { parseDeviceResourceSnapshot } from './device-resource-snapshot';
import type { DeviceResourceSnapshot } from './model-lifecycle';

const VALID = {
  physicalMemoryBytes: 8_000_000_000,
  processMemoryLimitBytes: 5_000_000_000,
  processMemoryLimitProvenance: 'os-process-ceiling',
  processMemoryBytes: 900_000_000,
  thermalState: 'fair',
  batteryLevelPermille: 730,
} satisfies DeviceResourceSnapshot;

const UNAVAILABLE: DeviceResourceSnapshot = {
  physicalMemoryBytes: null,
  processMemoryLimitBytes: null,
  processMemoryLimitProvenance: 'unavailable',
  processMemoryBytes: null,
  thermalState: 'unknown',
  batteryLevelPermille: null,
};

describe('Native Device Resource Telemetry boundary', () => {
  it('許可した 6 項目だけを bounded snapshot として受理する', () => {
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
        processMemoryLimitProvenance: VALID.processMemoryLimitProvenance,
        processMemoryBytes: VALID.processMemoryBytes,
        thermalState: VALID.thermalState,
      },
      { ...VALID, deviceName: 'secret' },
    ]) {
      expect(parseDeviceResourceSnapshot(value)).toEqual(UNAVAILABLE);
    }
  });

  it('不正 number と未知 Thermal だけを null / unknown に落とす（provenance 自体は有効なので保持する）', () => {
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
      processMemoryLimitProvenance: 'os-process-ceiling',
      processMemoryBytes: null,
      thermalState: 'unknown',
      batteryLevelPermille: null,
    });
  });

  /**
   * major（Issue 104 PR #132、Codex 指摘）: iOS（`os-process-ceiling`）と
   * Android（`system-wide-available`）で `processMemoryLimitBytes` の意味が
   * 異なるため、Native から渡された provenance を fail-closed で検証する。
   */
  describe('processMemoryLimitProvenance（iOS/Android の意味の違いを型で区別、Issue 104 PR #132）', () => {
    it('Android 由来の system-wide-available をそのまま受理する', () => {
      const androidSnapshot: DeviceResourceSnapshot = {
        ...VALID,
        processMemoryLimitProvenance: 'system-wide-available',
      };

      expect(parseDeviceResourceSnapshot(androidSnapshot)).toEqual(
        androidSnapshot
      );
    });

    it('未知の provenance 文字列は unavailable へ丸め、bytes も強制的に null にする（fail-closed）', () => {
      expect(
        parseDeviceResourceSnapshot({
          ...VALID,
          processMemoryLimitProvenance: 'totally-made-up',
        })
      ).toEqual({
        ...VALID,
        processMemoryLimitBytes: null,
        processMemoryLimitProvenance: 'unavailable',
      });
    });

    it('provenance が数値でない・欠落値の場合も unavailable へ丸める', () => {
      expect(
        parseDeviceResourceSnapshot({
          ...VALID,
          processMemoryLimitProvenance: 42,
        })
      ).toEqual({
        ...VALID,
        processMemoryLimitBytes: null,
        processMemoryLimitProvenance: 'unavailable',
      });
    });

    it('Native が明示的に unavailable を主張した場合、bytes が実測値らしき数でも null に丸める（自己矛盾した Native 値を通さない）', () => {
      expect(
        parseDeviceResourceSnapshot({
          ...VALID,
          processMemoryLimitProvenance: 'unavailable',
        })
      ).toEqual({
        ...VALID,
        processMemoryLimitBytes: null,
        processMemoryLimitProvenance: 'unavailable',
      });
    });
  });
});
