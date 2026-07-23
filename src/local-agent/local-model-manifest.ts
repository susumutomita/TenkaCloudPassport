export type LocalModelLifecycleErrorCode =
  | 'INVALID_GGUF'
  | 'INCOMPATIBLE_MODEL'
  | 'INVALID_RESOURCE_INPUT'
  | 'INVALID_MANIFEST';

export class LocalModelLifecycleError extends Error {
  readonly code: LocalModelLifecycleErrorCode;

  constructor(code: LocalModelLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'LocalModelLifecycleError';
    this.code = code;
  }
}

export type ThermalState =
  | 'unknown'
  | 'nominal'
  | 'fair'
  | 'serious'
  | 'critical';

export interface GgufMetadata {
  readonly architecture: string;
  readonly contextLength: number;
  readonly fileType: number | null;
}

export type ModelResourceRiskLevel = 'supported' | 'caution' | 'blocked';

export type ModelResourceRiskReason =
  | 'memory-ratio-supported'
  | 'memory-ratio-caution'
  | 'memory-ratio-blocked'
  | 'memory-unavailable'
  | 'thermal-pressure';

export interface ModelResourceRisk {
  readonly level: ModelResourceRiskLevel;
  readonly effectiveMemoryBytes: number | null;
  readonly estimatedWorkingSetBytes: number;
  readonly ratioPermille: number | null;
  readonly reasons: readonly ModelResourceRiskReason[];
}

/**
 * major（Issue 104 PR #132、Codex 指摘）: `processMemoryLimitBytes` は OS ごとに
 * 意味が異なる。
 * - `os-process-ceiling`（iOS）: `phys_footprint + os_proc_available_memory()`。
 *   この Process が OOM Kill されるまでに到達しうる、Process 単位の実測 Ceiling。
 * - `system-wide-available`（Android）: `availMem + PSS`。`availMem`
 *   （`ActivityManager.MemoryInfo.availMem`）は端末全体の空き容量であり、この
 *   App 専用の割当上限ではない（他 App の状態次第で変動する。Android には
 *   iOS の `os_proc_available_memory()` に相当する Process 単位の公開 API が
 *   無い）。
 * - `unavailable`: 実測できなかった（`processMemoryLimitBytes` は必ず `null`）。
 * 同じ `processMemoryLimitBytes` を同じ信頼度で扱うと、Android で大型 Model を
 * 過度に `supported` 判定しうる。`evaluateModelResourceRisk` はこの型を見て
 * `system-wide-available` を保守的に割り引く。
 */
export type ProcessMemoryLimitProvenance =
  | 'os-process-ceiling'
  | 'system-wide-available'
  | 'unavailable';

export interface ModelResourceRiskInput {
  readonly modelSizeBytes: number;
  readonly nCtx: number;
  readonly physicalMemoryBytes: number | null;
  readonly processMemoryLimitBytes: number | null;
  readonly processMemoryLimitProvenance: ProcessMemoryLimitProvenance;
  readonly thermalState: ThermalState;
}

export interface ImportedLocalModel {
  readonly sha256: string;
  readonly originalFileName: string;
  readonly privateUri: string;
  readonly sizeBytes: number;
  readonly importedAt: string;
  readonly metadata: GgufMetadata;
  readonly risk: ModelResourceRisk;
  readonly configuration: {
    readonly nCtx: number;
    readonly nGpuLayers: number;
    readonly nPredict: number;
  };
}

export type LocalModelBenchmarkOutcome = 'success' | 'cancelled' | 'failed';

export interface LocalModelBenchmarkReport {
  readonly schemaVersion: 1;
  readonly modelSha256: string;
  readonly measuredAt: string;
  readonly outcome: LocalModelBenchmarkOutcome;
  readonly importDurationMs: number | null;
  readonly loadDurationMs: number | null;
  readonly firstTokenDurationMs: number | null;
  readonly completionDurationMs: number | null;
  readonly peakProcessMemoryBytes: number | null;
  readonly thermalStateBefore: ThermalState;
  readonly thermalStateAfter: ThermalState;
  readonly batteryDeltaPermille: number | null;
}

export interface LocalModelManifest {
  readonly schemaVersion: 1;
  readonly activeModelSha256: string | null;
  readonly models: readonly ImportedLocalModel[];
  readonly benchmarkReports: readonly LocalModelBenchmarkReport[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ARCHITECTURE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_MODELS = 8;
const MAX_REPORTS_PER_MODEL = 20;
const MAX_FILE_NAME_BYTES = 128;
const CONTEXT_RESERVE_BYTES_PER_TOKEN = 256 * 1024;

type ManifestRecord = Record<string, unknown> & {
  readonly architecture?: unknown;
  readonly contextLength?: unknown;
  readonly fileType?: unknown;
  readonly level?: unknown;
  readonly effectiveMemoryBytes?: unknown;
  readonly estimatedWorkingSetBytes?: unknown;
  readonly ratioPermille?: unknown;
  readonly reasons?: unknown;
  readonly nCtx?: unknown;
  readonly nGpuLayers?: unknown;
  readonly nPredict?: unknown;
  readonly sha256?: unknown;
  readonly originalFileName?: unknown;
  readonly privateUri?: unknown;
  readonly sizeBytes?: unknown;
  readonly importedAt?: unknown;
  readonly metadata?: unknown;
  readonly risk?: unknown;
  readonly configuration?: unknown;
  readonly importDurationMs?: unknown;
  readonly loadDurationMs?: unknown;
  readonly firstTokenDurationMs?: unknown;
  readonly completionDurationMs?: unknown;
  readonly peakProcessMemoryBytes?: unknown;
  readonly batteryDeltaPermille?: unknown;
  readonly schemaVersion?: unknown;
  readonly modelSha256?: unknown;
  readonly measuredAt?: unknown;
  readonly outcome?: unknown;
  readonly thermalStateBefore?: unknown;
  readonly thermalStateAfter?: unknown;
  readonly activeModelSha256?: unknown;
  readonly models?: unknown;
  readonly benchmarkReports?: unknown;
};

function invalidManifest(): LocalModelLifecycleError {
  return new LocalModelLifecycleError(
    'INVALID_MANIFEST',
    'Local Model Manifest の形式が不正です。'
  );
}

function isPlainRecord(value: unknown): value is ManifestRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function ownString(value: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(value, key)) return null;
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : null;
}

function decimalInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function nullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  return positiveSafeInteger(value) ? value : undefined;
}

function nullableDuration(value: unknown): number | null | undefined {
  if (value === null) return null;
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0
    ? value
    : undefined;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function isThermalState(value: unknown): value is ThermalState {
  return (
    value === 'unknown' ||
    value === 'nominal' ||
    value === 'fair' ||
    value === 'serious' ||
    value === 'critical'
  );
}

function isRiskReason(value: unknown): value is ModelResourceRiskReason {
  return (
    value === 'memory-ratio-supported' ||
    value === 'memory-ratio-caution' ||
    value === 'memory-ratio-blocked' ||
    value === 'memory-unavailable' ||
    value === 'thermal-pressure'
  );
}

/** llama.rn の unbounded raw metadata から、Load 判断に必要な 3 field だけを取り出す。 */
export function projectGgufMetadata(value: unknown): GgufMetadata {
  if (!isPlainRecord(value)) {
    throw new LocalModelLifecycleError(
      'INVALID_GGUF',
      'GGUF Metadata を読み取れませんでした。'
    );
  }
  const architecture = ownString(value, 'general.architecture');
  if (!architecture || !ARCHITECTURE_PATTERN.test(architecture)) {
    throw new LocalModelLifecycleError(
      'INCOMPATIBLE_MODEL',
      'GGUF Architecture を確認できませんでした。'
    );
  }
  const contextLength = decimalInteger(
    Object.hasOwn(value, `${architecture}.context_length`)
      ? value[`${architecture}.context_length`]
      : null
  );
  if (
    contextLength === null ||
    contextLength < 256 ||
    contextLength > 1_048_576
  ) {
    throw new LocalModelLifecycleError(
      'INCOMPATIBLE_MODEL',
      'GGUF Context Length は対応範囲外です。'
    );
  }
  const rawFileType = Object.hasOwn(value, 'general.file_type')
    ? value['general.file_type']
    : null;
  const fileType = rawFileType === null ? null : decimalInteger(rawFileType);
  if (fileType !== null && (fileType < 0 || fileType > 1_024)) {
    throw new LocalModelLifecycleError(
      'INVALID_GGUF',
      'GGUF File Type が不正です。'
    );
  }
  return { architecture, contextLength, fileType };
}

function observedMemory(values: readonly (number | null)[]): number | null {
  const available = values.filter(positiveSafeInteger);
  return available.length > 0 ? Math.min(...available) : null;
}

function isProcessMemoryLimitProvenance(
  value: unknown
): value is ProcessMemoryLimitProvenance {
  return (
    value === 'os-process-ceiling' ||
    value === 'system-wide-available' ||
    value === 'unavailable'
  );
}

/**
 * major（Issue 104 PR #132、Codex 指摘）: Android の `system-wide-available`
 * （`availMem` 由来）は Process 専用の割当上限ではなく、他 App の状態次第で
 * 変動する。iOS の `os-process-ceiling`（`os_proc_available_memory()`、Process
 * 単位の実測 Ceiling）と同じ信頼度で扱わず、保守的に半分だけを「実効値」として
 * 使う（大型 Model を安易に `supported` 判定しない）。実機の Peak Memory 証跡が
 * 揃うまでの暫定係数であり、緩和には ADR が必要（`docs/adr/0014-...` の
 * Compatibility Matrix 手続きに従う）。
 */
const SYSTEM_WIDE_AVAILABLE_HAIRCUT = 0.5;

function conservativeProcessMemoryLimitBytes(
  processMemoryLimitBytes: number | null,
  provenance: ProcessMemoryLimitProvenance
): number | null {
  if (processMemoryLimitBytes === null) return null;
  if (provenance !== 'system-wide-available') return processMemoryLimitBytes;
  return Math.floor(processMemoryLimitBytes * SYSTEM_WIDE_AVAILABLE_HAIRCUT);
}

function resourceInputIsValid(input: ModelResourceRiskInput): boolean {
  const validMemory = (value: number | null): boolean =>
    value === null || positiveSafeInteger(value);
  return (
    positiveSafeInteger(input.modelSizeBytes) &&
    Number.isSafeInteger(input.nCtx) &&
    input.nCtx >= 256 &&
    input.nCtx <= 32_768 &&
    validMemory(input.physicalMemoryBytes) &&
    validMemory(input.processMemoryLimitBytes) &&
    isProcessMemoryLimitProvenance(input.processMemoryLimitProvenance) &&
    // `unavailable` は「実測できなかった」ことの表明であり、この場合だけ
    // `processMemoryLimitBytes` は必ず `null` でなければならない（provenance と
    // 実測値が矛盾する入力を fail-closed で拒否する）。
    (input.processMemoryLimitProvenance !== 'unavailable' ||
      input.processMemoryLimitBytes === null) &&
    isThermalState(input.thermalState)
  );
}

/** Size と実測可能な memory ceiling だけから、保守的な 3 段階 Risk を返す。 */
export function evaluateModelResourceRisk(
  input: ModelResourceRiskInput
): ModelResourceRisk {
  if (!resourceInputIsValid(input)) {
    throw new LocalModelLifecycleError(
      'INVALID_RESOURCE_INPUT',
      'Model Resource Risk の入力が不正です。'
    );
  }
  const estimatedWorkingSetBytes =
    Math.ceil(input.modelSizeBytes * 1.2) +
    input.nCtx * CONTEXT_RESERVE_BYTES_PER_TOKEN;
  const effectiveMemoryBytes = observedMemory([
    input.physicalMemoryBytes,
    conservativeProcessMemoryLimitBytes(
      input.processMemoryLimitBytes,
      input.processMemoryLimitProvenance
    ),
  ]);
  const reasons: ModelResourceRiskReason[] = [];
  let level: ModelResourceRiskLevel = 'blocked';
  let ratioPermille: number | null = null;

  if (effectiveMemoryBytes === null) {
    reasons.push('memory-unavailable');
  } else {
    const ratio = estimatedWorkingSetBytes / effectiveMemoryBytes;
    ratioPermille = Math.round(ratio * 1_000);
    if (ratio <= 0.45) {
      level = 'supported';
      reasons.push('memory-ratio-supported');
    } else if (ratio <= 0.6) {
      level = 'caution';
      reasons.push('memory-ratio-caution');
    } else {
      reasons.push('memory-ratio-blocked');
    }
  }

  if (input.thermalState === 'serious' || input.thermalState === 'critical') {
    level = 'blocked';
    reasons.push('thermal-pressure');
  }
  return {
    level,
    effectiveMemoryBytes,
    estimatedWorkingSetBytes,
    ratioPermille,
    reasons,
  };
}

function parseMetadata(value: unknown): GgufMetadata {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['architecture', 'contextLength', 'fileType'])
  ) {
    throw invalidManifest();
  }
  const architecture = value.architecture;
  const contextLength = value.contextLength;
  const fileType = value.fileType;
  if (
    typeof architecture !== 'string' ||
    !ARCHITECTURE_PATTERN.test(architecture) ||
    !positiveSafeInteger(contextLength) ||
    contextLength < 256 ||
    contextLength > 1_048_576 ||
    !(
      fileType === null ||
      (Number.isSafeInteger(fileType) &&
        typeof fileType === 'number' &&
        fileType >= 0 &&
        fileType <= 1_024)
    )
  ) {
    throw invalidManifest();
  }
  return { architecture, contextLength, fileType };
}

function parseRisk(value: unknown): ModelResourceRisk {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'level',
      'effectiveMemoryBytes',
      'estimatedWorkingSetBytes',
      'ratioPermille',
      'reasons',
    ])
  ) {
    throw invalidManifest();
  }
  const level = value.level;
  const effectiveMemoryBytes = nullablePositiveInteger(
    value.effectiveMemoryBytes
  );
  const estimatedWorkingSetBytes = value.estimatedWorkingSetBytes;
  const ratioPermille = value.ratioPermille;
  const reasons = value.reasons;
  if (
    !(level === 'supported' || level === 'caution' || level === 'blocked') ||
    effectiveMemoryBytes === undefined ||
    !positiveSafeInteger(estimatedWorkingSetBytes) ||
    !(
      ratioPermille === null ||
      (Number.isSafeInteger(ratioPermille) &&
        typeof ratioPermille === 'number' &&
        ratioPermille >= 0)
    ) ||
    !Array.isArray(reasons) ||
    reasons.length < 1 ||
    reasons.length > 2 ||
    !reasons.every(isRiskReason) ||
    new Set(reasons).size !== reasons.length
  ) {
    throw invalidManifest();
  }
  return {
    level,
    effectiveMemoryBytes,
    estimatedWorkingSetBytes,
    ratioPermille,
    reasons: [...reasons],
  };
}

function parseConfiguration(
  value: unknown
): ImportedLocalModel['configuration'] {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['nCtx', 'nGpuLayers', 'nPredict'])
  ) {
    throw invalidManifest();
  }
  const nCtx = value.nCtx;
  const nGpuLayers = value.nGpuLayers;
  const nPredict = value.nPredict;
  if (
    !Number.isSafeInteger(nCtx) ||
    typeof nCtx !== 'number' ||
    nCtx < 256 ||
    nCtx > 32_768 ||
    !Number.isSafeInteger(nGpuLayers) ||
    typeof nGpuLayers !== 'number' ||
    nGpuLayers < -1 ||
    nGpuLayers > 1_024 ||
    !Number.isSafeInteger(nPredict) ||
    typeof nPredict !== 'number' ||
    nPredict < 1 ||
    nPredict > 512
  ) {
    throw invalidManifest();
  }
  return { nCtx, nGpuLayers, nPredict };
}

function validFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.toLowerCase().endsWith('.gguf') &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    new TextEncoder().encode(value).byteLength <= MAX_FILE_NAME_BYTES
  );
}

function validPrivateUri(value: unknown, sha256: string): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('file:///') &&
    value.endsWith(`/${sha256}.gguf`) &&
    !value.includes('\0') &&
    !value.includes('?') &&
    !value.includes('#')
  );
}

function parseImportedModel(value: unknown): ImportedLocalModel {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'sha256',
      'originalFileName',
      'privateUri',
      'sizeBytes',
      'importedAt',
      'metadata',
      'risk',
      'configuration',
    ])
  ) {
    throw invalidManifest();
  }
  const sha256 = value.sha256;
  if (
    !isSha256(sha256) ||
    !validFileName(value.originalFileName) ||
    !validPrivateUri(value.privateUri, sha256) ||
    !positiveSafeInteger(value.sizeBytes) ||
    !isIsoInstant(value.importedAt)
  ) {
    throw invalidManifest();
  }
  return {
    sha256,
    originalFileName: value.originalFileName,
    privateUri: value.privateUri,
    sizeBytes: value.sizeBytes,
    importedAt: value.importedAt,
    metadata: parseMetadata(value.metadata),
    risk: parseRisk(value.risk),
    configuration: parseConfiguration(value.configuration),
  };
}

function parseBenchmark(value: unknown): LocalModelBenchmarkReport {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'modelSha256',
      'measuredAt',
      'outcome',
      'importDurationMs',
      'loadDurationMs',
      'firstTokenDurationMs',
      'completionDurationMs',
      'peakProcessMemoryBytes',
      'thermalStateBefore',
      'thermalStateAfter',
      'batteryDeltaPermille',
    ])
  ) {
    throw invalidManifest();
  }
  const importDurationMs = nullableDuration(value.importDurationMs);
  const loadDurationMs = nullableDuration(value.loadDurationMs);
  const firstTokenDurationMs = nullableDuration(value.firstTokenDurationMs);
  const completionDurationMs = nullableDuration(value.completionDurationMs);
  const peakProcessMemoryBytes = nullablePositiveInteger(
    value.peakProcessMemoryBytes
  );
  const batteryDeltaPermille = value.batteryDeltaPermille;
  if (
    value.schemaVersion !== 1 ||
    !isSha256(value.modelSha256) ||
    !isIsoInstant(value.measuredAt) ||
    !(
      value.outcome === 'success' ||
      value.outcome === 'cancelled' ||
      value.outcome === 'failed'
    ) ||
    importDurationMs === undefined ||
    loadDurationMs === undefined ||
    firstTokenDurationMs === undefined ||
    completionDurationMs === undefined ||
    peakProcessMemoryBytes === undefined ||
    !isThermalState(value.thermalStateBefore) ||
    !isThermalState(value.thermalStateAfter) ||
    !(
      batteryDeltaPermille === null ||
      (Number.isSafeInteger(batteryDeltaPermille) &&
        typeof batteryDeltaPermille === 'number' &&
        batteryDeltaPermille >= -1_000 &&
        batteryDeltaPermille <= 1_000)
    )
  ) {
    throw invalidManifest();
  }
  return {
    schemaVersion: 1,
    modelSha256: value.modelSha256,
    measuredAt: value.measuredAt,
    outcome: value.outcome,
    importDurationMs,
    loadDurationMs,
    firstTokenDurationMs,
    completionDurationMs,
    peakProcessMemoryBytes,
    thermalStateBefore: value.thermalStateBefore,
    thermalStateAfter: value.thermalStateAfter,
    batteryDeltaPermille,
  };
}

function validateManifestReferences(
  activeModelSha256: string | null,
  models: readonly ImportedLocalModel[],
  reports: readonly LocalModelBenchmarkReport[]
): void {
  const modelDigests = new Set(models.map((model) => model.sha256));
  const fileNames = new Set(models.map((model) => model.originalFileName));
  if (
    modelDigests.size !== models.length ||
    fileNames.size !== models.length ||
    (activeModelSha256 !== null && !modelDigests.has(activeModelSha256)) ||
    reports.some((report) => !modelDigests.has(report.modelSha256))
  ) {
    throw invalidManifest();
  }
  const reportCounts = new Map<string, number>();
  const reportKeys = new Set<string>();
  for (const report of reports) {
    const count = (reportCounts.get(report.modelSha256) ?? 0) + 1;
    const key = `${report.modelSha256}:${report.measuredAt}`;
    if (count > MAX_REPORTS_PER_MODEL || reportKeys.has(key)) {
      throw invalidManifest();
    }
    reportCounts.set(report.modelSha256, count);
    reportKeys.add(key);
  }
}

export function createEmptyLocalModelManifest(): LocalModelManifest {
  return {
    schemaVersion: 1,
    activeModelSha256: null,
    models: [],
    benchmarkReports: [],
  };
}

/** private JSON も外部値として exact-key schema と参照整合性を検証する。 */
export function parseLocalModelManifest(value: unknown): LocalModelManifest {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'activeModelSha256',
      'models',
      'benchmarkReports',
    ]) ||
    value.schemaVersion !== 1 ||
    !(value.activeModelSha256 === null || isSha256(value.activeModelSha256)) ||
    !Array.isArray(value.models) ||
    value.models.length > MAX_MODELS ||
    !Array.isArray(value.benchmarkReports) ||
    value.benchmarkReports.length > MAX_MODELS * MAX_REPORTS_PER_MODEL
  ) {
    throw invalidManifest();
  }
  const models = value.models.map(parseImportedModel);
  const benchmarkReports = value.benchmarkReports.map(parseBenchmark);
  const activeModelSha256 = value.activeModelSha256;
  validateManifestReferences(activeModelSha256, models, benchmarkReports);
  return {
    schemaVersion: 1,
    activeModelSha256,
    models,
    benchmarkReports,
  };
}

export function serializeLocalModelManifest(
  manifest: LocalModelManifest
): string {
  return JSON.stringify(parseLocalModelManifest(manifest));
}
