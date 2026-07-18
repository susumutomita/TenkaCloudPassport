import { describe, expect, it } from 'bun:test';
import type {
  ImportedLocalModel,
  LocalModelManifest,
} from '../local-agent/local-model-manifest';
import {
  createLocalModelLifecycleStorageAdapter,
  localModelInstallationFromManifest,
} from './local-model-lifecycle-storage-adapter';

function importedModel(
  digestCharacter: string,
  architecture: string,
  sizeBytes: number
): ImportedLocalModel {
  const sha256 = digestCharacter.repeat(64);
  return {
    sha256,
    originalFileName: `${digestCharacter}.gguf`,
    privateUri: `file:///private/${sha256}.gguf`,
    sizeBytes,
    importedAt: '2026-07-19T00:00:00.000Z',
    metadata: { architecture, contextLength: 2_048, fileType: 2 },
    risk: {
      level: 'supported',
      effectiveMemoryBytes: 8_000,
      estimatedWorkingSetBytes: 2_000,
      ratioPermille: 250,
      reasons: ['memory-ratio-supported'],
    },
    configuration: { nCtx: 2_048, nGpuLayers: 0, nPredict: 96 },
  };
}

function manifest(
  models: readonly ImportedLocalModel[],
  activeModelSha256: string | null
): LocalModelManifest {
  return {
    schemaVersion: 1,
    activeModelSha256,
    models,
    benchmarkReports: [],
  };
}

describe('GGUF Lifecycle と Local Data Control の Adapter', () => {
  it('全 Model の実件数と合計 Sizeを保ち、active Model だけを診断代表値にする', () => {
    const first = importedModel('a', 'llama', 1_000);
    const active = importedModel('b', 'qwen', 2_000);

    expect(
      localModelInstallationFromManifest(
        manifest([first, active], active.sha256)
      )
    ).toEqual({
      architecture: 'qwen',
      sizeBytes: 3_000,
      digest: active.sha256,
      count: 2,
    });
  });

  it('active が無ければ先頭を代表値にし、未知 Architecture は unknown へ閉じる', () => {
    const model = importedModel('c', 'future-architecture', 3_000);

    expect(localModelInstallationFromManifest(manifest([model], null))).toEqual(
      {
        architecture: 'unknown',
        sizeBytes: 3_000,
        digest: model.sha256,
        count: 1,
      }
    );
    expect(localModelInstallationFromManifest(manifest([], null))).toBeNull();
  });

  it('Storage Port は Preview に Manifest を使い、削除は壊れた Manifest を信用せず purge する', async () => {
    const first = importedModel('f', 'llama', 1_000);
    const second = importedModel('1', 'phi', 2_000);
    let current = manifest([first, second], second.sha256);
    let manifestCorrupt = false;
    let purgeCalls = 0;
    const storage = createLocalModelLifecycleStorageAdapter(
      {
        async load() {
          if (manifestCorrupt) throw new Error('manifest corrupt');
          return current;
        },
        async purgeManagedStore() {
          purgeCalls += 1;
          manifestCorrupt = false;
          current = manifest([], null);
        },
      },
      {
        async inspectManagedModelFiles() {
          return manifestCorrupt
            ? {
                count: 2,
                totalBytes: 3_000,
                representativeDigest: second.sha256,
                hasFinalOrStagedModel: true,
                hasManagedStore: true,
              }
            : {
                count: 0,
                totalBytes: 0,
                representativeDigest: null,
                hasFinalOrStagedModel: false,
                hasManagedStore: false,
              };
        },
      }
    );

    expect(await storage.inspect()).toEqual({
      architecture: 'phi',
      sizeBytes: 3_000,
      digest: second.sha256,
      count: 2,
    });
    manifestCorrupt = true;
    expect(await storage.inspect()).toEqual({
      architecture: 'unknown',
      sizeBytes: 3_000,
      digest: second.sha256,
      count: 2,
    });
    await storage.remove();
    expect(purgeCalls).toBe(1);
    expect(await storage.inspect()).toBeNull();
  });

  it('GGUF payload が 0 件でも壊れた Manifest は Model 件数を増やさず purge 対象に残す', async () => {
    let purgeCalls = 0;
    const storage = createLocalModelLifecycleStorageAdapter(
      {
        async load() {
          throw new Error('manifest corrupt');
        },
        async purgeManagedStore() {
          purgeCalls += 1;
        },
      },
      {
        async inspectManagedModelFiles() {
          return {
            count: 0,
            totalBytes: 0,
            representativeDigest: null,
            hasFinalOrStagedModel: false,
            hasManagedStore: true,
          };
        },
      }
    );

    expect(await storage.inspect()).toEqual({
      architecture: 'unknown',
      sizeBytes: 0,
      digest: '0'.repeat(64),
      count: 0,
    });
    await storage.remove();
    expect(purgeCalls).toBe(1);
  });

  it('空 Manifest の load が成功しても temp だけの managed store を purge 対象に残す', async () => {
    const storage = createLocalModelLifecycleStorageAdapter(
      {
        async load() {
          return manifest([], null);
        },
        async purgeManagedStore() {
          // inspect 専用の検証であり、purge は呼ばれない。
        },
      },
      {
        async inspectManagedModelFiles() {
          return {
            count: 0,
            totalBytes: 0,
            representativeDigest: null,
            hasFinalOrStagedModel: false,
            hasManagedStore: true,
          };
        },
      }
    );

    expect(await storage.inspect()).toEqual({
      architecture: 'unknown',
      sizeBytes: 0,
      digest: '0'.repeat(64),
      count: 0,
    });
  });
});
