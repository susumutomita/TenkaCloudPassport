import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
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
  LocalModelCopyError,
  type LocalModelFileStore,
  type LocalModelInspector,
  type ModelImportCandidate,
  type ModelLifecycleClock,
  ModelLifecycleError,
  type ModelLifecycleErrorCode,
  type StoredModelFileInfo,
  type TrustedImportVerification,
} from './model-lifecycle';

function md5Hex(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

const DIGEST_ABC =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const PRIVATE_ROOT = 'file:///private/local-models';

/**
 * 実機の実 Manifest（Issue 152、ADR-0045）からそのまま採った sha256 と stale な
 * privateUri。container UUID `FF11A9B9-...` は既にその端末に存在せず、実際の
 * File は同じ file 名で `471BC8AB-...` container に移動済みだった。`sizeBytes` は
 * 実機値（1,117,320,736 byte、約 1.04 GiB）をそのままテストで確保すると重いため、
 * fabricate した 3 byte content（'abc'）に合わせて縮小している。sha256、privateUri
 * の container UUID、metadata、risk は実機の値をそのまま使う。`benchmarkReports` は
 * self-heal が読み書きしない（`models[].privateUri` だけを書き換える）ため、
 * schema 上有効な空配列にして実機の値を複製しない。
 */
const REAL_FIXTURE_SHA256 =
  '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e';
const REAL_STALE_PRIVATE_URI =
  'file:///Users/susumu/Library/Developer/CoreSimulator/Devices/11B71247-E422-4C26-82A0-EE386E49477E/data/Containers/Data/Application/FF11A9B9-4586-4CFB-9804-2DC152E52233/Documents/local-models/6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e.gguf';
const REAL_CURRENT_PRIVATE_URI =
  'file:///Users/susumu/Library/Developer/CoreSimulator/Devices/11B71247-E422-4C26-82A0-EE386E49477E/data/Containers/Data/Application/471BC8AB-7409-42B1-901F-6F48F2DF0BD3/Documents/local-models/6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e.gguf';

function realDeviceManifestFixture(): unknown {
  return {
    schemaVersion: 1,
    activeModelSha256: REAL_FIXTURE_SHA256,
    models: [
      {
        sha256: REAL_FIXTURE_SHA256,
        originalFileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        privateUri: REAL_STALE_PRIVATE_URI,
        sizeBytes: 3,
        importedAt: '2026-07-24T05:26:53.937Z',
        metadata: { architecture: 'qwen2', contextLength: 32768, fileType: 15 },
        risk: {
          level: 'supported',
          effectiveMemoryBytes: 34_359_738_368,
          estimatedWorkingSetBytes: 1_877_655_796,
          ratioPermille: 55,
          reasons: ['memory-ratio-supported'],
        },
        configuration: { nCtx: 2048, nGpuLayers: 99, nPredict: 96 },
      },
    ],
    benchmarkReports: [],
  };
}
const CANDIDATE: ModelImportCandidate = {
  name: 'model.gguf',
  uri: 'content://selected/model.gguf',
  sizeBytes: 3,
};
const SUPPORTED_SNAPSHOT: DeviceResourceSnapshot = {
  physicalMemoryBytes: 2_000_000_000,
  processMemoryLimitBytes: 2_000_000_000,
  processMemoryLimitProvenance: 'os-process-ceiling',
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
  purgeFailure = false;
  resolveManagedModelUriFailure = false;
  readonly resolveManagedModelUriOverrides = new Map<string, string>();
  manifestReads = 0;
  manifestWrites = 0;
  closeCalls = 0;
  copyCalls = 0;
  openSha256SourceCalls = 0;
  md5OfFileCalls: string[] = [];
  md5OfFileFailure = false;
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
    // file 名（basename）だけで参照を照合する。self-heal 前の container-relative
    // URI（`PRIVATE_ROOT` と異なる絶対 Path prefix を持つもの）も同じ file 名で
    // 参照済みと判定できるようにする（本番の reconcile も file 名で照合し、絶対
    // Path prefix には依存しない）。
    const referencedNames = new Set(
      referencedModelDigests.map((digest) => `${digest}.gguf`)
    );
    for (const uri of [...this.privateFiles.keys()]) {
      if (uri.endsWith('.deleting.gguf')) {
        const digest = uri.slice(
          PRIVATE_ROOT.length + 1,
          -'.deleting.gguf'.length
        );
        const finalUri = `${PRIVATE_ROOT}/${digest}.gguf`;
        const bytes = this.privateFiles.get(uri);
        if (referencedNames.has(`${digest}.gguf`) && bytes)
          this.privateFiles.set(finalUri, bytes);
        this.privateFiles.delete(uri);
      } else if (uri.endsWith('.gguf')) {
        const name = uri.slice(uri.lastIndexOf('/') + 1);
        if (!referencedNames.has(name)) this.privateFiles.delete(uri);
      }
    }
  }

  async availableDiskSpaceBytes(): Promise<number> {
    if (this.availableDiskFailure) throw new Error('disk info failed');
    return this.availableBytes;
  }

  async copyExternalFileToIncoming(
    externalUri: string,
    options: Parameters<LocalModelFileStore['copyExternalFileToIncoming']>[1]
  ): Promise<void> {
    this.copyCalls += 1;
    if (this.copyFailure) throw new Error('copy failed');
    if (options.signal?.aborted) throw new LocalModelCopyError('ABORTED');
    const bytes = this.externalFiles.get(externalUri);
    if (!bytes) throw new Error('source missing');
    if (bytes.byteLength > options.maximumBytes) {
      throw new LocalModelCopyError('LIMIT_EXCEEDED');
    }
    if (this.availableBytes < options.minimumFreeBytes + bytes.byteLength) {
      throw new LocalModelCopyError('INSUFFICIENT_STORAGE');
    }
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
    this.openSha256SourceCalls += 1;
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

  async md5OfFile(privateUri: string): Promise<string> {
    this.md5OfFileCalls.push(privateUri);
    if (this.md5OfFileFailure) throw new Error('md5 failed');
    const bytes = this.privateFiles.get(privateUri);
    if (!bytes) throw new Error('file missing');
    return md5Hex(bytes);
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

  async resolveManagedModelUri(sha256: string): Promise<string> {
    if (this.resolveManagedModelUriFailure) {
      throw new Error('resolve managed model uri failed');
    }
    return (
      this.resolveManagedModelUriOverrides.get(sha256) ??
      `${PRIVATE_ROOT}/${sha256}.gguf`
    );
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

  async inspectManagedModelFiles() {
    let count = 0;
    let totalBytes = 0;
    let representativeDigest: string | null = null;
    let hasFinalOrStagedModel = false;
    for (const [uri, bytes] of this.privateFiles) {
      const name = uri.slice(PRIVATE_ROOT.length + 1);
      const digest =
        /^([a-f0-9]{64})\.gguf$/.exec(name)?.[1] ??
        /^([a-f0-9]{64})\.deleting\.gguf$/.exec(name)?.[1];
      if (name !== '.incoming.gguf' && digest === undefined) continue;
      count += 1;
      totalBytes += bytes.byteLength;
      representativeDigest ??= digest ?? null;
      if (digest !== undefined) hasFinalOrStagedModel = true;
    }
    return {
      count,
      totalBytes,
      representativeDigest,
      hasFinalOrStagedModel,
      hasManagedStore: this.manifestText !== null || count > 0,
    };
  }

  async purgeManagedFiles(): Promise<void> {
    if (this.purgeFailure) throw new Error('purge failed');
    this.manifestText = null;
    for (const uri of [...this.privateFiles.keys()]) {
      const name = uri.slice(PRIVATE_ROOT.length + 1);
      if (
        name === '.incoming.gguf' ||
        name === '.manifest.v1.tmp' ||
        /^[a-f0-9]{64}(?:\.deleting)?\.gguf$/.test(name)
      ) {
        this.privateFiles.delete(uri);
      }
    }
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

function harness(trustedModelMd5For?: (sha256: string) => string | null) {
  const fileStore = new PrivateModelStore();
  const inspector = new GgufInspector();
  const telemetry = new ResourceTelemetry();
  const clock = new FixedClock();
  const lifecycle = createLocalModelLifecycle({
    fileStore,
    inspector,
    telemetry,
    clock,
    ...(trustedModelMd5For ? { trustedModelMd5For } : {}),
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

  it('Manifest の JSON・read 失敗と、Manifest 無しの managed File 残存を型付きで拒否する', async () => {
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

    const missingManifestWithPayload = harness();
    const orphanUri = `${PRIVATE_ROOT}/${DIGEST_ABC}.gguf`;
    missingManifestWithPayload.fileStore.privateFiles.set(
      orphanUri,
      new TextEncoder().encode('abc')
    );
    await expectLifecycleError(
      missingManifestWithPayload.lifecycle.load(),
      'MANIFEST_READ_FAILED'
    );
    expect(
      missingManifestWithPayload.fileStore.privateFiles.has(orphanUri)
    ).toBeTrue();
  });

  /**
   * ADR-0055 選択肢 2（advisor 指摘）: `modelFileInfo` が例外を投げるケース
   * （`!exists`/Size 不一致という積極的な証拠が無い transient failure）は
   * self-heal の対象にしない。`ensureLoaded` の毎回の入口で呼ばれるため、
   * 1 回の一時的な FS 障害だけで正常な Model を Manifest から失う経路を
   * 新設しないための判断（`selfHealManagedPrivateUris` が
   * `resolveManagedModelUri` 失敗時に保存値へフォールバックするのと同じ
   * 理由）。保存済み Model をそのまま維持し、以降の integrity 検証に委ねる。
   */
  it('modelFileInfo 自体の例外は self-heal の対象にせず、保存済み Model をそのまま維持する', async () => {
    const infoFailure = harness();
    const model = await importModel(infoFailure);
    infoFailure.fileStore.modelInfoFailure = true;
    const infoFailureReloaded = createLocalModelLifecycle({
      fileStore: infoFailure.fileStore,
      inspector: infoFailure.inspector,
      telemetry: infoFailure.telemetry,
      clock: infoFailure.clock,
    });

    const loaded = await infoFailureReloaded.load();

    expect(loaded.models).toHaveLength(1);
    expect(loaded.models[0]?.sha256).toBe(model.sha256);
  });

  describe('孤立 File 掃除（reconcile）の失敗は load を失敗させない（owner 実機観測、ADR-0054）', () => {
    it('reconcile 失敗は Manifest が空でも load を落とさない（best-effort、参照済み Model が無いため掃除は無意味）', async () => {
      const state = harness();
      state.fileStore.reconcileFailure = true;

      expect(await state.lifecycle.load()).toEqual({
        schemaVersion: 1,
        activeModelSha256: null,
        models: [],
        benchmarkReports: [],
      });
    });

    it('delete 成功直後、孤立 staged File の再掃除が失敗しても load は成功し、Manifest は削除後の状態のまま返る', async () => {
      // owner 実機観測（TestFlight v1.1.1）: 「オンデバイス AI を無効化して削除
      // する」を押した直後に「MANIFEST_READ_FAILED」の Error が表示され、実際は
      // 既に削除が成功していた（後で確認・再起動すると消えている）。
      // deleteModel の finalizeStagedModelDeletion 失敗（一時的な File 競合）は
      // 既存どおり成功を返す（in-memory manifest は null 化し、次回 load で
      // 再読込を強制する）。この直後の load が「同じ File が再び掃除に失敗する」
      // という現実的な状況でも失敗しないことを固定する。
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      state.fileStore.finalizeFailure = true;

      expect(
        await state.lifecycle.deleteModel(model.sha256, async () => undefined)
      ).toBe(true);

      state.fileStore.reconcileFailure = true;
      const loaded = await state.lifecycle.load();

      expect(loaded.models).toEqual([]);
      expect(loaded.activeModelSha256).toBeNull();
      expect(loaded.benchmarkReports).toEqual([]);
      // Manifest（真実の情報源）は既に正しく書き換え済みで、掃除できなかった
      // staged File だけが取りこぼされている。
      expect(state.fileStore.stagedUri).not.toBeNull();
      expect(
        state.fileStore.privateFiles.has(state.fileStore.stagedUri ?? '')
      ).toBeTrue();
    });

    it('取りこぼした staged File は、次回の reconcile 成功時に掃除される（再起動を模す）', async () => {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      state.fileStore.finalizeFailure = true;
      await state.lifecycle.deleteModel(model.sha256, async () => undefined);
      state.fileStore.reconcileFailure = true;
      await state.lifecycle.load();
      const stagedUri = state.fileStore.stagedUri;
      if (stagedUri === null) throw new Error('stagedUri が必要です。');

      // 実機の再起動は in-memory manifest キャッシュを持たない新しい
      // lifecycle instance として観測できる。同じ fileStore（= 同じ private
      // storage）を渡し、今度は reconcile が成功する状態に戻す。
      state.fileStore.reconcileFailure = false;
      const restarted = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const reloaded = await restarted.load();

      expect(reloaded.models).toEqual([]);
      expect(state.fileStore.privateFiles.has(stagedUri)).toBeFalse();
    });
  });

  /**
   * ADR-0055: owner が TestFlight v1.1.2 の実機で報告した「Local Model を
   * DL したら Manifest error になる」blocker。原因は v1.1.1 の削除バグ
   * （`File.move` の uri 付け替えによる誤 throw、PR #178 で修正済み）が
   * 実機に残した状態そのもの——Manifest はモデルを参照したまま、実体は
   * `${sha256}.deleting.gguf` に取り残し（または消失）。旧
   * `assertManifestFilesPresent` は「参照先の final File が無い/Size 不一致 →
   * 即 `MANIFEST_READ_FAILED`」の fail-hard だったため、この状態に一度入ると
   * 全ての load・enable・import が `ensureLoaded` の入口で恒久的に失敗した
   * （新しい DL を試みても import 自体が同じ入口を通るためブリックする）。
   */
  describe('参照済み Model の final File 欠落・Size 不一致を self-heal する（owner 実機観測、v1.1.1 削除バグ残骸、ADR-0055）', () => {
    it('(a) 実機の削除バグ残骸そのもの: 参照あり + final 無し + staged 残置は、reconcile 経由で復元され active を維持する', async () => {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      const bytes = state.fileStore.privateFiles.get(model.privateUri);
      if (!bytes)
        throw new Error('fixture の前提（final File 実在）が崩れています。');
      // v1.1.1 の削除バグ残骸を模す: 本来の delete は Manifest から参照を外して
      // から staging するが、このバグは参照を外さないまま実体だけを staged 名へ
      // 取り残した。
      const stagedUri = `${PRIVATE_ROOT}/${model.sha256}.deleting.gguf`;
      state.fileStore.privateFiles.set(stagedUri, bytes);
      state.fileStore.privateFiles.delete(model.privateUri);

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models).toHaveLength(1);
      expect(loaded.models[0]?.sha256).toBe(model.sha256);
      expect(loaded.activeModelSha256).toBe(model.sha256);
      // 復元が実際に起きたことを、除去されずに残ったことだけでなく final URI が
      // 実在することでも確認する（fixture が別の理由で偶然通る回帰を防ぐ）。
      expect(state.fileStore.privateFiles.has(model.privateUri)).toBeTrue();
      expect(state.fileStore.privateFiles.has(stagedUri)).toBeFalse();
    });

    it('(b) 参照あり + final 無し + staged も無い場合、そのモデルを除去し active を null にして load を成功させる（ブリックしない）', async () => {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      await state.lifecycle.appendBenchmarkReport(
        report('2026-07-28T00:00:00.000Z')
      );
      state.fileStore.privateFiles.delete(model.privateUri);

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models).toEqual([]);
      expect(loaded.activeModelSha256).toBeNull();
      expect(loaded.benchmarkReports).toEqual([]);
      const persisted = JSON.parse(state.fileStore.manifestText ?? 'null');
      expect(persisted.models).toEqual([]);
      expect(persisted.activeModelSha256).toBeNull();
      expect(persisted.benchmarkReports).toEqual([]);
    });

    it('(c) Size 不一致（部分書き等）も同様にそのモデルだけ除去する', async () => {
      const state = harness();
      const model = await importModel(state);
      state.fileStore.privateFiles.set(
        model.privateUri,
        new TextEncoder().encode('abcdef')
      );

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models).toEqual([]);
    });

    it('(d) Manifest 自体が parse 不能な場合は引き続き fail-closed で MANIFEST_READ_FAILED を投げる（回帰）', async () => {
      const state = harness();
      state.fileStore.manifestText = '{';

      await expectLifecycleError(
        state.lifecycle.load(),
        'MANIFEST_READ_FAILED'
      );
    });

    it('(e) 除去後に同じ private storage へ新規 DL・import すると正常に完了する', async () => {
      const state = harness();
      const stale = await importModel(state);
      state.fileStore.privateFiles.delete(stale.privateUri);
      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      expect((await reloaded.load()).models).toEqual([]);

      const reimported = await reloaded.importCandidate(CANDIDATE);

      expect(reimported.sha256).toBe(stale.sha256);
      expect((await reloaded.load()).models).toHaveLength(1);
    });

    /**
     * code-reviewer 指摘（low・カバレッジ）: 単一 model の fixture だけでは
     * `survivingSha256` による `models`/`benchmarkReports`/`activeModelSha256`
     * のフィルタが「除去対象 1 件」に対して常に「残り 0 件」でしか検証されない。
     * 生存モデルが存在するケース（除去対象と非対象が混在）を固定する。
     */
    it('複数 Model が混在する場合、除去対象だけを除去し、生存モデルの active・Benchmark Report は維持する', async () => {
      const state = harness();
      const survivor = await importModel(state);
      await state.lifecycle.activate(survivor.sha256);
      await state.lifecycle.appendBenchmarkReport(
        report('2026-07-28T00:00:00.000Z', survivor.sha256)
      );
      const staleCandidate: ModelImportCandidate = {
        name: 'stale-model.gguf',
        uri: 'content://selected/stale-model.gguf',
        sizeBytes: 4,
      };
      state.fileStore.externalFiles.set(
        staleCandidate.uri,
        new TextEncoder().encode('abcd')
      );
      const stale = await state.lifecycle.importCandidate(staleCandidate);
      await state.lifecycle.appendBenchmarkReport(
        report('2026-07-28T00:00:01.000Z', stale.sha256)
      );
      state.fileStore.privateFiles.delete(stale.privateUri);

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models.map((model) => model.sha256)).toEqual([
        survivor.sha256,
      ]);
      expect(loaded.activeModelSha256).toBe(survivor.sha256);
      // 除去前は import 時の自動 Report（各 Model 1 件ずつ）+ 手動 append の
      // 計 4 件。除去後は生存モデル（survivor）分の 2 件（自動 + 手動）だけが
      // 残り、stale 分の 2 件は Benchmark Report からも消える。
      expect(loaded.benchmarkReports).toHaveLength(2);
      expect(
        loaded.benchmarkReports.every(
          (entry) => entry.modelSha256 === survivor.sha256
        )
      ).toBeTrue();
    });

    it('除去の永続化が失敗しても、in-memory の修復結果（除去済み）で load を成功させる', async () => {
      const state = harness();
      const model = await importModel(state);
      state.fileStore.privateFiles.delete(model.privateUri);
      state.fileStore.writeManifestFailures = 1;

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models).toEqual([]);
      const stillPersisted = JSON.parse(state.fileStore.manifestText ?? 'null');
      expect(stillPersisted.models).toHaveLength(1);
      expect(stillPersisted.models[0].sha256).toBe(model.sha256);
    });
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

  it('Owner 確定前に候補と現在の端末空き容量を評価し、copy は開始しない', async () => {
    const state = harness();

    expect(await state.lifecycle.assessImportCandidate(CANDIDATE)).toBe(
      state.fileStore.availableBytes
    );
    expect(state.fileStore.copyCalls).toBe(0);
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
        (state) =>
          state.fileStore.externalFiles.set(
            CANDIDATE.uri,
            new TextEncoder().encode('abcd')
          ),
        'COPY_INCOMPLETE',
      ],
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
    await expectLifecycleError(moved.lifecycle.load(), 'MANIFEST_READ_FAILED');
    expect(moved.fileStore.privateFiles.size).toBe(1);
    await moved.lifecycle.purgeManagedStore();
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
    await expectLifecycleError(state.lifecycle.load(), 'MANIFEST_READ_FAILED');
    expect(state.fileStore.privateFiles.size).toBe(1);
    await state.lifecycle.purgeManagedStore();
    expect((await state.lifecycle.load()).models).toEqual([]);

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

  it('再起動時に現在の Risk を再検証し、caution・blocked では active を解除する', async () => {
    for (const prepare of [
      (state: ReturnType<typeof harness>) => {
        state.telemetry.snapshots = [cautionSnapshot()];
        state.telemetry.calls = 0;
      },
      (state: ReturnType<typeof harness>) => {
        state.telemetry.snapshots = [blockedSnapshot()];
        state.telemetry.calls = 0;
      },
    ]) {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      prepare(state);
      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      expect((await reloaded.load()).activeModelSha256).toBeNull();
    }
  });

  /**
   * 起動時のフル SHA-256 再計算を廃止した意思決定の中核テスト（ADR-0047）。
   * Qwen2.5-1.5B（1.04 GiB）を有効化した端末では、起動のたびの純 TypeScript
   * SHA-256（`sha256.ts`）が Hermes 上で数分〜十数分かかり、Settings が
   * 「Local Model の端末内処理を実行中です」のままフリーズする（実機で 9 分超
   * 経過しても解除されないことを owner が観測した公開 blocker）。file 全体を
   * 再ハッシュしなくても防げるのは「app-private 領域の File が壊れた」ケースだけで、
   * それは Size 照合でほぼ検出できる（部分書き込みは staging + atomic manifest が
   * 既に防いでいる）。同じ Size のまま内容だけが変わる破損は再ハッシュでしか
   * 検出できないが、極めて稀な上、端末そのものが攻撃者に掌握されている場合は
   * 再ハッシュでも防げないため、起動のたびの数分間のビジー化と釣り合わない。
   */
  it('Size が一致すれば内容が変化していても再起動時は active を維持する（起動時フル hash 廃止で受け入れる trade-off、ADR-0047）', async () => {
    const state = harness();
    const model = await importModel(state);
    await state.lifecycle.activate(model.sha256);
    state.fileStore.privateFiles.set(
      model.privateUri,
      new TextEncoder().encode('abd')
    );

    const reloaded = createLocalModelLifecycle({
      fileStore: state.fileStore,
      inspector: state.inspector,
      telemetry: state.telemetry,
      clock: state.clock,
    });
    const loaded = await reloaded.load();
    expect(loaded.activeModelSha256).toBe(model.sha256);
    expect(
      loaded.models.find((candidate) => candidate.sha256 === model.sha256)?.risk
        .level
    ).toBe('supported');
  });

  it('有効化済み Model の load() は SHA-256 を再計算しない（Import・Activate では計算する、ADR-0047）', async () => {
    const state = harness();
    const model = await importModel(state);
    const callsAfterImport = state.fileStore.openSha256SourceCalls;
    expect(callsAfterImport).toBeGreaterThan(0);

    await state.lifecycle.activate(model.sha256);
    const callsAfterActivate = state.fileStore.openSha256SourceCalls;
    expect(callsAfterActivate).toBeGreaterThan(callsAfterImport);

    const reloaded = createLocalModelLifecycle({
      fileStore: state.fileStore,
      inspector: state.inspector,
      telemetry: state.telemetry,
      clock: state.clock,
    });
    const loaded = await reloaded.load();
    expect(state.fileStore.openSha256SourceCalls).toBe(callsAfterActivate);
    expect(loaded.activeModelSha256).toBe(model.sha256);
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

  it('Fail-safe purge は壊れた Manifest や欠落 File を読まず、exact managed file だけを消す', async () => {
    const corrupt = harness();
    corrupt.fileStore.manifestText = '{';
    corrupt.fileStore.privateFiles.set(
      `${PRIVATE_ROOT}/${DIGEST_ABC}.gguf`,
      new TextEncoder().encode('abc')
    );
    const unrelatedUri = `${PRIVATE_ROOT}/owner-note.txt`;
    corrupt.fileStore.privateFiles.set(
      unrelatedUri,
      new TextEncoder().encode('keep')
    );

    await corrupt.lifecycle.purgeManagedStore();
    expect(await corrupt.lifecycle.load()).toEqual({
      schemaVersion: 1,
      activeModelSha256: null,
      models: [],
      benchmarkReports: [],
    });
    expect(corrupt.fileStore.privateFiles.has(unrelatedUri)).toBe(true);

    const missing = harness();
    const model = await importModel(missing);
    missing.fileStore.privateFiles.delete(model.privateUri);
    const reloaded = createLocalModelLifecycle({
      fileStore: missing.fileStore,
      inspector: missing.inspector,
      telemetry: missing.telemetry,
      clock: missing.clock,
    });
    await reloaded.purgeManagedStore();
    expect((await reloaded.load()).models).toEqual([]);
  });

  it('Fail-safe purge の削除失敗は cache を空扱いにせず型付きで拒否する', async () => {
    const state = harness();
    await importModel(state);
    state.fileStore.purgeFailure = true;

    await expectLifecycleError(
      state.lifecycle.purgeManagedStore(),
      'DELETE_FAILED'
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

  describe('privateUri の container-relative self-heal（ADR-0045、Issue 152）', () => {
    it('実機の実 Manifest（container UUID が古いまま）を読み込んでも MANIFEST_READ_FAILED にならず、現行 Path へ self-heal する', async () => {
      const state = harness();
      state.fileStore.manifestText = JSON.stringify(
        realDeviceManifestFixture()
      );
      state.fileStore.privateFiles.set(
        REAL_CURRENT_PRIVATE_URI,
        new TextEncoder().encode('abc')
      );
      state.fileStore.resolveManagedModelUriOverrides.set(
        REAL_FIXTURE_SHA256,
        REAL_CURRENT_PRIVATE_URI
      );

      const loaded = await state.lifecycle.load();

      expect(loaded.models).toHaveLength(1);
      expect(loaded.models[0]?.privateUri).toBe(REAL_CURRENT_PRIVATE_URI);
      // fabricate した 3 byte content は実機の実 digest とは一致しないが、
      // fixture の `sizeBytes: 3` とは一致する。起動時のフル SHA-256 再計算を
      // 廃止した後（ADR-0047）は Size 照合だけを見るため、self-heal 後も active
      // 選択は維持される。これはまさに本 Issue の観測（DL 済み Model を有効化した
      // 端末が起動のたびに再ハッシュのビジー壁へ当たっていた）を解消する挙動である。
      expect(loaded.activeModelSha256).toBe(REAL_FIXTURE_SHA256);
      const persisted = JSON.parse(state.fileStore.manifestText ?? 'null');
      expect(persisted.models[0].privateUri).toBe(REAL_CURRENT_PRIVATE_URI);
    });

    it('privateUri が既に現行 container と一致する場合は self-heal の書き込みを増やさない', async () => {
      const state = harness();
      const model = await importModel(state);
      const writesBeforeReload = state.fileStore.manifestWrites;

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models[0]?.privateUri).toBe(model.privateUri);
      expect(state.fileStore.manifestWrites).toBe(writesBeforeReload);
    });

    it('保存済み privateUri が現行 container と異なる場合、self-heal して現行 Path を Manifest に書き戻し、active 状態は維持する', async () => {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      const staleUri = `file:///private/OLD-CONTAINER-UUID/local-models/${model.sha256}.gguf`;
      const beforeReload = JSON.parse(state.fileStore.manifestText ?? 'null');
      beforeReload.models[0].privateUri = staleUri;
      state.fileStore.manifestText = JSON.stringify(beforeReload);
      const writesBeforeReload = state.fileStore.manifestWrites;

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models[0]?.privateUri).toBe(model.privateUri);
      expect(loaded.activeModelSha256).toBe(model.sha256);
      expect(state.fileStore.manifestWrites).toBeGreaterThan(
        writesBeforeReload
      );
      const rewritten = JSON.parse(state.fileStore.manifestText ?? 'null');
      expect(rewritten.models[0].privateUri).toBe(model.privateUri);
    });

    it('resolveManagedModelUri が失敗した場合は self-heal を諦め、保存済み privateUri をそのまま使う', async () => {
      const state = harness();
      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);
      state.fileStore.resolveManagedModelUriFailure = true;

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models[0]?.privateUri).toBe(model.privateUri);
      expect(loaded.activeModelSha256).toBe(model.sha256);
    });

    it('self-heal した Manifest の永続化が失敗しても、in-memory の訂正結果をそのまま返す', async () => {
      const state = harness();
      const model = await importModel(state);
      const staleUri = `file:///private/OLD-CONTAINER-UUID/local-models/${model.sha256}.gguf`;
      const beforeReload = JSON.parse(state.fileStore.manifestText ?? 'null');
      beforeReload.models[0].privateUri = staleUri;
      state.fileStore.manifestText = JSON.stringify(beforeReload);
      state.fileStore.writeManifestFailures = 1;

      const reloaded = createLocalModelLifecycle({
        fileStore: state.fileStore,
        inspector: state.inspector,
        telemetry: state.telemetry,
        clock: state.clock,
      });
      const loaded = await reloaded.load();

      expect(loaded.models[0]?.privateUri).toBe(model.privateUri);
      expect(
        JSON.parse(state.fileStore.manifestText ?? 'null').models[0].privateUri
      ).toBe(staleUri);
    });
  });

  /**
   * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 信頼済みダウンロードの
   * 取り込みは純 TypeScript SHA-256（`digestPrivateFile`・`openSha256Source`）を
   * 使わず、ネイティブ MD5（`md5OfFile`）で catalog の pinned 値と照合し、
   * pinned sha256 をそのまま identity に使う。手動 GGUF import
   * （`trustedVerification` 省略）は既存の純 TypeScript SHA-256 経路を維持する
   * （この describe 外の全テストが既にその回帰保証になっている）。
   */
  describe('信頼済みダウンロードの取り込み検証（ADR-0053、ネイティブ MD5）', () => {
    function trustedVerification(
      overrides: Partial<TrustedImportVerification> = {}
    ): TrustedImportVerification {
      return {
        sha256: DIGEST_ABC,
        md5: md5Hex(new TextEncoder().encode('abc')),
        ...overrides,
      };
    }

    it('md5 が一致すれば pinned sha256 を identity に使い、純 TypeScript SHA-256（openSha256Source）は呼ばない', async () => {
      const state = harness();

      const model = await state.lifecycle.importCandidate(
        CANDIDATE,
        undefined,
        trustedVerification()
      );

      expect(model.sha256).toBe(DIGEST_ABC);
      expect(model.privateUri).toBe(`${PRIVATE_ROOT}/${DIGEST_ABC}.gguf`);
      expect(state.fileStore.md5OfFileCalls.length).toBe(1);
      expect(state.fileStore.openSha256SourceCalls).toBe(0);
    });

    it('onVerifying は copy 完了後・MD5 照合前に 1 度だけ呼ばれる', async () => {
      const state = harness();
      const events: string[] = [];
      const originalMd5 = state.fileStore.md5OfFile.bind(state.fileStore);
      state.fileStore.md5OfFile = async (privateUri: string) => {
        events.push('md5-check');
        return originalMd5(privateUri);
      };

      await state.lifecycle.importCandidate(
        CANDIDATE,
        undefined,
        trustedVerification({
          onVerifying: () => events.push('on-verifying'),
        })
      );

      expect(events).toEqual(['on-verifying', 'md5-check']);
    });

    it('MD5 が一致しない場合 fail-closed で MODEL_INTEGRITY_FAILED を投げ、incoming File を残さない', async () => {
      const state = harness();

      await expectLifecycleError(
        state.lifecycle.importCandidate(
          CANDIDATE,
          undefined,
          trustedVerification({ md5: 'f'.repeat(32) })
        ),
        'MODEL_INTEGRITY_FAILED'
      );
      expect((await state.fileStore.incomingFileInfo()).exists).toBe(false);
    });

    it('MD5 計算自体が失敗した場合 SOURCE_UNREADABLE として拒否する', async () => {
      const state = harness();
      state.fileStore.md5OfFileFailure = true;

      await expectLifecycleError(
        state.lifecycle.importCandidate(
          CANDIDATE,
          undefined,
          trustedVerification()
        ),
        'SOURCE_UNREADABLE'
      );
    });

    it('trustedVerification を渡さない従来の import（手動 GGUF import）は md5OfFile を呼ばない', async () => {
      const state = harness();

      await importModel(state);

      expect(state.fileStore.md5OfFileCalls.length).toBe(0);
      expect(state.fileStore.openSha256SourceCalls).toBeGreaterThan(0);
    });

    /**
     * code-reviewer 指摘（medium）: 本番配線（`default-local-model-management.native.ts`）
     * は `trustedModelMd5For` を常に渡す（lookup 自体は常に存在する）。手動 GGUF
     * import された Model は catalog に無い sha256 のため lookup が `null` を
     * 返すだけで、「lookup 未指定」とは別の組み合わせになる。この組み合わせだけを
     * 個別にテストする既存 test が無かったため追加し、`assertModelIntegrity` が
     * 「lookup が定義されているか」ではなく「lookup の返り値」で分岐することを
     * 固定する。
     */
    it('trustedModelMd5For が定義されていても対象外の sha256 には null を返す場合、手動 import の activate は既存の SHA-256 全量計算を使う', async () => {
      // `importModel` の CANDIDATE は内容が 'abc' 固定のため、その sha256 は
      // `DIGEST_ABC` になる（`trustedVerification()` の catalog 値と同じ digest）。
      // 「lookup は定義されているが、この Model の sha256 には対応しない」組み合わせを
      // 作るため、catalog に存在しない別の sha256（'f' の 64 桁）だけに値を返す
      // lookup にする。
      const state = harness((sha256) =>
        sha256 === 'f'.repeat(64) ? 'unrelated-md5' : null
      );

      const model = await importModel(state);
      await state.lifecycle.activate(model.sha256);

      expect(model.sha256).toBe(DIGEST_ABC);
      expect(state.fileStore.md5OfFileCalls.length).toBe(0);
      expect(state.fileStore.openSha256SourceCalls).toBeGreaterThan(0);
    });

    /**
     * security-review 指摘（ADR-0053 追補）: `enableOnDeviceAi` は import 直後に
     * assessActivation/activate を連続実行する。`assess` が呼ぶ
     * `assertModelIntegrity` が `trustedModelMd5For` を考慮せず常に
     * `digestPrivateFile`（純 TypeScript SHA-256 全量計算）へ Fallback すると、
     * import 時に高速化したはずの検証が activate で即座に再び数分間のフル
     * hash に戻ってしまう（「検証しています」の「数秒で完了」表示が偽りになる）。
     * `trustedModelMd5For` を渡した lifecycle では activate もネイティブ MD5
     * 照合だけを使うことをここで固定する。
     */
    describe('信頼済み Model の activate（ADR-0053 追補、フル SHA-256 二重計算の解消）', () => {
      function trustedHarness() {
        return harness((sha256) =>
          sha256 === DIGEST_ABC ? trustedVerification().md5 : null
        );
      }

      it('import 後の activate はネイティブ MD5 照合を使い、純 TypeScript SHA-256 を再計算せず manifest が active になる', async () => {
        const state = trustedHarness();
        const model = await state.lifecycle.importCandidate(
          CANDIDATE,
          undefined,
          trustedVerification()
        );
        expect(state.fileStore.md5OfFileCalls.length).toBe(1);

        await state.lifecycle.activate(model.sha256);

        expect(state.fileStore.openSha256SourceCalls).toBe(0);
        expect(state.fileStore.md5OfFileCalls.length).toBe(2);
        expect(state.fileStore.md5OfFileCalls[1]).toBe(model.privateUri);

        const reloaded = createLocalModelLifecycle({
          fileStore: state.fileStore,
          inspector: state.inspector,
          telemetry: state.telemetry,
          clock: state.clock,
        });
        expect((await reloaded.load()).activeModelSha256).toBe(DIGEST_ABC);
      });

      it('Size が一致していても内容が破損していれば activate 時に MD5 不一致で fail-closed する', async () => {
        const state = trustedHarness();
        const model = await state.lifecycle.importCandidate(
          CANDIDATE,
          undefined,
          trustedVerification()
        );
        state.fileStore.privateFiles.set(
          model.privateUri,
          new TextEncoder().encode('xyz')
        );

        await expectLifecycleError(
          state.lifecycle.activate(model.sha256),
          'MODEL_INTEGRITY_FAILED'
        );
      });

      it('activate 時に MD5 計算自体が失敗した場合 SOURCE_UNREADABLE として拒否する', async () => {
        const state = trustedHarness();
        const model = await state.lifecycle.importCandidate(
          CANDIDATE,
          undefined,
          trustedVerification()
        );
        state.fileStore.md5OfFileFailure = true;

        await expectLifecycleError(
          state.lifecycle.activate(model.sha256),
          'SOURCE_UNREADABLE'
        );
      });
    });
  });
});
