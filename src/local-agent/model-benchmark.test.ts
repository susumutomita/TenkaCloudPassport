import { describe, expect, it } from 'bun:test';
import type { LocalModelBenchmarkReport } from './local-model-manifest';
import {
  createModelBenchmarkRecorder,
  type ModelBenchmarkScheduler,
} from './model-benchmark';
import type {
  DeviceResourceSnapshot,
  DeviceResourceTelemetry,
  ModelLifecycleClock,
} from './model-lifecycle';

const SHA256 = 'a'.repeat(64);

class SequenceClock implements ModelLifecycleClock {
  values = [100, 140, 170, 260];
  index = 0;

  wallClockMs(): number {
    return Date.parse('2026-07-18T03:00:00.000Z');
  }

  monotonicMs(): number {
    const value = this.values[Math.min(this.index, this.values.length - 1)];
    this.index += 1;
    return value ?? 0;
  }
}

class ManualScheduler implements ModelBenchmarkScheduler {
  callback: (() => void) | null = null;
  delayMs: number | null = null;
  clearCalls = 0;

  setInterval(callback: () => void, delayMs: number): unknown {
    this.callback = callback;
    this.delayMs = delayMs;
    return 'interval';
  }

  clearInterval(handle: unknown): void {
    expect(handle).toBe('interval');
    this.clearCalls += 1;
  }

  sample(): void {
    this.callback?.();
  }
}

class SequenceTelemetry implements DeviceResourceTelemetry {
  values: Array<
    DeviceResourceSnapshot | Error | Promise<DeviceResourceSnapshot>
  > = [];
  index = 0;

  async snapshot(): Promise<DeviceResourceSnapshot> {
    const value = this.values[Math.min(this.index, this.values.length - 1)];
    this.index += 1;
    if (value instanceof Error) throw value;
    if (value instanceof Promise) return value;
    return (
      value ?? {
        physicalMemoryBytes: null,
        processMemoryLimitBytes: null,
        processMemoryLimitProvenance: 'unavailable',
        processMemoryBytes: null,
        thermalState: 'unknown',
        batteryLevelPermille: null,
      }
    );
  }
}

function snapshot(
  processMemoryBytes: number | null,
  batteryLevelPermille: number | null,
  thermalState: DeviceResourceSnapshot['thermalState'] = 'nominal'
): DeviceResourceSnapshot {
  return {
    physicalMemoryBytes: 2_000_000_000,
    processMemoryLimitBytes: 2_000_000_000,
    processMemoryLimitProvenance: 'os-process-ceiling',
    processMemoryBytes,
    thermalState,
    batteryLevelPermille,
  };
}

describe('内容非保持 Local Model Benchmark', () => {
  it('200 ms sampling の peak と Load・First Token・Completion・Thermal・Battery 差分だけを保存する', async () => {
    const telemetry = new SequenceTelemetry();
    telemetry.values = [
      snapshot(100, 800),
      snapshot(180, 795, 'fair'),
      snapshot(200, 790, 'fair'),
    ];
    const scheduler = new ManualScheduler();
    const reports: LocalModelBenchmarkReport[] = [];
    const recorder = createModelBenchmarkRecorder({
      modelSha256: SHA256,
      telemetry,
      appendReport: async (report) => {
        reports.push(report);
      },
      onWriteFailure: () => undefined,
      clock: new SequenceClock(),
      scheduler,
    });

    const session = await recorder.start();
    expect(scheduler.delayMs).toBe(200);
    session.markLoaded();
    session.markLoaded();
    scheduler.sample();
    await Promise.resolve();
    session.markFirstToken();
    session.markFirstToken();
    session.markCompletion();
    session.markCompletion();
    await session.finish('success');
    await session.finish('failed');

    expect(scheduler.clearCalls).toBe(1);
    expect(reports).toEqual([
      {
        schemaVersion: 1,
        modelSha256: SHA256,
        measuredAt: '2026-07-18T03:00:00.000Z',
        outcome: 'success',
        importDurationMs: null,
        loadDurationMs: 40,
        firstTokenDurationMs: 70,
        completionDurationMs: 160,
        peakProcessMemoryBytes: 200,
        thermalStateBefore: 'nominal',
        thermalStateAfter: 'fair',
        batteryDeltaPermille: -10,
      },
    ]);
    expect(JSON.stringify(reports)).not.toMatch(
      /prompt|answer|passport|bridge|fileUri|deviceId/i
    );
  });

  it('計測点が無い項目と取得不能値を null / unknown のまま保存し、0 に偽装しない', async () => {
    const telemetry = new SequenceTelemetry();
    telemetry.values = [new Error('native unavailable'), snapshot(0, null)];
    const scheduler = new ManualScheduler();
    let saved: LocalModelBenchmarkReport | null = null;
    const session = await createModelBenchmarkRecorder({
      modelSha256: SHA256,
      telemetry,
      appendReport: async (report) => {
        saved = report;
      },
      onWriteFailure: () => undefined,
      clock: new SequenceClock(),
      scheduler,
    }).start();

    scheduler.sample();
    scheduler.sample();
    await Promise.resolve();
    await session.finish('cancelled');
    scheduler.sample();

    expect(saved).toMatchObject({
      outcome: 'cancelled',
      loadDurationMs: null,
      firstTokenDurationMs: null,
      completionDurationMs: null,
      peakProcessMemoryBytes: null,
      thermalStateBefore: 'unknown',
      batteryDeltaPermille: null,
    });
  });

  it('finish は実行中の 200 ms sample を待ち、遅延した Peak Memory を取りこぼさない', async () => {
    let resolveSample: ((snapshot: DeviceResourceSnapshot) => void) | undefined;
    const delayedSample = new Promise<DeviceResourceSnapshot>((resolve) => {
      resolveSample = resolve;
    });
    const telemetry = new SequenceTelemetry();
    telemetry.values = [snapshot(100, 800), delayedSample, snapshot(200, 790)];
    const scheduler = new ManualScheduler();
    let saved: LocalModelBenchmarkReport | null = null;
    const session = await createModelBenchmarkRecorder({
      modelSha256: SHA256,
      telemetry,
      appendReport: async (report) => {
        saved = report;
      },
      onWriteFailure: () => undefined,
      clock: new SequenceClock(),
      scheduler,
    }).start();

    scheduler.sample();
    let finished = false;
    const finish = session.finish('success').then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    resolveSample?.(snapshot(300, 795));
    await finish;

    expect(saved).toMatchObject({ peakProcessMemoryBytes: 300 });
  });

  it('Report 保存失敗は専用通知へ変換し、finish 自体は reject しない', async () => {
    const telemetry = new SequenceTelemetry();
    telemetry.values = [snapshot(null, null)];
    let failures = 0;
    const session = await createModelBenchmarkRecorder({
      modelSha256: SHA256,
      telemetry,
      appendReport: async () => {
        throw new Error('manifest unavailable');
      },
      onWriteFailure: () => {
        failures += 1;
      },
      clock: new SequenceClock(),
      scheduler: new ManualScheduler(),
    }).start();

    await session.finish('failed');
    expect(failures).toBe(1);
  });

  it('Clock / Scheduler 未注入でも既定 200 ms timer を開始して停止できる', async () => {
    const telemetry = new SequenceTelemetry();
    telemetry.values = [snapshot(null, null)];
    let reports = 0;
    const session = await createModelBenchmarkRecorder({
      modelSha256: SHA256,
      telemetry,
      appendReport: async () => {
        reports += 1;
      },
      onWriteFailure: () => undefined,
    }).start();

    await session.finish('success');
    expect(reports).toBe(1);
  });
});
