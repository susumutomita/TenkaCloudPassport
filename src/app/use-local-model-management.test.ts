import { describe, expect, it } from 'bun:test';
import type { ImportedLocalModel } from '../local-agent/local-model-manifest';
import {
  type ActivationAssessment,
  ModelLifecycleError,
} from '../local-agent/model-lifecycle';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';
import {
  LocalDataAccessBlockedError,
  LocalModelContextLeaseRegistry,
} from './local-data-control';
import {
  confirmLocalModelCaution,
  createLocalModelOperationLane,
  importLocalModelCandidate,
  performLocalModelActivation,
  withLocalModelMutationLease,
} from './local-model-management-controller';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-local-model-management.ts');
}

const MODEL: ImportedLocalModel = {
  sha256: 'a'.repeat(64),
  originalFileName: 'local.gguf',
  privateUri: `file:///private/local-models/${'a'.repeat(64)}.gguf`,
  sizeBytes: 1_000_000,
  importedAt: '2026-07-18T00:00:00.000Z',
  metadata: { architecture: 'llama', contextLength: 4_096, fileType: 2 },
  risk: {
    level: 'supported',
    effectiveMemoryBytes: 4_000_000_000,
    estimatedWorkingSetBytes: 800_000_000,
    ratioPermille: 200,
    reasons: ['memory-ratio-supported'],
  },
  configuration: { nCtx: 2_048, nGpuLayers: 0, nPredict: 96 },
};

function assessment(level: 'supported' | 'caution' | 'blocked') {
  const risk = {
    ...MODEL.risk,
    level,
    reasons:
      level === 'supported'
        ? (['memory-ratio-supported'] as const)
        : level === 'caution'
          ? (['memory-ratio-caution'] as const)
          : (['memory-ratio-blocked'] as const),
  };
  return {
    model: { ...MODEL, risk },
    risk,
    cautionConfirmationKey: level === 'caution' ? 'current-risk-key' : null,
  } satisfies ActivationAssessment;
}

describe('Local Model 管理 Hook の Owner 操作契約', () => {
  it('同じ render 内の二重操作を同期的に拒否し、dispose 後は state callback を呼ばない', async () => {
    let releaseFirst: (() => void) | undefined;
    let finishFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const events: string[] = [];
    const lane = createLocalModelOperationLane({
      onStart: () => events.push('start'),
      onError: () => events.push('error'),
      onFinish: () => {
        events.push('finish');
        finishFirst?.();
      },
    });

    expect(lane.run(() => first)).toBe(true);
    expect(lane.isPending()).toBeTrue();
    expect(lane.run(async () => undefined)).toBe(false);
    releaseFirst?.();
    await finished;
    expect(lane.isPending()).toBeFalse();
    expect(events).toEqual(['start', 'finish']);

    let releaseDisposed: (() => void) | undefined;
    const disposedOperation = new Promise<void>((resolve) => {
      releaseDisposed = resolve;
    });
    expect(lane.run(() => disposedOperation)).toBe(true);
    lane.dispose();
    releaseDisposed?.();
    await disposedOperation;
    await Promise.resolve();
    expect(events).toEqual(['start', 'finish', 'start']);

    const errorEvents: string[] = [];
    let finishRejected: (() => void) | undefined;
    const rejectedFinished = new Promise<void>((resolve) => {
      finishRejected = resolve;
    });
    const errorLane = createLocalModelOperationLane({
      onStart: () => errorEvents.push('start'),
      onError: () => errorEvents.push('error'),
      onFinish: () => {
        errorEvents.push('finish');
        finishRejected?.();
      },
    });
    expect(
      errorLane.run(async () => {
        throw new Error('operation failed');
      })
    ).toBe(true);
    await rejectedFinished;
    expect(errorEvents).toEqual(['start', 'error', 'finish']);
  });

  it('Process mutation lease を取得できない場合は lifecycle mutation を開始しない', async () => {
    let mutationCalls = 0;

    await expect(
      withLocalModelMutationLease(
        {
          acquireMutation() {
            throw new ModelLifecycleError(
              'NATIVE_CONTEXT_UNAVAILABLE',
              'restart required'
            );
          },
        },
        async () => {
          mutationCalls += 1;
        }
      )
    ).rejects.toMatchObject({ code: 'NATIVE_CONTEXT_UNAVAILABLE' });
    expect(mutationCalls).toBe(0);

    let releases = 0;
    const mutationLeases = {
      acquireMutation() {
        return { release: () => (releases += 1) };
      },
    };
    expect(
      await withLocalModelMutationLease(mutationLeases, async () => 'done')
    ).toBe('done');
    await expect(
      withLocalModelMutationLease(mutationLeases, async () => {
        throw new Error('mutation failed');
      })
    ).rejects.toThrow('mutation failed');
    expect(releases).toBe(2);
  });

  it('実 Registry の Context・全削除・Recovery lock は Import を lifecycle 呼出前に拒否する', async () => {
    const candidate = {
      name: MODEL.originalFileName,
      uri: 'content://selected/local.gguf',
      sizeBytes: MODEL.sizeBytes,
    };
    let importCalls = 0;
    const attemptImport = (
      contexts: LocalModelContextLeaseRegistry
    ): Promise<ImportedLocalModel> =>
      withLocalModelMutationLease(contexts, () =>
        importLocalModelCandidate({
          lifecycle: {
            async importCandidate() {
              importCalls += 1;
              return MODEL;
            },
          },
          candidate,
          signal: new AbortController().signal,
          refresh: async () => undefined,
          onImported: () => undefined,
        })
      );

    const activeContexts = new LocalModelContextLeaseRegistry(false);
    const activeContext = activeContexts.acquire();
    await expect(attemptImport(activeContexts)).rejects.toBeInstanceOf(
      LocalDataAccessBlockedError
    );
    activeContext.release();

    const deletingContexts = new LocalModelContextLeaseRegistry(false);
    const deletion = deletingContexts.tryAcquireExclusive();
    expect(deletion.kind).toBe('acquired');
    if (deletion.kind !== 'acquired')
      throw new Error('exclusive lease required');
    await expect(attemptImport(deletingContexts)).rejects.toBeInstanceOf(
      LocalDataAccessBlockedError
    );
    deletion.lease.release();

    const recoveryLockedContexts = new LocalModelContextLeaseRegistry();
    await expect(attemptImport(recoveryLockedContexts)).rejects.toBeInstanceOf(
      LocalDataAccessBlockedError
    );
    expect(importCalls).toBe(0);

    expect(await attemptImport(activeContexts)).toBe(MODEL);
    expect(importCalls).toBe(1);
  });

  it('Risk assessment の supported / caution / blocked を実行し、永続化後の表示 refresh を必ず行う', async () => {
    for (const level of ['supported', 'caution', 'blocked'] as const) {
      const current = assessment(level);
      const events: string[] = [];
      const lifecycle = {
        assessActivation: async () => {
          events.push('assess');
          return current;
        },
        activate: async () => {
          events.push('activate');
          return current.model;
        },
      };
      const operation = performLocalModelActivation({
        lifecycle,
        sha256: MODEL.sha256,
        refresh: async () => {
          events.push('refresh');
        },
        setCautionAssessment: (value) =>
          events.push(value ? 'show-caution' : 'clear-caution'),
      });

      if (level === 'blocked') {
        expect(
          await operation.catch((error: unknown) =>
            error instanceof ModelLifecycleError ? error.code : 'unexpected'
          )
        ).toBe('RESOURCE_BLOCKED');
        expect(events).toEqual(['assess', 'refresh']);
      } else if (level === 'caution') {
        await operation;
        expect(events).toEqual(['assess', 'refresh', 'show-caution']);
      } else {
        await operation;
        expect(events).toEqual([
          'assess',
          'refresh',
          'activate',
          'clear-caution',
          'refresh',
        ]);
      }
    }
  });

  it('Activate / Caution Confirm の失敗後も最新 Risk を refresh してから型付き失敗を返す', async () => {
    const current = assessment('supported');
    let refreshCalls = 0;
    const failure = new ModelLifecycleError(
      'MODEL_INTEGRITY_FAILED',
      'digest changed'
    );
    const lifecycle = {
      assessActivation: async () => current,
      activate: async () => {
        throw failure;
      },
    };
    await expect(
      performLocalModelActivation({
        lifecycle,
        sha256: MODEL.sha256,
        refresh: async () => {
          refreshCalls += 1;
        },
        setCautionAssessment: () => undefined,
      })
    ).rejects.toBe(failure);
    expect(refreshCalls).toBe(2);

    refreshCalls = 0;
    await expect(
      confirmLocalModelCaution({
        lifecycle,
        assessment: assessment('caution'),
        refresh: async () => {
          refreshCalls += 1;
        },
        setCautionAssessment: () => undefined,
      })
    ).rejects.toBe(failure);
    expect(refreshCalls).toBe(1);

    const caution = assessment('caution');
    const cleared: (ActivationAssessment | null)[] = [];
    const confirmed = await confirmLocalModelCaution({
      lifecycle: {
        assessActivation: async () => caution,
        activate: async () => caution.model,
      },
      assessment: caution,
      refresh: async () => {
        refreshCalls += 1;
      },
      setCautionAssessment: (value) => cleared.push(value),
    });
    expect(confirmed).toBe(caution.model);
    expect(cleared).toEqual([null]);
    expect(refreshCalls).toBe(2);
  });

  it('Owner が確定した候補だけを AbortSignal 付きで Import し、実行中と unmount の Cancel を伝播する', async () => {
    const text = await source();
    const importStart = text.indexOf('const performImport');
    const confirmStart = text.indexOf('const confirmImport', importStart);
    const importBody = text.slice(importStart, confirmStart);

    expectInOrder(importBody, [
      'const controller = new AbortController()',
      'await waitForNativeTeardown()',
      'withLocalModelMutationLease(mutationLeases',
      'importLocalModelCandidate({',
      'signal: controller.signal',
      'onImported: () => {',
      'setCandidate(null)',
      'setCandidateAvailableStorageBytes(null)',
    ]);
    expect(text).toContain('if (started)');
    expect(text).toContain('setImportInProgress(true)');
    expect(text).toContain('importControllerRef.current?.abort()');
    expect(text).toContain('operationLaneRef.current.dispose()');
    expect(text).toContain('setImportInProgress(false)');
    expect(text).toContain(
      "setPendingProviderOperation({ kind: 'import', candidate })"
    );
  });

  it('Import 成功は表示を更新し、失敗は即時 reconcile を試みても元の型付き Error を維持する', async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const imported = await importLocalModelCandidate({
      lifecycle: {
        importCandidate: async (_candidate, signal) => {
          expect(signal).toBe(controller.signal);
          events.push('import');
          return MODEL;
        },
      },
      candidate: {
        name: MODEL.originalFileName,
        uri: 'content://selected/local.gguf',
        sizeBytes: MODEL.sizeBytes,
      },
      signal: controller.signal,
      refresh: async () => {
        events.push('refresh');
      },
      onImported: () => events.push('clear-candidate'),
    });
    expect(imported).toBe(MODEL);
    expect(events).toEqual(['import', 'clear-candidate', 'refresh']);

    for (const refreshFails of [false, true]) {
      const failure = new ModelLifecycleError(
        'MANIFEST_WRITE_FAILED',
        'ambiguous commit result'
      );
      let refreshCalls = 0;
      const failed = importLocalModelCandidate({
        lifecycle: {
          importCandidate: async () => {
            throw failure;
          },
        },
        candidate: {
          name: MODEL.originalFileName,
          uri: 'content://selected/local.gguf',
          sizeBytes: MODEL.sizeBytes,
        },
        signal: controller.signal,
        refresh: async () => {
          refreshCalls += 1;
          if (refreshFails) throw new Error('reconcile still unavailable');
        },
        onImported: () => {
          throw new Error('failed Import must not clear its candidate');
        },
      });
      await expect(failed).rejects.toBe(failure);
      expect(refreshCalls).toBe(1);
    }
  });

  it('実行中 Provider に影響する全 Model mutation は確認待ちにし、teardown 後の process lease 内だけで実行する', async () => {
    const text = await source();
    const confirmation = text.slice(
      text.indexOf('const confirmProviderOperation')
    );

    expect(text).toContain('if (hasActiveProviderRun)');
    expect(text).toContain(
      "setPendingProviderOperation({ kind: 'confirm-caution' })"
    );
    expectInOrder(confirmation, [
      'const pending = pendingProviderOperation',
      'setPendingProviderOperation(null)',
      'performActivation(pending.sha256)',
    ]);
    expect(text).toContain('waitForNativeTeardown,');
    expect(text).toContain(
      'withLocalModelMutationLease(mutationLeases, async () => {'
    );
    expect(text).toContain(
      'management.lifecycle.deleteModel(sha256, async () => undefined)'
    );
    expect(text).toContain(
      'withLocalModelMutationLease(mutationLeases, () =>\n        management.lifecycle.load()'
    );
    expect(text).toContain(
      'run(() => withLocalModelMutationLease(mutationLeases, refresh))'
    );
    expect(text).toContain(
      'management.lifecycle.assessImportCandidate(selected)'
    );
  });

  it('初回 load も単一 operation lane に入り、候補変更は古い Import 確認 intent を失効する', async () => {
    const text = await source();
    const initialLoad = text.slice(
      text.indexOf('useEffect(() => {\n    let active = true'),
      text.indexOf('const reload = useCallback')
    );

    expectInOrder(initialLoad, [
      'run(async () => {',
      'withLocalModelMutationLease(mutationLeases',
      'management.lifecycle.load()',
      'setManifest(loaded)',
      'configureProvider(loaded)',
    ]);
    expect(text).toContain("pending?.kind === 'import' ? null : pending");
    expectInOrder(text.slice(text.indexOf('cancelCandidate:')), [
      'clearPendingImport()',
      'setCandidate(null)',
    ]);
    expectInOrder(text.slice(text.indexOf('const selectCandidate')), [
      'if (hasActiveProviderRun) return',
      'clearPendingImport()',
      'management.pickCandidate()',
    ]);
    expect(text).toContain('candidateSelectionBlocked: hasActiveProviderRun');
  });
});
