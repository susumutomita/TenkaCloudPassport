import type { LocalModelManifest } from '../local-agent/local-model-manifest';
import type {
  LocalModelFileStore,
  LocalModelLifecycle,
  ManagedModelStoreInspection,
} from '../local-agent/model-lifecycle';
import type { DiagnosticModelArchitecture } from './diagnostic-report';
import type {
  LocalModelInstallation,
  LocalModelStoragePort,
} from './local-data-control';

type StorageLifecycle = Pick<LocalModelLifecycle, 'load' | 'purgeManagedStore'>;
type ManagedFileInspector = Pick<
  LocalModelFileStore,
  'inspectManagedModelFiles'
>;

const DIAGNOSTIC_ARCHITECTURES: ReadonlySet<string> = new Set([
  'llama',
  'qwen',
  'gemma',
  'phi',
]);

function diagnosticArchitecture(value: string): DiagnosticModelArchitecture {
  return DIAGNOSTIC_ARCHITECTURES.has(value)
    ? (value as DiagnosticModelArchitecture)
    : 'unknown';
}

/** Manifest の実件数と合計 Size を保ち、内容非保持 Report 用の代表 Model だけを返す。 */
export function localModelInstallationFromManifest(
  manifest: LocalModelManifest
): LocalModelInstallation | null {
  if (manifest.models.length === 0) return null;
  const representative =
    manifest.models.find(
      (model) => model.sha256 === manifest.activeModelSha256
    ) ?? manifest.models[0];
  if (!representative) return null;
  return {
    architecture: diagnosticArchitecture(representative.metadata.architecture),
    sizeBytes: manifest.models.reduce(
      (total, model) => total + model.sizeBytes,
      0
    ),
    digest: representative.sha256,
    count: manifest.models.length,
  };
}

const UNKNOWN_MANAGED_MODEL_DIGEST = '0'.repeat(64);

function fallbackInstallation(
  inspection: ManagedModelStoreInspection
): LocalModelInstallation | null {
  if (!inspection.hasManagedStore) return null;
  return {
    architecture: 'unknown',
    sizeBytes: inspection.totalBytes,
    digest: inspection.representativeDigest ?? UNKNOWN_MANAGED_MODEL_DIGEST,
    count: inspection.count,
  };
}

/** LocalDataControl の排他的 lease 内で Manifest を信用せず managed store を fail-safe purge する。 */
export function createLocalModelLifecycleStorageAdapter(
  lifecycle: StorageLifecycle,
  managedFiles: ManagedFileInspector
): LocalModelStoragePort {
  return {
    async inspect() {
      try {
        const installation = localModelInstallationFromManifest(
          await lifecycle.load()
        );
        if (installation) return installation;
      } catch {
        // 壊れた Manifest も exact managed filename の列挙結果へ閉じる。
      }
      return fallbackInstallation(
        await managedFiles.inspectManagedModelFiles()
      );
    },
    async remove() {
      await lifecycle.purgeManagedStore();
    },
  };
}
