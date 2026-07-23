import {
  createEmptyLocalModelManifest,
  evaluateModelResourceRisk,
  type ImportedLocalModel,
  type LocalModelBenchmarkReport,
  LocalModelLifecycleError,
  type LocalModelManifest,
  type ModelResourceRisk,
  type ModelResourceRiskInput,
  type ProcessMemoryLimitProvenance,
  parseLocalModelManifest,
  projectGgufMetadata,
  serializeLocalModelManifest,
  type ThermalState,
} from './local-model-manifest';
import {
  Sha256ReadError,
  type Sha256Source,
  sha256HexFromSource,
} from './sha256';

export type ModelLifecycleErrorCode =
  | 'IMPORT_CANCELLED'
  | 'INVALID_FILE'
  | 'INSUFFICIENT_STORAGE'
  | 'SOURCE_UNREADABLE'
  | 'NAME_CONFLICT'
  | 'DUPLICATE_MODEL'
  | 'MODEL_LIMIT_REACHED'
  | 'COPY_FAILED'
  | 'COPY_INCOMPLETE'
  | 'INVALID_GGUF'
  | 'INCOMPATIBLE_MODEL'
  | 'MANIFEST_READ_FAILED'
  | 'MANIFEST_WRITE_FAILED'
  | 'RESOURCE_BLOCKED'
  | 'MODEL_INTEGRITY_FAILED'
  | 'CAUTION_CONFIRMATION_REQUIRED'
  | 'NATIVE_CONTEXT_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'DELETE_FAILED';

export class ModelLifecycleError extends Error {
  readonly code: ModelLifecycleErrorCode;

  constructor(code: ModelLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'ModelLifecycleError';
    this.code = code;
  }
}

export interface ModelImportCandidate {
  readonly name: string;
  readonly uri: string;
  readonly sizeBytes: number;
}

export interface StoredModelFileInfo {
  readonly exists: boolean;
  readonly sizeBytes: number | null;
  readonly uri: string;
}

export interface ManagedModelStoreInspection {
  readonly count: number;
  readonly totalBytes: number;
  readonly representativeDigest: string | null;
  readonly hasFinalOrStagedModel: boolean;
  readonly hasManagedStore: boolean;
}

export interface ClosableSha256Source extends Sha256Source {
  readonly close: () => void;
}

export interface LocalModelCopyOptions {
  readonly maximumBytes: number;
  readonly minimumFreeBytes: number;
  readonly signal?: AbortSignal;
}

export type LocalModelCopyErrorCode =
  | 'ABORTED'
  | 'LIMIT_EXCEEDED'
  | 'INSUFFICIENT_STORAGE';

export class LocalModelCopyError extends Error {
  readonly code: LocalModelCopyErrorCode;

  constructor(code: LocalModelCopyErrorCode) {
    super('Local Model copy failed.');
    this.name = 'LocalModelCopyError';
    this.code = code;
  }
}

/** Expo FileSystem の副作用を閉じ込める private storage Port。 */
export interface LocalModelFileStore {
  readonly readManifestText: () => Promise<string | null>;
  readonly atomicWriteManifest: (serialized: string) => Promise<void>;
  readonly reconcilePrivateFiles: (
    referencedModelDigests: readonly string[]
  ) => Promise<void>;
  readonly availableDiskSpaceBytes: () => Promise<number>;
  readonly copyExternalFileToIncoming: (
    externalUri: string,
    options: LocalModelCopyOptions
  ) => Promise<void>;
  readonly incomingFileInfo: () => Promise<StoredModelFileInfo>;
  readonly openSha256Source: (
    privateUri: string
  ) => Promise<ClosableSha256Source>;
  readonly moveIncomingToModel: (sha256: string) => Promise<string>;
  readonly modelFileInfo: (privateUri: string) => Promise<StoredModelFileInfo>;
  readonly stageModelDeletion: (
    privateUri: string,
    sha256: string
  ) => Promise<string>;
  readonly restoreStagedModel: (
    stagedUri: string,
    privateUri: string
  ) => Promise<void>;
  readonly finalizeStagedModelDeletion: (stagedUri: string) => Promise<void>;
  readonly deleteIncomingFile: () => Promise<void>;
  /** Manifest を parse せず exact managed GGUF payload の件数と byte 数だけを列挙する。 */
  readonly inspectManagedModelFiles: () => Promise<ManagedModelStoreInspection>;
  /** Manifest を信用せず、この Store が所有する exact filename だけを全消去して残存 0 を検証する。 */
  readonly purgeManagedFiles: () => Promise<void>;
}

/** llama.rn の Metadata API。Context 初期化 API はこの Port に含めない。 */
export interface LocalModelInspector {
  readonly inspect: (privateUri: string) => Promise<unknown>;
}

export interface DeviceResourceSnapshot {
  readonly physicalMemoryBytes: number | null;
  readonly processMemoryLimitBytes: number | null;
  /**
   * major（Issue 104 PR #132、Codex 指摘）: `processMemoryLimitBytes` の意味は
   * OS ごとに異なる（iOS は Process 単位の実測 Ceiling、Android は端末全体の
   * 空き容量）。詳細は `local-model-manifest.ts` の
   * `ProcessMemoryLimitProvenance` を参照。
   */
  readonly processMemoryLimitProvenance: ProcessMemoryLimitProvenance;
  readonly processMemoryBytes: number | null;
  readonly thermalState: ThermalState;
  readonly batteryLevelPermille: number | null;
}

export interface DeviceResourceTelemetry {
  readonly snapshot: () => Promise<DeviceResourceSnapshot>;
}

export interface ModelLifecycleClock {
  readonly wallClockMs: () => number;
  readonly monotonicMs: () => number;
}

export interface ActivationAssessment {
  readonly model: ImportedLocalModel;
  readonly risk: ModelResourceRisk;
  readonly cautionConfirmationKey: string | null;
}

export interface LocalModelLifecycle {
  readonly load: () => Promise<LocalModelManifest>;
  readonly assessImportCandidate: (
    candidate: ModelImportCandidate
  ) => Promise<number>;
  readonly importCandidate: (
    candidate: ModelImportCandidate,
    signal?: AbortSignal
  ) => Promise<ImportedLocalModel>;
  readonly assessActivation: (sha256: string) => Promise<ActivationAssessment>;
  readonly activate: (
    sha256: string,
    cautionConfirmationKey?: string
  ) => Promise<ImportedLocalModel>;
  readonly unload: (
    waitForNativeTeardown: () => Promise<void>
  ) => Promise<boolean>;
  readonly deleteModel: (
    sha256: string,
    waitForNativeTeardown: () => Promise<void>
  ) => Promise<boolean>;
  readonly purgeManagedStore: () => Promise<void>;
  readonly appendBenchmarkReport: (
    report: LocalModelBenchmarkReport
  ) => Promise<void>;
}

export interface LocalModelLifecycleDependencies {
  readonly fileStore: LocalModelFileStore;
  readonly inspector: LocalModelInspector;
  readonly telemetry: DeviceResourceTelemetry;
  readonly clock?: ModelLifecycleClock;
}

/**
 * `/simplify` 指摘（reuse）: `trusted-model-download.ts` の空き容量確認も同じ
 * 64 MiB reserve を使うため、export して値の drift を防ぐ（以前は
 * コメントで「値を揃える」と書きつつ literal を複製していた）。
 */
export const REQUIRED_FREE_SPACE_BYTES = 64 * 1024 * 1024;
const MAX_FILE_NAME_BYTES = 128;
const MAX_MODELS = 8;
const MAX_REPORTS_PER_MODEL = 20;
/**
 * Issue 104 Priority 2（Bonsai-ready 化）: CPU-only（`nGpuLayers: 0`）から Native
 * の GPU offload を既定で使う設定へ変更する（ADR-0037・
 * `docs/design/llama-provider-development-build.md` 参照）。owner が Settings の
 * Model 管理画面から import する GGUF に適用される既定値であり、Resource Risk
 * Gate（`evaluateModelResourceRisk`）は `nCtx` だけを見るため本変更の影響を
 * 受けない。
 */
const DEFAULT_CONFIGURATION = {
  nCtx: 2_048,
  nGpuLayers: 99,
  nPredict: 96,
} as const;

const DEFAULT_CLOCK: ModelLifecycleClock = {
  wallClockMs: Date.now,
  monotonicMs: () => performance.now(),
};
const UNAVAILABLE_RESOURCE_SNAPSHOT: DeviceResourceSnapshot = {
  physicalMemoryBytes: null,
  processMemoryLimitBytes: null,
  processMemoryLimitProvenance: 'unavailable',
  processMemoryBytes: null,
  thermalState: 'unknown',
  batteryLevelPermille: null,
};

function lifecycleError(
  code: ModelLifecycleErrorCode,
  message: string
): ModelLifecycleError {
  return new ModelLifecycleError(code, message);
}

function validCandidate(candidate: ModelImportCandidate): boolean {
  return (
    typeof candidate.name === 'string' &&
    candidate.name.toLowerCase().endsWith('.gguf') &&
    !candidate.name.includes('/') &&
    !candidate.name.includes('\\') &&
    !candidate.name.includes('\0') &&
    new TextEncoder().encode(candidate.name).byteLength <=
      MAX_FILE_NAME_BYTES &&
    typeof candidate.uri === 'string' &&
    candidate.uri.length > 0 &&
    candidate.uri.length <= 8_192 &&
    !candidate.uri.includes('\0') &&
    Number.isSafeInteger(candidate.sizeBytes) &&
    candidate.sizeBytes > 0
  );
}

function assertCandidate(
  candidate: ModelImportCandidate,
  manifest: LocalModelManifest
): void {
  if (!validCandidate(candidate)) {
    throw lifecycleError(
      'INVALID_FILE',
      '選択した File は有効な .gguf ではありません。'
    );
  }
  if (
    manifest.models.some((model) => model.originalFileName === candidate.name)
  ) {
    throw lifecycleError(
      'NAME_CONFLICT',
      '同じ名前の Local Model は既に取り込まれています。'
    );
  }
  if (manifest.models.length >= MAX_MODELS) {
    throw lifecycleError(
      'MODEL_LIMIT_REACHED',
      '保存できる Local Model の上限に達しています。'
    );
  }
}

function assertImportNotCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw lifecycleError(
    'IMPORT_CANCELLED',
    'Local Model の取り込みを中止しました。'
  );
}

function parseManifestText(serialized: string | null): LocalModelManifest {
  if (serialized === null) return createEmptyLocalModelManifest();
  try {
    return parseLocalModelManifest(JSON.parse(serialized));
  } catch {
    throw lifecycleError(
      'MANIFEST_READ_FAILED',
      'Local Model Manifest を読み取れませんでした。'
    );
  }
}

async function readManifest(
  fileStore: LocalModelFileStore
): Promise<LocalModelManifest> {
  try {
    const serialized = await fileStore.readManifestText();
    if (serialized === null) {
      const managed = await fileStore.inspectManagedModelFiles();
      if (managed.hasFinalOrStagedModel) {
        throw lifecycleError(
          'MANIFEST_READ_FAILED',
          'Local Model Manifest が無い状態で managed File が残っています。'
        );
      }
    }
    return parseManifestText(serialized);
  } catch (error: unknown) {
    if (error instanceof ModelLifecycleError) throw error;
    throw lifecycleError(
      'MANIFEST_READ_FAILED',
      'Local Model Manifest を読み取れませんでした。'
    );
  }
}

async function writeManifest(
  fileStore: LocalModelFileStore,
  manifest: LocalModelManifest
): Promise<void> {
  try {
    await fileStore.atomicWriteManifest(serializeLocalModelManifest(manifest));
  } catch {
    throw lifecycleError(
      'MANIFEST_WRITE_FAILED',
      'Local Model Manifest を保存できませんでした。'
    );
  }
}

async function digestPrivateFile(
  fileStore: LocalModelFileStore,
  privateUri: string,
  signal?: AbortSignal
): Promise<string> {
  let source: ClosableSha256Source | undefined;
  let digest: string | null = null;
  let failure: ModelLifecycleError | null = null;
  try {
    source = await fileStore.openSha256Source(privateUri);
    digest = await sha256HexFromSource(source, {
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error: unknown) {
    if (
      (error instanceof Sha256ReadError && error.code === 'CANCELLED') ||
      signal?.aborted
    ) {
      failure = lifecycleError(
        'IMPORT_CANCELLED',
        'Local Model の取り込みを中止しました。'
      );
    } else {
      failure = lifecycleError(
        'SOURCE_UNREADABLE',
        'Local Model File を読み取れませんでした。'
      );
    }
  }
  if (source) {
    try {
      source.close();
    } catch {
      failure ??= lifecycleError(
        'SOURCE_UNREADABLE',
        'Local Model File の read handle を閉じられませんでした。'
      );
    }
  }
  if (failure) throw failure;
  if (digest === null) {
    throw lifecycleError(
      'SOURCE_UNREADABLE',
      'Local Model File を読み取れませんでした。'
    );
  }
  return digest;
}

async function assertModelIntegrity(
  fileStore: LocalModelFileStore,
  model: ImportedLocalModel
): Promise<void> {
  let info: StoredModelFileInfo;
  try {
    info = await fileStore.modelFileInfo(model.privateUri);
  } catch {
    throw lifecycleError(
      'SOURCE_UNREADABLE',
      'Local Model File の状態を確認できませんでした。'
    );
  }
  if (!info.exists || info.sizeBytes !== model.sizeBytes) {
    throw lifecycleError(
      'MODEL_INTEGRITY_FAILED',
      'Local Model File の Size が取り込み時と一致しません。'
    );
  }
  if ((await digestPrivateFile(fileStore, model.privateUri)) !== model.sha256) {
    throw lifecycleError(
      'MODEL_INTEGRITY_FAILED',
      'Local Model File の SHA-256 が取り込み時と一致しません。'
    );
  }
}

/**
 * `/simplify` 指摘（simplification）: `DeviceResourceSnapshot` から
 * `ModelResourceRiskInput` を組み立てる箇所が 3 か所（`riskFor`・
 * `verifyActiveModelAtLoad`・`assess`）に分散し、この PR で
 * `processMemoryLimitProvenance` を 3 か所同時に足す必要があった。1 か所へ
 * まとめ、次にフィールドが増えてもここだけ直せばよくする。
 */
function resourceRiskInputFrom(
  snapshot: DeviceResourceSnapshot,
  modelSizeBytes: number,
  nCtx: number
): ModelResourceRiskInput {
  return {
    modelSizeBytes,
    nCtx,
    physicalMemoryBytes: snapshot.physicalMemoryBytes,
    processMemoryLimitBytes: snapshot.processMemoryLimitBytes,
    processMemoryLimitProvenance: snapshot.processMemoryLimitProvenance,
    thermalState: snapshot.thermalState,
  };
}

function riskFor(
  modelSizeBytes: number,
  snapshot: DeviceResourceSnapshot
): ModelResourceRisk {
  return evaluateModelResourceRisk(
    resourceRiskInputFrom(snapshot, modelSizeBytes, DEFAULT_CONFIGURATION.nCtx)
  );
}

function confirmationKey(
  sha256: string,
  risk: ModelResourceRisk
): string | null {
  if (risk.level !== 'caution') return null;
  return [
    sha256,
    risk.effectiveMemoryBytes,
    risk.estimatedWorkingSetBytes,
    risk.ratioPermille,
    ...risk.reasons,
  ].join(':');
}

function findModel(
  manifest: LocalModelManifest,
  sha256: string
): ImportedLocalModel {
  const model = manifest.models.find(
    (candidate) => candidate.sha256 === sha256
  );
  if (!model) {
    throw lifecycleError(
      'MODEL_NOT_FOUND',
      '指定された Local Model は見つかりません。'
    );
  }
  return model;
}

function withUpdatedModelRisk(
  manifest: LocalModelManifest,
  sha256: string,
  risk: ModelResourceRisk
): LocalModelManifest {
  return {
    ...manifest,
    models: manifest.models.map((model) =>
      model.sha256 === sha256 ? { ...model, risk } : model
    ),
  };
}

function importReport(
  sha256: string,
  measuredAt: string,
  durationMs: number,
  before: DeviceResourceSnapshot,
  after: DeviceResourceSnapshot
): LocalModelBenchmarkReport {
  const observedMemory = [
    before.processMemoryBytes,
    after.processMemoryBytes,
  ].filter((value): value is number => value !== null && value > 0);
  const batteryDeltaPermille =
    before.batteryLevelPermille === null || after.batteryLevelPermille === null
      ? null
      : after.batteryLevelPermille - before.batteryLevelPermille;
  return {
    schemaVersion: 1,
    modelSha256: sha256,
    measuredAt,
    outcome: 'success',
    importDurationMs: Math.max(0, Math.round(durationMs)),
    loadDurationMs: null,
    firstTokenDurationMs: null,
    completionDurationMs: null,
    peakProcessMemoryBytes:
      observedMemory.length === 0 ? null : Math.max(...observedMemory),
    thermalStateBefore: before.thermalState,
    thermalStateAfter: after.thermalState,
    batteryDeltaPermille,
  };
}

function importedModel(
  candidate: ModelImportCandidate,
  sha256: string,
  privateUri: string,
  importedAt: string,
  metadata: ImportedLocalModel['metadata'],
  risk: ModelResourceRisk
): ImportedLocalModel {
  return {
    sha256,
    originalFileName: candidate.name,
    privateUri,
    sizeBytes: candidate.sizeBytes,
    importedAt,
    metadata,
    risk,
    configuration: DEFAULT_CONFIGURATION,
  };
}

async function deleteIncomingQuietly(
  fileStore: LocalModelFileStore
): Promise<void> {
  try {
    await fileStore.deleteIncomingFile();
  } catch {
    // 次回 load の reconcile が再試行する。元の型付き失敗を隠さない。
  }
}

async function assertAvailableStorage(
  fileStore: LocalModelFileStore,
  sizeBytes: number
): Promise<void> {
  const freeSpace = await availableStorageBytes(fileStore);
  if (
    sizeBytes > Number.MAX_SAFE_INTEGER - REQUIRED_FREE_SPACE_BYTES ||
    freeSpace < sizeBytes + REQUIRED_FREE_SPACE_BYTES
  ) {
    throw lifecycleError(
      'INSUFFICIENT_STORAGE',
      'Local Model を安全に取り込む空き容量がありません。'
    );
  }
}

async function availableStorageBytes(
  fileStore: LocalModelFileStore
): Promise<number> {
  let freeSpace: number;
  try {
    freeSpace = await fileStore.availableDiskSpaceBytes();
  } catch {
    throw lifecycleError(
      'INSUFFICIENT_STORAGE',
      'Local Model を安全に取り込む空き容量を確認できませんでした。'
    );
  }
  if (!Number.isSafeInteger(freeSpace) || freeSpace < 0) {
    throw lifecycleError(
      'INSUFFICIENT_STORAGE',
      'Local Model を安全に取り込む空き容量を確認できませんでした。'
    );
  }
  return freeSpace;
}

async function copyAndVerifyIncoming(
  fileStore: LocalModelFileStore,
  candidate: ModelImportCandidate,
  signal?: AbortSignal
): Promise<StoredModelFileInfo> {
  try {
    await fileStore.copyExternalFileToIncoming(candidate.uri, {
      maximumBytes: candidate.sizeBytes,
      minimumFreeBytes: REQUIRED_FREE_SPACE_BYTES,
      ...(signal ? { signal } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof LocalModelCopyError) {
      if (error.code === 'ABORTED') {
        throw lifecycleError(
          'IMPORT_CANCELLED',
          'Local Model の取り込みを中止しました。'
        );
      }
      if (error.code === 'INSUFFICIENT_STORAGE') {
        throw lifecycleError(
          'INSUFFICIENT_STORAGE',
          'Local Model を安全に取り込む空き容量がありません。'
        );
      }
      throw lifecycleError(
        'COPY_INCOMPLETE',
        'Local Model が確認済み Size を超えたため Copy を中止しました。'
      );
    }
    if (signal?.aborted) {
      throw lifecycleError(
        'IMPORT_CANCELLED',
        'Local Model の取り込みを中止しました。'
      );
    }
    throw lifecycleError(
      'COPY_FAILED',
      'Local Model を private storage へ Copy できませんでした。'
    );
  }
  let incoming: StoredModelFileInfo;
  try {
    incoming = await fileStore.incomingFileInfo();
  } catch {
    throw lifecycleError(
      'COPY_INCOMPLETE',
      'Local Model の Copy 完了を確認できませんでした。'
    );
  }
  if (!incoming.exists || incoming.sizeBytes !== candidate.sizeBytes) {
    throw lifecycleError(
      'COPY_INCOMPLETE',
      'Local Model の Copy 完了を確認できませんでした。'
    );
  }
  return incoming;
}

async function inspectIncomingModel(
  inspector: LocalModelInspector,
  privateUri: string
): Promise<ImportedLocalModel['metadata']> {
  let rawMetadata: unknown;
  try {
    rawMetadata = await inspector.inspect(privateUri);
  } catch {
    throw lifecycleError(
      'INVALID_GGUF',
      'GGUF Metadata を読み取れませんでした。'
    );
  }
  try {
    const metadata = projectGgufMetadata(rawMetadata);
    if (metadata.contextLength < DEFAULT_CONFIGURATION.nCtx) {
      throw new LocalModelLifecycleError(
        'INCOMPATIBLE_MODEL',
        'GGUF Context Length は既定 Context を満たしません。'
      );
    }
    return metadata;
  } catch (error: unknown) {
    if (error instanceof LocalModelLifecycleError) {
      throw lifecycleError(
        error.code === 'INCOMPATIBLE_MODEL'
          ? 'INCOMPATIBLE_MODEL'
          : 'INVALID_GGUF',
        error.message
      );
    }
    throw lifecycleError(
      'INVALID_GGUF',
      'GGUF Metadata を検証できませんでした。'
    );
  }
}

async function moveIncomingModel(
  fileStore: LocalModelFileStore,
  sha256: string
): Promise<string> {
  try {
    return await fileStore.moveIncomingToModel(sha256);
  } catch {
    throw lifecycleError(
      'COPY_FAILED',
      'Local Model の private File を確定できませんでした。'
    );
  }
}

async function stageDeletion(
  fileStore: LocalModelFileStore,
  model: ImportedLocalModel
): Promise<string> {
  try {
    return await fileStore.stageModelDeletion(model.privateUri, model.sha256);
  } catch {
    throw lifecycleError(
      'DELETE_FAILED',
      'Local Model File を削除できませんでした。'
    );
  }
}

async function restoreDeletion(
  fileStore: LocalModelFileStore,
  stagedUri: string,
  privateUri: string
): Promise<void> {
  try {
    await fileStore.restoreStagedModel(stagedUri, privateUri);
  } catch {
    throw lifecycleError(
      'DELETE_FAILED',
      'Local Model の削除 transaction を復元できませんでした。'
    );
  }
}

async function reconcilePrivateStore(
  fileStore: LocalModelFileStore,
  loaded: LocalModelManifest
): Promise<void> {
  try {
    await fileStore.reconcilePrivateFiles(
      loaded.models.map((model) => model.sha256)
    );
  } catch {
    throw lifecycleError(
      'MANIFEST_READ_FAILED',
      'Local Model private storage を照合できませんでした。'
    );
  }
}

async function assertManifestFilesPresent(
  fileStore: LocalModelFileStore,
  loaded: LocalModelManifest
): Promise<void> {
  try {
    for (const model of loaded.models) {
      const info = await fileStore.modelFileInfo(model.privateUri);
      if (!info.exists || info.sizeBytes !== model.sizeBytes) {
        throw lifecycleError(
          'MANIFEST_READ_FAILED',
          'Local Model Manifest と private File が一致しません。'
        );
      }
    }
  } catch {
    throw lifecycleError(
      'MANIFEST_READ_FAILED',
      'Local Model Manifest と private File を照合できませんでした。'
    );
  }
}

async function resourceSnapshot(
  telemetry: DeviceResourceTelemetry
): Promise<DeviceResourceSnapshot> {
  try {
    return await telemetry.snapshot();
  } catch {
    return UNAVAILABLE_RESOURCE_SNAPSHOT;
  }
}

async function verifyActiveModelAtLoad(
  fileStore: LocalModelFileStore,
  telemetry: DeviceResourceTelemetry,
  loaded: LocalModelManifest
): Promise<LocalModelManifest> {
  if (loaded.activeModelSha256 === null) return loaded;
  const active = findModel(loaded, loaded.activeModelSha256);
  let digestMatches = false;
  try {
    digestMatches =
      (await digestPrivateFile(fileStore, active.privateUri)) === active.sha256;
  } catch {
    digestMatches = false;
  }
  const snapshot = await resourceSnapshot(telemetry);
  const currentRisk = evaluateModelResourceRisk(
    resourceRiskInputFrom(snapshot, active.sizeBytes, active.configuration.nCtx)
  );
  const withCurrentRisk = withUpdatedModelRisk(
    loaded,
    active.sha256,
    currentRisk
  );
  return {
    ...withCurrentRisk,
    activeModelSha256:
      digestMatches && currentRisk.level === 'supported' ? active.sha256 : null,
  };
}

/** Import / Activate / Unload / Delete を単一 mutation lane で直列化する。 */
export function createLocalModelLifecycle(
  dependencies: LocalModelLifecycleDependencies
): LocalModelLifecycle {
  const { fileStore, inspector, telemetry } = dependencies;
  const clock = dependencies.clock ?? DEFAULT_CLOCK;
  let manifest: LocalModelManifest | null = null;
  let mutationTail: Promise<void> = Promise.resolve();

  function schedule<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = mutationTail.then(operation, operation);
    mutationTail = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
  }

  async function ensureLoaded(): Promise<LocalModelManifest> {
    if (manifest) return manifest;
    const loaded = await readManifest(fileStore);
    await reconcilePrivateStore(fileStore, loaded);
    await assertManifestFilesPresent(fileStore, loaded);
    const verified = await verifyActiveModelAtLoad(
      fileStore,
      telemetry,
      loaded
    );
    if (verified !== loaded) await writeManifest(fileStore, verified);
    manifest = verified;
    return verified;
  }

  function load(): Promise<LocalModelManifest> {
    return schedule(async () => ensureLoaded());
  }

  function assessImportCandidate(
    candidate: ModelImportCandidate
  ): Promise<number> {
    return schedule(async () => {
      const current = await ensureLoaded();
      assertCandidate(candidate, current);
      return availableStorageBytes(fileStore);
    });
  }

  async function runImport(
    candidate: ModelImportCandidate,
    signal?: AbortSignal
  ): Promise<ImportedLocalModel> {
    const current = await ensureLoaded();
    assertCandidate(candidate, current);
    assertImportNotCancelled(signal);
    await assertAvailableStorage(fileStore, candidate.sizeBytes);

    const startedAt = clock.monotonicMs();
    const before = await resourceSnapshot(telemetry);
    await deleteIncomingQuietly(fileStore);
    try {
      const incoming = await copyAndVerifyIncoming(
        fileStore,
        candidate,
        signal
      );
      assertImportNotCancelled(signal);
      const sha256 = await digestPrivateFile(fileStore, incoming.uri, signal);
      assertImportNotCancelled(signal);
      if (current.models.some((model) => model.sha256 === sha256)) {
        throw lifecycleError(
          'DUPLICATE_MODEL',
          '同じ内容の Local Model は既に取り込まれています。'
        );
      }
      const metadata = await inspectIncomingModel(inspector, incoming.uri);
      assertImportNotCancelled(signal);
      const after = await resourceSnapshot(telemetry);
      assertImportNotCancelled(signal);
      const risk = riskFor(candidate.sizeBytes, after);
      const privateUri = await moveIncomingModel(fileStore, sha256);
      try {
        assertImportNotCancelled(signal);
        const importedAt = new Date(clock.wallClockMs()).toISOString();
        const model = importedModel(
          candidate,
          sha256,
          privateUri,
          importedAt,
          metadata,
          risk
        );
        const report = importReport(
          sha256,
          importedAt,
          clock.monotonicMs() - startedAt,
          before,
          after
        );
        const next = {
          ...current,
          models: [...current.models, model],
          benchmarkReports: [...current.benchmarkReports, report],
        };
        await writeManifest(fileStore, next);
        manifest = next;
        return model;
      } catch (error: unknown) {
        // atomic write は rename 後に失敗を返す場合がある。File を消さず、次回 load で
        // 永続 Manifest を正本として retain / delete のどちらかへ収束させる。
        manifest = null;
        throw error;
      }
    } catch (error: unknown) {
      // incoming cleanup が失敗しても、次回 load が必ず reconcile を再実行できるようにする。
      manifest = null;
      await deleteIncomingQuietly(fileStore);
      throw error;
    }
  }

  function importCandidate(
    candidate: ModelImportCandidate,
    signal?: AbortSignal
  ): Promise<ImportedLocalModel> {
    return schedule(() => runImport(candidate, signal));
  }

  async function assess(sha256: string): Promise<ActivationAssessment> {
    const current = await ensureLoaded();
    const model = findModel(current, sha256);
    await assertModelIntegrity(fileStore, model);
    const snapshot = await resourceSnapshot(telemetry);
    const risk = evaluateModelResourceRisk(
      resourceRiskInputFrom(snapshot, model.sizeBytes, model.configuration.nCtx)
    );
    const next = withUpdatedModelRisk(current, sha256, risk);
    await writeManifest(fileStore, next);
    manifest = next;
    return {
      model: findModel(next, sha256),
      risk,
      cautionConfirmationKey: confirmationKey(sha256, risk),
    };
  }

  function assessActivation(sha256: string): Promise<ActivationAssessment> {
    return schedule(() => assess(sha256));
  }

  function activate(
    sha256: string,
    cautionConfirmationKey?: string
  ): Promise<ImportedLocalModel> {
    return schedule(async () => {
      const assessment = await assess(sha256);
      if (assessment.risk.level === 'blocked') {
        throw lifecycleError(
          'RESOURCE_BLOCKED',
          '現在の端末状態では Local Model を安全に開始できません。'
        );
      }
      if (
        assessment.risk.level === 'caution' &&
        assessment.cautionConfirmationKey !== cautionConfirmationKey
      ) {
        throw lifecycleError(
          'CAUTION_CONFIRMATION_REQUIRED',
          'Local Model の Resource 注意事項をもう一度確認してください。'
        );
      }
      const current = await ensureLoaded();
      const next = { ...current, activeModelSha256: sha256 };
      await writeManifest(fileStore, next);
      manifest = next;
      return findModel(next, sha256);
    });
  }

  function unload(
    waitForNativeTeardown: () => Promise<void>
  ): Promise<boolean> {
    return schedule(async () => {
      const current = await ensureLoaded();
      if (current.activeModelSha256 === null) return false;
      await waitForNativeTeardown();
      const next = { ...current, activeModelSha256: null };
      await writeManifest(fileStore, next);
      manifest = next;
      return true;
    });
  }

  function deleteModel(
    sha256: string,
    waitForNativeTeardown: () => Promise<void>
  ): Promise<boolean> {
    return schedule(async () => {
      let current = await ensureLoaded();
      const model = findModel(current, sha256);
      if (current.activeModelSha256 === sha256) {
        await waitForNativeTeardown();
        current = { ...current, activeModelSha256: null };
      }
      const stagedUri = await stageDeletion(fileStore, model);
      const next = {
        ...current,
        models: current.models.filter(
          (candidate) => candidate.sha256 !== sha256
        ),
        benchmarkReports: current.benchmarkReports.filter(
          (report) => report.modelSha256 !== sha256
        ),
      };
      try {
        await writeManifest(fileStore, next);
      } catch (error: unknown) {
        manifest = null;
        await restoreDeletion(fileStore, stagedUri, model.privateUri);
        throw error;
      }
      try {
        await fileStore.finalizeStagedModelDeletion(stagedUri);
      } catch {
        // Manifest は既に参照を外している。次回 reconcile が staged File を削除する。
        manifest = null;
        return true;
      }
      manifest = next;
      return true;
    });
  }

  function purgeManagedStore(): Promise<void> {
    return schedule(async () => {
      manifest = null;
      try {
        await fileStore.purgeManagedFiles();
      } catch {
        throw lifecycleError(
          'DELETE_FAILED',
          'Local Model private storage を完全に削除できませんでした。'
        );
      }
      const empty = await ensureLoaded();
      if (
        empty.activeModelSha256 !== null ||
        empty.models.length !== 0 ||
        empty.benchmarkReports.length !== 0
      ) {
        manifest = null;
        throw lifecycleError(
          'DELETE_FAILED',
          'Local Model private storage の削除完了を確認できませんでした。'
        );
      }
    });
  }

  function appendBenchmarkReport(
    report: LocalModelBenchmarkReport
  ): Promise<void> {
    return schedule(async () => {
      const current = await ensureLoaded();
      findModel(current, report.modelSha256);
      const retained = current.benchmarkReports.filter(
        (candidate) => candidate.modelSha256 === report.modelSha256
      );
      const remove = Math.max(0, retained.length - MAX_REPORTS_PER_MODEL + 1);
      const removedKeys = new Set(
        retained
          .slice(0, remove)
          .map(
            (candidate) => `${candidate.modelSha256}:${candidate.measuredAt}`
          )
      );
      const next = {
        ...current,
        benchmarkReports: [
          ...current.benchmarkReports.filter(
            (candidate) =>
              !removedKeys.has(
                `${candidate.modelSha256}:${candidate.measuredAt}`
              )
          ),
          report,
        ],
      };
      await writeManifest(fileStore, next);
      manifest = next;
    });
  }

  return {
    load,
    assessImportCandidate,
    importCandidate,
    assessActivation,
    activate,
    unload,
    deleteModel,
    purgeManagedStore,
    appendBenchmarkReport,
  };
}
