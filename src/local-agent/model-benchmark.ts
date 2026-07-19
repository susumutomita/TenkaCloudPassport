import type {
  LocalModelBenchmarkOutcome,
  LocalModelBenchmarkReport,
} from './local-model-manifest';
import type {
  DeviceResourceSnapshot,
  DeviceResourceTelemetry,
  ModelLifecycleClock,
} from './model-lifecycle';

export interface ModelBenchmarkSession {
  readonly markLoaded: () => void;
  readonly markFirstToken: () => void;
  readonly markCompletion: () => void;
  readonly finish: (outcome: LocalModelBenchmarkOutcome) => Promise<void>;
}

export interface ModelBenchmarkRecorder {
  readonly start: () => Promise<ModelBenchmarkSession>;
}

export interface ModelBenchmarkScheduler {
  readonly setInterval: (callback: () => void, delayMs: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

export interface ModelBenchmarkRecorderDependencies {
  readonly modelSha256: string;
  readonly telemetry: DeviceResourceTelemetry;
  readonly appendReport: (report: LocalModelBenchmarkReport) => Promise<void>;
  readonly onWriteFailure: () => void;
  readonly clock?: ModelLifecycleClock;
  readonly scheduler?: ModelBenchmarkScheduler;
}

const DEFAULT_CLOCK: ModelLifecycleClock = {
  wallClockMs: Date.now,
  monotonicMs: () => performance.now(),
};

const DEFAULT_SCHEDULER: ModelBenchmarkScheduler = {
  setInterval(callback, delayMs) {
    return globalThis.setInterval(callback, delayMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

function positiveMemory(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function batteryDelta(
  before: DeviceResourceSnapshot,
  after: DeviceResourceSnapshot
): number | null {
  if (
    before.batteryLevelPermille === null ||
    after.batteryLevelPermille === null
  ) {
    return null;
  }
  return after.batteryLevelPermille - before.batteryLevelPermille;
}

function duration(startedAt: number, markedAt: number | null): number | null {
  return markedAt === null
    ? null
    : Math.max(0, Math.round(markedAt - startedAt));
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

async function safeSnapshot(
  telemetry: DeviceResourceTelemetry
): Promise<DeviceResourceSnapshot> {
  try {
    return await telemetry.snapshot();
  } catch {
    return unavailableSnapshot();
  }
}

/** Input / Output を API に持たず、duration と端末資源の集約値だけを保存する。 */
export function createModelBenchmarkRecorder(
  dependencies: ModelBenchmarkRecorderDependencies
): ModelBenchmarkRecorder {
  const clock = dependencies.clock ?? DEFAULT_CLOCK;
  const scheduler = dependencies.scheduler ?? DEFAULT_SCHEDULER;

  return {
    async start() {
      const startedAt = clock.monotonicMs();
      const measuredAt = new Date(clock.wallClockMs()).toISOString();
      const before = await safeSnapshot(dependencies.telemetry);
      let peakProcessMemoryBytes = positiveMemory(before.processMemoryBytes);
      let loadedAt: number | null = null;
      let firstTokenAt: number | null = null;
      let completionAt: number | null = null;
      let finished = false;
      let samplingPromise: Promise<void> | null = null;

      function sample(): Promise<void> {
        if (samplingPromise || finished) return Promise.resolve();
        const pending = (async () => {
          const snapshot = await safeSnapshot(dependencies.telemetry);
          const observed = positiveMemory(snapshot.processMemoryBytes);
          if (
            observed !== null &&
            (peakProcessMemoryBytes === null ||
              observed > peakProcessMemoryBytes)
          ) {
            peakProcessMemoryBytes = observed;
          }
        })().finally(() => {
          if (samplingPromise === pending) samplingPromise = null;
        });
        samplingPromise = pending;
        return pending;
      }

      const interval = scheduler.setInterval(() => void sample(), 200);
      return {
        markLoaded() {
          loadedAt ??= clock.monotonicMs();
        },
        markFirstToken() {
          firstTokenAt ??= clock.monotonicMs();
        },
        markCompletion() {
          completionAt ??= clock.monotonicMs();
        },
        async finish(outcome) {
          if (finished) return;
          finished = true;
          scheduler.clearInterval(interval);
          await samplingPromise;
          const after = await safeSnapshot(dependencies.telemetry);
          const finalMemory = positiveMemory(after.processMemoryBytes);
          if (
            finalMemory !== null &&
            (peakProcessMemoryBytes === null ||
              finalMemory > peakProcessMemoryBytes)
          ) {
            peakProcessMemoryBytes = finalMemory;
          }
          const report: LocalModelBenchmarkReport = {
            schemaVersion: 1,
            modelSha256: dependencies.modelSha256,
            measuredAt,
            outcome,
            importDurationMs: null,
            loadDurationMs: duration(startedAt, loadedAt),
            firstTokenDurationMs: duration(startedAt, firstTokenAt),
            completionDurationMs: duration(startedAt, completionAt),
            peakProcessMemoryBytes,
            thermalStateBefore: before.thermalState,
            thermalStateAfter: after.thermalState,
            batteryDeltaPermille: batteryDelta(before, after),
          };
          try {
            await dependencies.appendReport(report);
          } catch {
            dependencies.onWriteFailure();
          }
        },
      };
    },
  };
}
