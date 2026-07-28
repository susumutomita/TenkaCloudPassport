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
  /**
   * best-effort: 2 つの private storage 整合作業をまとめて行う。(1) Manifest が
   * もう参照しない孤立 File（`.incoming.gguf`・staged 削除の残骸・参照切れの
   * managed File）を掃除する。(2) 逆に、まだ参照されている Model の staged File
   * （crash 等で削除の undo が完了しないまま残った状態）を最終位置へ復元する。
   * どちらも呼び出し元（`reconcilePrivateStore`）はこの呼び出しの失敗を致命的に
   * 扱わない（owner 実機観測、ADR-0054）。孤立 File の掃除失敗は次回の
   * reconcile へ持ち越されるだけで安全だが、(2) の復元に失敗した場合は
   * 「参照されているはずの Model の File が無い」状態が残りうる。これは
   * 直後に呼ばれる `selfHealMissingModelFiles`（`modelFileInfo` で参照済み
   * Model 全件の存在・Size を検証する）が正しく検出し、欠落・不一致が
   * あれば ADR-0055 により当該 Model だけを Manifest から除去して load を
   * 継続させる——つまりこの Method 自体は握りつぶしても、参照済み Model の
   * 整合性が握りつぶされて load 全体が壊れる（v1.1.1 の削除バグ残骸で owner
   * 実機が踏んだ恒久ブリック）ことはない。実装は 1 件の File の掃除・復元
   * 失敗で他の File の処理まで止めないことが望ましい
   * （`expo-model-file-store.native.ts` 参照）。
   */
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
  /**
   * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 信頼済み Model の
   * ネイティブ MD5 を計算する（`expo-file-system/legacy` の
   * `getInfoAsync(uri, { md5: true })`、数秒）。取り込み時は `.incoming.gguf`
   * の URI（`copyExternalFileToIncoming` 完了直後の URI）を、activate 時は
   * 確定済み managed File の `privateUri` を渡す。どちらも native adapter 側で
   * `readableManagedFile` を経由し、app-private data container の UUID 差し替え
   * （ADR-0045）に対して自己修復する。手動 GGUF import（Document Picker 経由）は
   * `openSha256Source` による純 TypeScript SHA-256 全量計算を引き続き使うため、
   * この Method は呼ばない。
   */
  readonly md5OfFile: (privateUri: string) => Promise<string>;
  readonly moveIncomingToModel: (sha256: string) => Promise<string>;
  readonly modelFileInfo: (privateUri: string) => Promise<StoredModelFileInfo>;
  /**
   * app-private data container の UUID は再インストール・Clean Build・App 更新の
   * たびに変わる（ADR-0045）。sha256 から「現在の」container における managed File
   * の絶対 URI を返す。呼び出し側はこれを使い、Manifest に保存された古い container の
   * `privateUri` を self-heal する。
   */
  readonly resolveManagedModelUri: (sha256: string) => Promise<string>;
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

/**
 * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 信頼済みダウンロード
 * （`trusted-model-catalog.ts` の pinned エントリ）の取り込みだけが渡す。
 * `sha256` は catalog の pinned 値をそのまま identity（`${sha256}.gguf`）に
 * 使い、デバイスでは再計算しない。`md5` は取り込んだ `.incoming.gguf` の
 * ネイティブ MD5 との一致検証に使う。手動 GGUF import（Document Picker
 * 経由）はこれを渡さず、従来どおり純 TypeScript SHA-256 全量計算
 * （`digestPrivateFile`）で identity を導出する。
 */
export interface TrustedImportVerification {
  readonly sha256: string;
  readonly md5: string;
  /**
   * copy 完了後・ネイティブ MD5 照合の直前に 1 度だけ呼ぶ。呼び出し元
   * （`use-local-model-management.ts`）はこれを使い、UI の「検証しています」
   * 表示へ切り替える。
   */
  readonly onVerifying?: () => void;
}

export interface LocalModelLifecycle {
  readonly load: () => Promise<LocalModelManifest>;
  readonly assessImportCandidate: (
    candidate: ModelImportCandidate
  ) => Promise<number>;
  readonly importCandidate: (
    candidate: ModelImportCandidate,
    signal?: AbortSignal,
    trustedVerification?: TrustedImportVerification
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
  /**
   * ADR-0053 追補（実機 blocker 3、activate 時のフル SHA-256 二重計算の解消）:
   * import 直後の `enableOnDeviceAi` は import → assessActivation/activate を
   * 連続実行する。`assess` が呼ぶ `assertModelIntegrity` がここを考慮せず常に
   * 純 TypeScript SHA-256 全量計算（`digestPrivateFile`）を行うと、import 時に
   * 高速化したはずのネイティブ MD5 検証のすぐ後で同じ 1 GiB 級 File を再度フル
   * hash し、「検証しています」表示が謳う「数秒で完了」が偽りになる。この
   * lookup が対象 `sha256` に対して非 null を返す限り、activate 時も import 時と
   * 同じネイティブ MD5 照合を使う。未指定・対象外の sha256（＝手動 GGUF
   * import）は既存の SHA-256 全量計算にフォールバックする。
   */
  readonly trustedModelMd5For?: (sha256: string) => string | null;
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
    return await selfHealManagedPrivateUris(
      fileStore,
      parseManifestText(serialized)
    );
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

/**
 * `/simplify` 指摘（reuse）: `selfHealManagedPrivateUris`（ADR-0045）と
 * `selfHealMissingModelFiles`（ADR-0055）が共有する tolerance。load 時に
 * self-heal した Manifest の永続化を試みるが、失敗しても in-memory の訂正
 * 結果をそのまま使う（次回の書き込み成功時に同じ self-heal が再実行される
 * ため、この 1 回の失敗で修復結果を捨てる理由が無い）。
 */
async function persistHealedManifestBestEffort(
  fileStore: LocalModelFileStore,
  healed: LocalModelManifest
): Promise<void> {
  try {
    await writeManifest(fileStore, healed);
  } catch {
    // 訂正した in-memory Manifest はこの session でそのまま使う（doc comment 参照）。
  }
}

/**
 * app-private data container の UUID は再インストール・Clean Build・App 更新の
 * たびに変わる（ADR-0045）。Manifest に保存された `privateUri` が古い container を
 * 指したままでも、file 名（sha256）自体は変わらないため、常に「現在の」container へ
 * 再解決してから返す。差分があれば訂正済み Manifest の永続化も試みる（永続化が
 * 失敗しても、次回の書き込み成功時に同じ self-heal が再実行されるため、この 1 回の
 * 失敗で in-memory の訂正結果を捨てたり Model を読めなくしたりはしない）。
 */
async function selfHealManagedPrivateUris(
  fileStore: LocalModelFileStore,
  manifest: LocalModelManifest
): Promise<LocalModelManifest> {
  if (manifest.models.length === 0) return manifest;
  let changed = false;
  const healedModels = await Promise.all(
    manifest.models.map(async (model) => {
      let resolvedUri: string;
      try {
        resolvedUri = await fileStore.resolveManagedModelUri(model.sha256);
      } catch {
        // 解決できなければ self-heal を諦め、保存済みの値をそのまま使う。以降の
        // integrity 検証・load が従来どおり型付き失敗として扱う。
        return model;
      }
      if (resolvedUri === model.privateUri) return model;
      changed = true;
      return { ...model, privateUri: resolvedUri };
    })
  );
  if (!changed) return manifest;
  const healed = { ...manifest, models: healedModels };
  await persistHealedManifestBestEffort(fileStore, healed);
  return healed;
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

/**
 * `/simplify` 指摘（simplification・altitude）: 「native MD5 を計算し、失敗は
 * `SOURCE_UNREADABLE`、不一致は `MODEL_INTEGRITY_FAILED`」という同じ制御フローが
 * `verifyTrustedIncoming`（import 時）と `assertModelIntegrity`（activate 時）に
 * 重複していた。呼び出し側ごとに異なる不一致時メッセージだけを引数化し、
 * 1 か所へ集約する。
 */
async function assertNativeMd5(
  fileStore: LocalModelFileStore,
  uri: string,
  expectedMd5: string,
  mismatchMessage: string
): Promise<void> {
  let md5: string;
  try {
    md5 = await fileStore.md5OfFile(uri);
  } catch {
    throw lifecycleError(
      'SOURCE_UNREADABLE',
      'Local Model File の MD5 を計算できませんでした。'
    );
  }
  if (md5 !== expectedMd5) {
    throw lifecycleError('MODEL_INTEGRITY_FAILED', mismatchMessage);
  }
}

/**
 * ADR-0053（実機 blocker 3、DL 完了後の検証フリーズ）: 信頼済みダウンロードの
 * 取り込みだけが通る経路。純 TypeScript SHA-256（`digestPrivateFile`）の代わりに
 * ネイティブ MD5（`fileStore.md5OfFile`）を catalog の pinned 値と照合し、
 * 一致すれば pinned sha256 をそのまま identity として返す（デバイスでは
 * 再計算しない）。
 */
async function verifyTrustedIncoming(
  fileStore: LocalModelFileStore,
  verification: TrustedImportVerification,
  incomingUri: string
): Promise<string> {
  verification.onVerifying?.();
  await assertNativeMd5(
    fileStore,
    incomingUri,
    verification.md5,
    '取り込んだ Local Model の内容が確認済みの値と一致しません。'
  );
  return verification.sha256;
}

/**
 * ADR-0053 追補: `trustedMd5For(model.sha256)` が非 null を返す Model（信頼済み
 * ダウンロード経由で import された Model）は、activate 時もネイティブ MD5 照合
 * だけを行い、純 TypeScript SHA-256 全量計算は行わない。対象外（手動 GGUF
 * import）は既存どおり `digestPrivateFile` にフォールバックする。
 */
async function assertModelIntegrity(
  fileStore: LocalModelFileStore,
  model: ImportedLocalModel,
  trustedMd5For?: (sha256: string) => string | null
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
  const trustedMd5 = trustedMd5For?.(model.sha256) ?? null;
  if (trustedMd5 !== null) {
    await assertNativeMd5(
      fileStore,
      model.privateUri,
      trustedMd5,
      'Local Model File の MD5 が取り込み時と一致しません。'
    );
    return;
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

/**
 * `/simplify` 指摘（altitude）: 「1 件以上の Model を Manifest から除去する」
 * という同じ 3 field 変更（`models`・`benchmarkReports`・`activeModelSha256`）
 * が `deleteModel`（明示的に 1 件を指定）と `selfHealMissingModelFiles`
 * （ADR-0055、File 欠落から計算した複数件）の 2 箇所に分かれて実装されていた。
 * 1 か所へまとめ、将来 3 つ目の除去経路が増えても 3 field を揃え忘れるリスクを
 * 無くす。
 */
function withoutModels(
  manifest: LocalModelManifest,
  removedSha256: ReadonlySet<string>
): LocalModelManifest {
  return {
    ...manifest,
    models: manifest.models.filter((model) => !removedSha256.has(model.sha256)),
    benchmarkReports: manifest.benchmarkReports.filter(
      (report) => !removedSha256.has(report.modelSha256)
    ),
    activeModelSha256:
      manifest.activeModelSha256 !== null &&
      removedSha256.has(manifest.activeModelSha256)
        ? null
        : manifest.activeModelSha256,
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

/**
 * `reconcilePrivateFiles` の best-effort 契約は Port 定義（`LocalModelFileStore`
 * の doc comment）を正本とする。owner 実機観測（TestFlight v1.1.1、ADR-0054）:
 * `deleteModel` 成功直後の `refresh()`（`ensureLoaded` 再実行）がここで失敗し、
 * 既に完了していた削除に対して真因の無い `MANIFEST_READ_FAILED` を表示していた
 * ため、この呼び出しの失敗を握りつぶす。
 */
async function reconcilePrivateStore(
  fileStore: LocalModelFileStore,
  loaded: LocalModelManifest
): Promise<void> {
  try {
    await fileStore.reconcilePrivateFiles(
      loaded.models.map((model) => model.sha256)
    );
  } catch {
    // 意図的に握りつぶす（上記 doc comment 参照）。
  }
}

type ManifestFilePresence = 'present' | 'missing' | 'unknown';

/**
 * `modelFileInfo` の結果を 3 通りに分ける。`!exists`・Size 不一致は「壊れて
 * いる」という積極的な証拠があるため `'missing'`。呼び出し自体が例外を投げる
 * 場合は「情報が取れない」だけで積極的な証拠が無いため `'unknown'`（ADR-0055
 * 選択肢 2 参照、`selfHealMissingModelFiles` はこれを self-heal 対象にしない）。
 */
async function modelFilePresence(
  fileStore: LocalModelFileStore,
  model: ImportedLocalModel
): Promise<ManifestFilePresence> {
  let info: StoredModelFileInfo;
  try {
    info = await fileStore.modelFileInfo(model.privateUri);
  } catch {
    return 'unknown';
  }
  return info.exists && info.sizeBytes === model.sizeBytes
    ? 'present'
    : 'missing';
}

/**
 * ADR-0055（owner 実機観測、TestFlight v1.1.2、「DL したら Manifest error」
 * blocker）: v1.1.1 の削除バグ残骸（Manifest はモデルを参照したまま、実体は
 * `${sha256}.deleting.gguf` に取り残し・消失）を読み込んだとき、以前の
 * fail-hard（即 `MANIFEST_READ_FAILED`）は `ensureLoaded` の入口で全操作を
 * 恒久的にブリックさせていた（新しい DL・import も同じ入口を通るため回復
 * 手段が無い）。final File が無い・Size が一致しない（`modelFilePresence` が
 * `'missing'`）Model だけを `models`・`benchmarkReports` から除去し、
 * `activeModelSha256` が指していれば `null` にする。`modelFileInfo` 自体が
 * 例外を投げるケース（`'unknown'`）は対象にせず、保存済み Model をそのまま
 * 維持する（`selfHealManagedPrivateUris`・ADR-0045 と同じ、情報が取れない
 * ことを壊れている証拠として扱わない判断）。除去自体は `deleteModel` と
 * 共有する `withoutModels` が行い、永続化は `selfHealManagedPrivateUris`
 * （ADR-0045）と共有する `persistHealedManifestBestEffort` の best-effort
 * tolerance に従う（失敗しても in-memory の修復結果をそのまま返し、次回の
 * 書き込み成功時に同じ self-heal が再実行される）。fail-closed を維持する
 * のは Manifest 自体が parse 不能な場合（`parseManifestText`）だけである。
 */
async function selfHealMissingModelFiles(
  fileStore: LocalModelFileStore,
  loaded: LocalModelManifest
): Promise<LocalModelManifest> {
  if (loaded.models.length === 0) return loaded;
  const missingSha256 = new Set<string>();
  await Promise.all(
    loaded.models.map(async (model) => {
      const presence = await modelFilePresence(fileStore, model);
      if (presence === 'missing') missingSha256.add(model.sha256);
    })
  );
  if (missingSha256.size === 0) return loaded;
  const healed = withoutModels(loaded, missingSha256);
  await persistHealedManifestBestEffort(fileStore, healed);
  return healed;
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

/**
 * 起動時のフル SHA-256 再計算を廃止した（ADR-0047、Issue 152）。以前はここで
 * 毎起動 `digestPrivateFile` を呼び、active Model（最大 1.04 GiB 級）全体を
 * 純 TypeScript 実装（`sha256.ts`）で再ハッシュしていたため、Hermes 上で数分〜
 * 十数分かかり Settings が「Local Model の端末内処理を実行中です」のまま固まる
 * 公開 blocker になっていた。File 整合性の存在＋Size 照合は `ensureLoaded` が
 * この関数を呼ぶ直前に `selfHealMissingModelFiles` で既に全 Model（active を
 * 含む）に対して行っており、不一致・欠落があれば ADR-0055 により当該 Model を
 * Manifest・`activeModelSha256` から除去する（fail-safe はそちらが担う）。
 * したがって、この関数が呼ばれる時点で `loaded.activeModelSha256` が指す
 * Model は「File 欠落・Size 不一致という積極的な証拠は無い」（`modelFileInfo`
 * 自体が例外を投げた `'unknown'` ケースは ADR-0045 と同じ判断で対象外のまま
 * active を維持するため、File 存在・Size 照合が必ず済んでいるとは限らない）。
 * この関数の責務は
 * 「現在の Resource Risk を再評価し、blocked / caution なら active を解除する」
 * ことだけで、File の digest には関与しない。同じ Size のまま内容だけが破損した
 * ケースはここでは検出できなくなるが、そのリスクと起動のたびのフル hash の
 * コストの比較は ADR-0047 を正本とする。
 */
async function verifyActiveModelAtLoad(
  telemetry: DeviceResourceTelemetry,
  loaded: LocalModelManifest
): Promise<LocalModelManifest> {
  if (loaded.activeModelSha256 === null) return loaded;
  const active = findModel(loaded, loaded.activeModelSha256);
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
    activeModelSha256: currentRisk.level === 'supported' ? active.sha256 : null,
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
    const healed = await selfHealMissingModelFiles(fileStore, loaded);
    const verified = await verifyActiveModelAtLoad(telemetry, healed);
    if (verified !== healed) await writeManifest(fileStore, verified);
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
    signal?: AbortSignal,
    trustedVerification?: TrustedImportVerification
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
      const sha256 = trustedVerification
        ? await verifyTrustedIncoming(
            fileStore,
            trustedVerification,
            incoming.uri
          )
        : await digestPrivateFile(fileStore, incoming.uri, signal);
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
    signal?: AbortSignal,
    trustedVerification?: TrustedImportVerification
  ): Promise<ImportedLocalModel> {
    return schedule(() => runImport(candidate, signal, trustedVerification));
  }

  async function assess(sha256: string): Promise<ActivationAssessment> {
    const current = await ensureLoaded();
    const model = findModel(current, sha256);
    await assertModelIntegrity(
      fileStore,
      model,
      dependencies.trustedModelMd5For
    );
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
      const next = withoutModels(current, new Set([sha256]));
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
