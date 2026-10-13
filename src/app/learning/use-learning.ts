import { useCallback, useEffect, useRef, useState } from 'react';
import { removeCatalog } from '../../domain/learning/catalog-management';
import {
  type Catalog,
  type LearningState,
  type Lesson,
  LIMITS,
  lessonKey,
} from '../../domain/learning/model';
import type {
  CatalogRelease,
  CatalogSource,
} from '../../domain/learning/source';
import { registerSource } from '../../domain/learning/source-registry';
import {
  addCatalog,
  currentProgress,
  startLesson,
} from '../../domain/learning/transitions';
import {
  exportBackup,
  importCatalog,
  restoreBackup,
} from '../../domain/learning/validation';
import { emptyLearningState } from './bundled';
import { fetchCatalog, fetchManifest } from './catalog-download';
import { catalogTransport } from './default-transport';
import type { LearningFilePort } from './file-port';
import { LearningSession, type LearningStorage } from './storage';

export interface LearningSelection {
  readonly catalog: Catalog;
  readonly lesson: Lesson;
}
export function useLearning(storage: LearningStorage, files: LearningFilePort) {
  const download = useRef<AbortController | null>(null);
  const session = useRef<LearningSession | null>(null);
  const operation = useRef(false);
  const alive = useRef(true);
  const [state, setState] = useState<LearningState | null>(null);
  const [selection, setSelection] = useState<LearningSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<LearningState | null>(null);
  const load = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const loaded = await storage.load();
      if (!alive.current) return;
      session.current = new LearningSession(loaded, storage);
      setState(loaded);
      setMessage(null);
    } catch {
      if (alive.current)
        setMessage(
          '保存データを読めませんでした。既存データを変更せず停止しました。 / Could not load saved learning data.'
        );
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }, [storage]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      download.current?.abort();
    };
  }, [load]);
  const revision = session.current?.revision;
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      return true;
    } catch (error: unknown) {
      if (alive.current)
        setMessage(
          error instanceof Error
            ? error.message
            : '処理できませんでした。 / Operation failed.'
        );
      return false;
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function commit(
    change: (current: LearningState) => LearningState
  ): Promise<boolean> {
    const active = session.current;
    if (!active || revision === undefined) return false;
    return run(async () => {
      await active.commit(revision, change);
      if (alive.current) setState(active.state);
    });
  }
  async function open(catalog: Catalog, lesson: Lesson) {
    const sessionID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const current = state && currentProgress(state, catalog, lesson);
    if (current) {
      setSelection({ catalog, lesson });
      return;
    }
    if (
      await commit((data) =>
        startLesson(data, lessonKey(catalog, lesson), sessionID)
      )
    )
      setSelection({ catalog, lesson });
  }
  async function pick(kind: 'catalog' | 'backup') {
    if (!state && kind !== 'backup') return;
    await run(async () => {
      const raw = await files.pick(
        kind === 'backup' ? LIMITS.backupBytes : 3_000_000
      );
      if (raw === null) return;
      const proposed =
        kind === 'backup'
          ? restoreBackup(raw, state?.catalogs ?? [])
          : addCatalog(state ?? emptyLearningState(), importCatalog(raw));
      if (alive.current) setPending(proposed);
    });
  }
  async function exportFile() {
    if (!state) return;
    await run(async () => {
      const outcome = await files.exportJSON(exportBackup(state));
      if (alive.current)
        setMessage(
          outcome === 'dismissed'
            ? '共有をキャンセルしました。 / Cancelled.'
            : 'JSON を共有先へ渡しました。保存先でファイルを確認してください。 / Check the file at the destination.'
        );
    });
  }
  async function apply() {
    if (!pending) return;
    const active =
      session.current ?? new LearningSession(emptyLearningState(), storage);
    const expected = active.revision;
    const succeeded = await run(async () => {
      await active.commit(expected, () => pending);
      session.current = active;
      if (alive.current) setState(active.state);
    });
    if (succeeded && alive.current) {
      setSelection(null);
      setPending(null);
      setMessage('保存しました。 / Saved.');
    }
  }
  async function retrieve(
    sourceURL: string,
    source?: CatalogSource,
    release?: CatalogRelease
  ) {
    const active = session.current;
    if (!active || revision === undefined) return;
    await run(async () => {
      const controller = new AbortController();
      download.current = controller;
      try {
        let next: LearningState;
        if (source && release) {
          const catalog = await fetchCatalog(
            catalogTransport,
            source,
            release,
            controller.signal
          );
          next = addCatalog(active.state, catalog);
        } else {
          const registered = await fetchManifest(
            catalogTransport,
            sourceURL,
            controller.signal
          );
          next = registerSource(active.state, registered);
        }
        if (controller.signal.aborted) throw new Error('取得を中断しました。');
        await active.commit(revision, () => next);
        if (alive.current) {
          setState(active.state);
          setSelection(null);
          setMessage('取得・保存しました。オフラインで利用できます。');
        }
      } finally {
        download.current = null;
      }
    });
  }
  function cancelDownload() {
    download.current?.abort();
  }
  function prepareRemoval(catalog: Catalog) {
    if (state) setPending(removeCatalog(state, catalog));
  }
  return {
    state,
    selection,
    setSelection,
    busy,
    message,
    pending,
    setPending,
    load,
    commit,
    open,
    pick,
    exportFile,
    apply,
    prepareRemoval,
    retrieve,
    cancelDownload,
  };
}
