import { describe, expect, it } from 'bun:test';
import {
  type ImportedLocalModel,
  type LocalModelBenchmarkReport,
  serializeLocalModelManifest,
} from './local-model-manifest';
import {
  type ClosableSha256Source,
  createLocalModelLifecycle,
  type DeviceResourceSnapshot,
  type DeviceResourceTelemetry,
  type LocalModelFileStore,
  type LocalModelInspector,
  type ModelImportCandidate,
  type ModelLifecycleClock,
  ModelLifecycleError,
  type ModelLifecycleErrorCode,
  type StoredModelFileInfo,
} from './model-lifecycle';

const DIGEST_ABC =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const PRIVATE_ROOT = 'file:///private/local-models';
const CANDIDATE: ModelImportCandidate = {
  name: 'model.gguf',
  uri: 'content://selected/model.gguf',
  sizeBytes: 3,
};
const SUPPORTED_SNAPSHOT: DeviceResourceSnapshot = {
  physicalMemoryBytes: 2_000_000_000,
  processMemoryLimitBytes: 2_000_000_000,
  processMemoryBytes: 100_000_000,
  thermalState: 'nominal',
  batteryLevelPermille: 800,
};

/**
 * Test 専用の Port 実装。Mock framework や stub API は使わず、外部 File と private File の
 * byte 列、rename、delete、atomic manifest を同じ状態機械上で実行する。
 */
class PrivateModelStore implements LocalModelFileStore {
  manifestText: string | null = null;
  availableBytes = 4_000_000_000;
  readonly externalFiles = new Map<string, Uint8Array>([
    [CANDIDATE.uri, new TextEncoder().encode('abc')],
  ]);
  readonly privateFiles = new Map<string, Uint8Array>();
  readManifestFailure = false;
  writeManifestFailures = 0;
  writeManifestAfterCommitFailures = 0;
  reconcileFailure = false;
  availableDiskFailure = false;
  copyFailure = false;
  incomingInfoFailure = false;
  incomingSizeOverride: number | null = null;
  sourceOpenFailure = false;
  sourceReadFailure = false;
  closeFailure = false;
  moveFailure = false;
  modelInfoFailure = false;
  stageFailure = false;
  restoreFailure = false;
  finalizeFailure = false;
  incomingDeleteFailure = false;
  manifestReads = 0;
  manifestWrites = 0;
  closeCalls = 0;
  copyCalls = 0;
  stagedUri: string | null = null;

  private get incomingUri(): string {
    return `${PRIVATE_ROOT}/.incoming.gguf`;
  }

  async readManifestText(): Promise<string | null> {
    this.manifestReads += 1;
    if (this.readManifestFailure) throw new Error('read failed');
    return this.manifestText;
  }

  async atomicWriteManifest(serialized: string): Promise<void> {
    this.manifestWrites += 1;
    if (this.writeManifestFailures > 0) {
      this.writeManifestFailures -= 1;
      throw new Error('write failed');
    }
    this.manifestText = serialized;
    if (this.writeManifestAfterCommitFailures > 0) {
      this.writeManifestAfterCommitFailures -= 1;
      throw new Error('write result unavailable after commit');
    }
  }

  async reconcilePrivateFiles(
    referencedModelDigests: readonly string[]
  ): Promise<void> {
    if (this.reconcileFailure) throw new Error('reconcile failed');
    if (this.incomingDeleteFailure && this.privateFiles.has(this.incomingUri)) {
      throw new Error('incoming cleanup failed');
    }
    this.privateFiles.delete(this.incomingUri);
    const referenced = new Set(
      referencedModelDigests.map((digest) => `${PRIVATE_ROOT}/${digest}.gguf`)
    );
    for (const uri of [...this.privateFiles.keys()]) {
      if (uri.endsWith('.deleting.gguf')) {
        const digest = uri.slice(
          PRIVATE_ROOT.length + 1,
          -'.deleting.gguf'.length
        );
        const finalUri = `${PRIVATE_ROOT}/${digest}.gguf`;
        const bytes = this.privateFiles.get(uri);
        if (referenced.has(finalUri) && bytes)
          this.privateFiles.set(finalUri, bytes);
        this.privateFiles.delete(uri);
      } else if (uri.endsWith('.gguf') && !referenced.has(uri)) {
        this.privateFiles.delete(uri);
      }
    }
  }

  async availableDiskSpaceBytes(): Promise<number> {
    if (this.availableDiskFailure) throw new Error('disk info failed');
    return this.availableBytes;
  }

  async copyExternalFileToIncoming(externalUri: string): Promise<void> {
    this.copyCalls += 1;
    if (this.copyFailure) throw new Error('copy failed');
    const bytes = this.externalFiles.get(externalUri);
    if (!bytes) throw new Error('source missing');
    this.privateFiles.set(this.incomingUri, bytes.slice());
  }

  async incomingFileInfo(): Promise<StoredModelFileInfo> {
    if (this.incomingInfoFailure) throw new Error('incoming info failed');
    const bytes = this.privateFiles.get(this.incomingUri);
    return {
      exists: bytes !== undefined,
      sizeBytes: this.incomingSizeOverride ?? bytes?.byteLength ?? null,
      uri: this.incomingUri,
    };
  }

  async openSha256Source(privateUri: string): Promise<ClosableSha256Source> {
    if (this.sourceOpenFailure) throw new Error('open failed');
    const bytes = this.privateFiles.get(privateUri);
    if (!bytes) throw new Error('source missing');
    return {
      sizeBytes: bytes.byteLength,
      read: async (offset, length) => {
        if (this.sourceReadFailure) throw new Error('read failed');
        return bytes.slice(offset, offset + length);
      },
      close: () => {
        this.closeCalls += 1;
        if (this.closeFailure) throw new Error('close failed');
      },
    };
  }

  async moveIncomingToModel(sha256: string): Promise<string> {
    if (this.moveFailure) throw new Error('move failed');
    const bytes = this.privateFiles.get(this.incomingUri);
    if (!bytes) throw new Error('incoming missing');
    const uri = `${PRIVATE_ROOT}/${sha256}.gguf`;
    this.privateFiles.set(uri, bytes);
    this.privateFiles.delete(this.incomingUri);
    return uri;
  }

  async modelFileInfo(privateUri: string): Promise<StoredModelFileInfo> {
    if (this.modelInfoFailure) throw new Error('model info failed');
    const bytes = this.privateFiles.get(privateUri);
    return {
      exists: bytes !== undefined,
      sizeBytes: bytes?.byteLength ?? null,
      uri: privateUri,
    };
  }

  async stageModelDeletion(
    privateUri: string,
    sha256: string
  ): Promise<string> {
    if (this.stageFailure) throw new Error('stage failed');
    const bytes = this.privateFiles.get(privateUri);
    if (!bytes) throw new Error('model missing');
    const staged = `${PRIVATE_ROOT}/${sha256}.deleting.gguf`;
    this.privateFiles.set(staged, bytes);
    this.privateFiles.delete(privateUri);
    this.stagedUri = staged;
    return staged;
  }

  async restoreStagedModel(
    stagedUri: string,
    privateUri: string
  ): Promise<void> {
    if (this.restoreFailure) throw new Error('restore failed');
    const bytes = this.privateFiles.get(stagedUri);
    if (!bytes) throw new Error('staged missing');
    this.privateFiles.set(privateUri, bytes);
    this.privateFiles.delete(stagedUri);
  }

  async finalizeStagedModelDeletion(stagedUri: string): Promise<void> {
    if (this.finalizeFailure) throw new Error('finalize failed');
    this.privateFiles.delete(stagedUri);
  }

  async deleteIncomingFile(): Promise<void> {
    if (this.incomingDeleteFailure) throw new Error('delete failed');
    this.privateFiles.delete(this.incomingUri);
  }
}

class GgufInspector implements LocalModelInspector {
  rawMetadata: unknown = {
    'general.architecture': 'llama',
    'llama.context_length': '4096',
    'general.file_type': '2',
  };
  failure = false;

  async inspect(): Promise<unknown> {
    if (this.failure) throw new Error('invalid GGUF');
    return this.rawMetadata;
  }
}

class ResourceTelemetry implements DeviceResourceTelemetry {
  snapshots: DeviceResourceSnapshot[] = [SUPPORTED_SNAPSHOT];
  calls = 0;
  failure = false;

  async snapshot(): Promise<DeviceResourceSnapshot> {
    if (this.failure) throw new Error('telemetry unavailable');
    const index = Math.min(this.calls, this.snapshots.length - 1);
    this.calls += 1;
    return this.snapshots[index] ?? SUPPORTED_SNAPSHOT;
  }
}

class FixedClock implements ModelLifecycleClock {
  wall = Date.parse('2026-07-18T00:00:00.000Z');
  monotonicValues = [100, 350];
  monotonicCalls = 0;

  wallClockMs(): number {
    return this.wall;
  }

  monotonicMs(): number {
    const index = Math.min(
      this.monotonicCalls,
      this.monotonicValues.length - 1
    );
    this.monotonicCalls += 1;
    return this.monotonicValues[index] ?? 0;
  }
}

function harness() {
  const fileStore = new PrivateModelStore();
  const inspector = new GgufInspector();
  const telemetry = new ResourceTelemetry();
  const clock = new FixedClock();
  const lifecycle = createLocalModelLifecycle({
    fileStore,
    inspector,
    telemetry,
    clock,
  });
  return { fileStore, inspector, telemetry, clock, lifecycle };
}

async function expectLifecycleError(
  operation: Promise<unknown>,
  code: ModelLifecycleErrorCode
): Promise<void> {
  try {
    await operation;
    throw new Error('ModelLifecycleError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ModelLifecycleError);
    if (error instanceof ModelLifecycleError) expect(error.code).toBe(code);
  }
}

async function importModel(
  state: ReturnType<typeof harness>
): Promise<ImportedLocalModel> {
  return state.lifecycle.importCandidate(CANDIDATE);
}

function cautionSnapshot(): DeviceResourceSnapshot {
  return {
    ...SUPPORTED_SNAPSHOT,
    physicalMemoryBytes: 1_000_000_000,
    processMemoryLimitBytes: 1_000_000_000,
  };
}

function blockedSnapshot(): DeviceResourceSnapshot {
  return {
    ...SUPPORTED_SNAPSHOT,
    physicalMemoryBytes: null,
    processMemoryLimitBytes: null,
  };
}

function report(
  measuredAt: string,
  modelSha256 = DIGEST_ABC
): LocalModelBenchmarkReport {
  return {
    schemaVersion: 1,
    modelSha256,
    measuredAt,
    outcome: 'success',
    importDurationMs: null,
    loadDurationMs: 10,
    firstTokenDurationMs: 20,
    completionDurationMs: 30,
    peakProcessMemoryBytes: 120_000_000,
    thermalStateBefore: 'nominal',
    thermalStateAfter: 'fair',
    batteryDeltaPermille: -1,
  };
}

describe('Local Model Lifecycle: private import・risk・transaction', () => {
  it('空の private storage を version 1 Manifest として読み、同じ instance では再読込しない', async () => {
    const state = harness();

    expect(await state.lifecycle.load()).toEqual({
      schemaVersion: 1,
      activeModelSha256: null,
      models: [],
      benchmarkReports: [],
    });
    await state.lifecycle.load();
    expect(state.fileStore.manifestReads).toBe(1);
  });

  it('Manifest の JSON・read・reconcile・File 参照不整合を型付きで拒否する', async () => {
    const invalidJson = harness();
    invalidJson.fileStore.manifestText = '{';
    await expectLifecycleError(
      invalidJson.lifecycle.load(),
      'MANIFEST_READ_FAILED'
    );

    const readFailure = harness();
    readFailure.fileStore.readManifestFailure = true;
    await expectLifecycleError(
      readFailure.lifecycle.load(),
      'MANIFEST_READ_FAILED'
    );

    const reconcileFailure = harness();
    reconcileFailure.fileStore.reconcileFailure = true;
    await expectLifecycleError(
      reconcileFailure.lifecycle.load(),
      'MANIFEST_READ_FAILED'
    );

    const missing = harness();
    const model = await importModel(missing);
    missing.fileStore.privateFiles.delete(model.privateUri);
    const reloaded = createLocalModelLifecycle({
      fileStore: missing.fileStore,
      inspector: missing.inspector,
      telemetry: missing.telemetry,
      clock: missing.clock,
    });
    await expectLifecycleError(reloaded.load(), 'MANIFEST_READ_FAILED');

    const infoFailure = harness();
    await importModel(infoFailure);
    infoFailure.fileStore.modelInfoFailure = true;
    const infoFailureReloaded = createLocalModelLifecycle({
      fileStore: infoFailure.fileStore,
      inspector: infoFailure.inspector,
      telemetry: infoFailure.telemetry,
      clock: infoFailure.clock,
    });
    await expectLifecycleError(
      infoFailureReloaded.load(),
      'MANIFEST_READ_FAILED'
    );
  });

  it('Owner 確定後だけ copy・SHA-256・Metadata・Risk・内容非保持 Report を保存する', async () => {
    const state = harness();
    state.telemetry.snapshots = [
      SUPPORTED_SNAPSHOT,
      {
        ...SUPPORTED_SNAPSHOT,
        processMemoryBytes: 130_000_000,
        batteryLevelPermille: 790,
      },
    ];

    const model = await importModel(state);
    const loaded = await state.lifecycle.load();

    expect(model.sha256).toBe(DIGEST_ABC);
    expect(model.privateUri).toBe(`${PRIVATE_ROOT}/${DIGEST_ABC}.gguf`);
    expect(model.metadata).toEqual({
      architecture: 'llama',
      contextLength: 4096,
      fileType: 2,
    });
    expect(model.risk.level).toBe('supported');
    expect(state.fileStore.closeCalls).toBe(1);
    expect(loaded.benchmarkReports[0]).toMatchObject({
      modelSha256: DIGEST_ABC,
      importDurationMs: 250,
      peakProcessMemoryBytes: 130_000_000,
      batteryDeltaPermille: -10,
    });
    expect(state.fileStore.manifestText).not.toContain(CANDIDATE.uri);
  });

  it('Clock 未注入時も端末の wall clock と monotonic clock で Import を計測する', async () => {
    const state = harness();
    const lifecycle = createLocalModelLifecycle({
      fileStore: state.fileStore,
      inspector: state.inspector,
      telemetry: state.telemetry,
    });

    const model = await lifecycle.importCandidate(CANDIDATE);
    expect(Date.parse(model.importedAt)).toBeGreaterThan(0);
  });

  it('不正候補、同名、上限、事前 Cancel、空き容量不足は copy 前に拒否する', async () => {
    for (const candidate of [
      { ...CANDIDATE, name: 'model.bin' },
      { ...CANDIDATE, name: '../model.gguf' },
      { ...CANDIDATE, uri: '' },
      { ...CANDIDATE, sizeBytes: 0 },
      { ...CANDIDATE, name: `${'あ'.repeat(50)}.gguf` },
    ]) {
      const invalid = harness();
      await expectLifecycleError(
        invalid.lifecycle.importCandidate(candidate),
        'INVALID_FILE'
      );
      expect(invalid.fileStore.copyCalls).toBe(0);
    }

    const sameName = harness();
    await importModel(sameName);
    await expectLifecycleError(
      sameName.lifecycle.importCandidate(CANDIDATE),
      'NAME_CONFLICT'
    );

    const full = harness();
    const base = await importModel(full);
    const models = Array.from({ length: 8 }, (_, index) => {
      const sha256 = index.toString(16).padStart(64, '0');
      const clone = {
        ...base,
        sha256,
        originalFileName: `model-${index}.gguf`,
        privateUri: `${PRIVATE_ROOT}/${sha256}.gguf`,
      };
      full.fileStore.privateFiles.set(clone.privateUri, new Uint8Array(3));
      return clone;
    });
    full.fileStore.manifestText = serializeLocalModelManifest({
      schemaVersion: 1,
      activeModelSha256: null,
      models,
      benchmarkReports: [],
    });
    const fullLifecycle = createLocalModelLifecycle({
      fileStore: full.fileStore,
      inspector: full.inspector,
      telemetry: full.telemetry,
      clock: full.clock,
    });
    await expectLifecycleError(
      fullLifecycle.importCandidate({ ...CANDIDATE, name: 'ninth.gguf' }),
      'MODEL_LIMIT_REACHED'
    );

    const cancelled = harness();
    const controller = new AbortController();
    controller.abort();
    await expectLifecycleError(
      cancelled.lifecycle.importCandidate(CANDIDATE, controller.signal),
      'IMPORT_CANCELLED'
    );

    const noSpace = harness();
    noSpace.fileStore.availableBytes = CANDIDATE.sizeBytes;
    await expectLifecycleError(
      noSpace.lifecycle.importCandidate(CANDIDATE),
      'INSUFFICIENT_STORAGE'
    );

    const noDiskInfo = harness();
    noDiskInfo.fileStore.availableDiskFailure = true;
    await expectLifecycleError(
      noDiskInfo.lifecycle.importCandidate(CANDIDATE),
      'INSUFFICIENT_STORAGE'
    );
  });

  it('copy・size・read・GGUF・move の各失敗で incoming File を残さない', async () => {
    const scenarios: readonly [
      (state: ReturnType<typeof harness>) => void,
      ModelLifecycleErrorCode,
    ][] = [
      [(state) => (state.fileStore.copyFailure = true), 'COPY_FAILED'],
      [
        (state) => (state.fileStore.incomingSizeOverride = 2),
        'COPY_INCOMPLETE',
      ],
      [
        (state) => (state.fileStore.incomingInfoFailure = true),
        'COPY_INCOMPLETE',
      ],
      [
        (state) => (state.fileStore.sourceOpenFailure = true),
        'SOURCE_UNREADABLE',
      ],
      [
        (state) => (state.fileStore.sourceReadFailure = true),
        'SOURCE_UNREADABLE',
      ],
      [(state) => (state.inspector.failure = true), 'INVALID_GGUF'],
      [
        (state) =>
          (state.inspector.rawMetadata = {
            'general.architecture': 'llama',
          }),
        'INCOMPATIBLE_MODEL',
      ],
      [
        (state) =>
          (state.inspector.rawMetadata = {
            'general.architecture': 'llama',
            'llama.context_length': '1024',
            'general.file_type': '2',
          }),
        'INCOMPATIBLE_MODEL',
      ],
      [(state) => (state.fileStore.moveFailure = true), 'COPY_FAILED'],
    ];

    for (const [prepare, code] of scenarios) {
      const state = harness();
      prepare(state);
      await expectLifecycleError(
        state.lifecycle.importCandidate(CANDIDATE),
        code
      );
      state.fileStore.incomingInfoFailure = false;
      expect((await state.fileStore.incomingFileInfo()).exists).toBe(false);
    }
  });

  it('hash 中 Abort と同一 digest を型付きで拒否し、source を必ず close する', async () => {
    const aborted = harness();
    const controller = new AbortController();
    const originalOpen = aborted.fileStore.openSha256Source.bind(
      aborted.fileStore
    );
    aborted.fileStore.openSha256Source = async (uri) => {
      const source = await originalOpen(uri);
      return {
        ...source,
        async read(offset, length) {
          controller.abort();
          return source.read(offset, length);
        },
      };
    };
    await expectLifecycleError(
      aborted.lifecycle.importCandidate(CANDIDATE, controller.signal),
      'IMPORT_CANCELLED'
    );
    expect(aborted.fileStore.closeCalls).toBe(1);

    const moved = harness();
    const movedController = new AbortController();
    const originalMove = moved.fileStore.moveIncomingToModel.bind(
      moved.fileStore
    );
    moved.fileStore.moveIncomingToModel = async (sha256) => {
      const privateUri = await originalMove(sha256);
      movedController.abort();
      return privateUri;
    };
    await expectLifecycleError(
      moved.lifecycle.importCandidate(CANDIDATE, movedController.signal),
      'IMPORT_CANCELLED'
    );
    expect(moved.fileStore.privateFiles.size).toBe(1);
    await moved.lifecycle.load();
    expect(moved.fileStore.privateFiles.size).toBe(0);

    const duplicate = harness();
    await importModel(duplicate);
    duplicate.fileStore.externalFiles.set(
      'content://selected/same.gguf',
      new TextEncoder().encode('abc')
    );
    await expectLifecycleError(
      duplicate.lifecycle.importCandidate({
        name: 'same.gguf',
        uri: 'content://selected/same.gguf',
        sizeBytes: 3,
      }),
      'DUPLICATE_MODEL'
    );
  });

  it('Manifest 保存結果が曖昧でも File を先に消さず、次回 load で永続 Manifest と照合する', async () => {
    const state = harness();
    state.fileStore.writeManifestFailures = 1;

    await expectLifecycleError(
      state.lifecycle.importCandidate(CANDIDATE),
      'MANIFEST_WRITE_FAILED'
    );
    expect(state.fileStore.privateFiles.size).toBe(1);
    expect(state.fileStore.manifestText).toBeNull();
    expect((await state.lifecycle.load()).models).toEqual([]);
    expect(state.fileStore.privateFiles.size).toBe(0);

    const committed = harness();
    committed.fileStore.writeManifestAfterCommitFailures = 1;
    await expectLifecycleError(
      committed.lifecycle.importCandidate(CANDIDATE),
      'MANIFEST_WRITE_FAILED'
    );
    expect(committed.fileStore.privateFiles.size).toBe(1);
    expect((await committed.lifecycle.load()).models).toHaveLength(1);
    expect(committed.fileStore.privateFiles.size).toBe(1);
  });

  it('Import 失敗後の incoming cleanup が失敗しても、次回 load は cache を使わず reconcile を再試行する', async () => {
    const state = harness();
    state.inspector.failure = true;
    state.fileStore.incomingDeleteFailure = true;
    await expectLifecycleError(
      state.lifecycle.importCandidate(CANDIDATE),
      'INVALID_GGUF'
    );
    expect(state.fileStore.privateFiles.size).toBe(1);
    const readsBeforeRecovery = state.fileStore.manifestReads;

    state.fileStore.incomingDeleteFailure = false;
    expect((await state.lifecycle.load()).models).toEqual([]);
    expect(state.fileStore.manifestReads).toBeGreaterThan(readsBeforeRecovery);
    expect(state.fileStore.privateFiles.size).toBe(0);
  });

  it('read handle の close 失敗は型付き SOURCE_UNREADABLE に正規化し、元の read 失敗を上書きしない', async () => {
    const completedDigest = harness();
    completedDigest.fileStore.closeFailure = true;
    await expectLifecycleError(
      completedDigest.lifecycle.importCandidate(CANDIDATE),
      'SOURCE_UNREADABLE'
    );

    const failedRead = harness();
    failedRead.fileStore.sourceReadFailure = true;
    failedRead.fileStore.closeFailure = true;
    await expectLifecycleError(
      failedRead.lifecycle.importCandidate(CANDIDATE),
      'SOURCE_UNREADABLE'
    );
    expect(failedRead.fileStore.closeCalls).toBe(1);
  });

  it('Resource Telemetry 失敗は unavailable snapshot として fail closed に扱う', async () => {
    const state = harness();
    state.telemetry.failure = true;

    const model = await importModel(state);
    const imported = await state.lifecycle.load();
    expect(model.risk.level).toBe('blocked');
    expect(imported.benchmarkReports[0]).toMatchObject({
      peakProcessMemoryBytes: null,
      thermalStateBefore: 'unknown',
      thermalStateAfter: 'unknown',
      batteryDeltaPermille: null,
    });
    await expectLifecycleError(
      state.lifecycle.activate(model.sha256),
      'RESOURCE_BLOCKED'
    );

    state.telemetry.failure = false;
    await state.lifecycle.activate(model.sha256);
    state.telemetry.failure = true;
    const reloaded = createLocalModelLifecycle({
      fileStore: state.fileStore,
      inspector: state.inspector,
      telemetry: state.telemetry,
      clock: state.clock,
    });
    expect((await reloaded.load()).activeModelSha256).toBeNull();
  });

  it('supported は即時 activate、caution は snapshot key 一致後だけ、blocked は初期化前に拒否する', async () => {
    const supported = harness();
    const model = await importModel(supported);
    expect((await supported.lifecycle.activate(model.sha256)).sha256).toBe(
      model.sha256
    );
    expect((await supported.lifecycle.load()).activeModelSha256).toBe(
      model.sha256
    );

    const caution = harness();
    const cautionModel = await importModel(caution);
    caution.telemetry.snapshots = [cautionSnapshot()];
    caution.telemetry.calls = 0;
    const assessment = await caution.lifecycle.assessActivation(
      cautionModel.sha256
    );
    expect(assessment.risk.level).toBe('caution');
    expect(assessment.cautionConfirmationKey).toContain(cautionModel.sha256);
    await expectLifecycleError(
      caution.lifecycle.activate(cautionModel.sha256, 'stale'),
      'CAUTION_CONFIRMATION_REQUIRED'
    );
    await caution.lifecycle.activate(
      cautionModel.sha256,
      assessment.cautionConfirmationKey ?? undefined
    );

    const blocked = harness();
    const blockedModel = await importModel(blocked);
    blocked.telemetry.snapshots = [blockedSnapshot()];
    blocked.telemetry.calls = 0;
    const blockedAssessment = await blocked.lifecycle.assessActivation(
      blockedModel.sha256
    );
    expect(blockedAssessment.cautionConfirmationKey).toBeNull();
    await expectLifecycleError(
      blocked.lifecycle.activate(blockedModel.sha256),
      'RESOURCE_BLOCKED'
    );
    await expectLifecycleError(
      blocked.lifecycle.activate('f'.repeat(64)),
      'MODEL_NOT_FOUND'
    );
  });

  it('inactive Model が同じ Size の別内容へ変化した場合も activate 前の SHA-256 再検証で拒否する', async () => {
    const state = harness();
    const model = await importModel(state);
    state.fileStore.privateFiles.set(
      model.privateUri,
      new TextEncoder().encode('abd')
    );

    await expectLifecycleError(
      state.lifecycle.activate(model.sha256),
      'MODEL_INTEGRITY_FAILED'
    );
    expect((await state.lifecycle.load()).activeModelSha256).toBeNull();
  });

  it('再起動時に digest と現在 Risk を再検証し、不一致・caution・blocked は active を解除する', async () => {
    for (const prepare of [
      (state: ReturnType<typeof harness>, model: ImportedLocalModel) =>
        state.fileStore.privateFiles.set(
          model.privateUri,
          new TextEncoder().encode('abd')
        ),
      (state: ReturnType<typeof harness>) => {
        state.telemetry.snapshots = [cautionSnapshot()];
        state.telemetry.calls = 0;
      },
      (state: ReturnType<typeof harness>) => {
        state.telemetry.snapshots = [blockedSnapshot()];
        state.telemetry.calls = 0;
      },
      (state: ReturnType<typeof harness>) => {
        state.fileStore.sourceOpenFailure = true;
      },
    ]) {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      prepare(state, model);
      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      expect((await reloaded.load()).activeModelSha256).toBeNull();
    }
  });

  it('Unload は active Context teardown 後だけ Manifest を Rules 状態へ戻す', async () => {
    const state = harness();
    expect(await state.lifecycle.unload(async () => undefined)).toBe(false);
    const model = await importModel(state);
    await state.lifecycle.activate(model.sha256);
    let teardownFinished = false;
    const unloaded = state.lifecycle.unload(async () => {
      teardownFinished = true;
    });
    expect(await unloaded).toBe(true);
    expect(teardownFinished).toBe(true);
    expect((await state.lifecycle.load()).activeModelSha256).toBeNull();
  });

  it('Delete は active teardown・File staging・Manifest・finalize の順で record と report を消す', async () => {
    const state = harness();
    const model = await importModel(state);
    await state.lifecycle.activate(model.sha256);
    let teardownCalls = 0;

    expect(
      await state.lifecycle.deleteModel(model.sha256, async () => {
        teardownCalls += 1;
      })
    ).toBe(true);
    const loaded = await state.lifecycle.load();
    expect(teardownCalls).toBe(1);
    expect(loaded.models).toEqual([]);
    expect(loaded.benchmarkReports).toEqual([]);
    expect(state.fileStore.privateFiles.size).toBe(0);
  });

  it('Delete の stage・Manifest・restore 失敗を区別し、finalize failure は次回 reconcile に委ねる', async () => {
    const stageFailure = harness();
    const stagedModel = await importModel(stageFailure);
    stageFailure.fileStore.stageFailure = true;
    await expectLifecycleError(
      stageFailure.lifecycle.deleteModel(
        stagedModel.sha256,
        async () => undefined
      ),
      'DELETE_FAILED'
    );

    const writeFailure = harness();
    const restoredModel = await importModel(writeFailure);
    writeFailure.fileStore.writeManifestFailures = 1;
    await expectLifecycleError(
      writeFailure.lifecycle.deleteModel(
        restoredModel.sha256,
        async () => undefined
      ),
      'MANIFEST_WRITE_FAILED'
    );
    expect(
      writeFailure.fileStore.privateFiles.has(restoredModel.privateUri)
    ).toBe(true);

    const restoreFailure = harness();
    const lostModel = await importModel(restoreFailure);
    restoreFailure.fileStore.writeManifestFailures = 1;
    restoreFailure.fileStore.restoreFailure = true;
    await expectLifecycleError(
      restoreFailure.lifecycle.deleteModel(
        lostModel.sha256,
        async () => undefined
      ),
      'DELETE_FAILED'
    );
    restoreFailure.fileStore.restoreFailure = false;
    expect((await restoreFailure.lifecycle.load()).models).toHaveLength(1);
    expect(
      restoreFailure.fileStore.privateFiles.has(lostModel.privateUri)
    ).toBe(true);

    const finalizeFailure = harness();
    const finalModel = await importModel(finalizeFailure);
    finalizeFailure.fileStore.finalizeFailure = true;
    expect(
      await finalizeFailure.lifecycle.deleteModel(
        finalModel.sha256,
        async () => undefined
      )
    ).toBe(true);
    expect(finalizeFailure.fileStore.stagedUri).not.toBeNull();
    expect((await finalizeFailure.lifecycle.load()).models).toEqual([]);
    expect(finalizeFailure.fileStore.privateFiles.size).toBe(0);

    await expectLifecycleError(
      finalizeFailure.lifecycle.deleteModel(
        'f'.repeat(64),
        async () => undefined
      ),
      'MODEL_NOT_FOUND'
    );
  });

  it('Benchmark Report は Model ごとに直近 20 件だけを atomic 保存する', async () => {
    const state = harness();
    await importModel(state);
    for (let index = 0; index < 21; index += 1) {
      await state.lifecycle.appendBenchmarkReport(
        report(
          new Date(Date.parse('2026-07-18T01:00:00.000Z') + index).toISOString()
        )
      );
    }
    const loaded = await state.lifecycle.load();
    expect(loaded.benchmarkReports).toHaveLength(20);
    expect(loaded.benchmarkReports[0]?.measuredAt).toBe(
      '2026-07-18T01:00:00.001Z'
    );
    await expectLifecycleError(
      state.lifecycle.appendBenchmarkReport(
        report('2026-07-18T02:00:00.000Z', 'f'.repeat(64))
      ),
      'MODEL_NOT_FOUND'
    );
  });

  it('失敗した mutation の後も lane は poison されず、次の load を実行できる', async () => {
    const state = harness();
    state.fileStore.copyFailure = true;
    await expectLifecycleError(
      state.lifecycle.importCandidate(CANDIDATE),
      'COPY_FAILED'
    );
    state.fileStore.copyFailure = false;
    expect((await state.lifecycle.load()).models).toEqual([]);
  });
});
