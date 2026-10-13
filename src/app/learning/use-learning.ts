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
import { createRoundId } from '../../domain/session-identifiers';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import { emptyLearningState } from './bundled';
import { fetchCatalog, fetchManifest } from './catalog-download';
import { catalogTransport } from './default-transport';
import { downloadCurrentCatalog } from './download-current-catalog';
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
  const [messageKind, setMessageKind] = useState<'error' | 'notice'>('notice');
  const [message, setMessage] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    url: string;
    phase: 'manifest' | 'catalog' | 'saving';
  } | null>(null);
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
      setMessageKind('error');
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
    setMessageKind('notice');
    try {
      await action();
      return true;
    } catch (error: unknown) {
      setMessageKind('error');
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
    const current = state && currentProgress(state, catalog, lesson);
    if (current) {
      setSelection({ catalog, lesson });
      return;
    }
    if (
      await commit((data) =>
        startLesson(
          data,
          lessonKey(catalog, lesson),
          createRoundId(webCryptoRandomBytes)
        )
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
          setMessage(
            source && release
              ? '教材を保存しました。オフラインで利用できます。'
              : '教材の版一覧を更新しました。教材本体はまだダウンロードしていません。'
          );
        }
      } finally {
        download.current = null;
      }
    });
  }
  async function downloadLatest(sourceURL: string) {
    const active = session.current;
    if (!active || revision === undefined) return false;
    return run(async () => {
      const controller = new AbortController();
      download.current = controller;
      const reportPhase = (phase: 'manifest' | 'catalog' | 'saving' | null) => {
        if (alive.current)
          setDownloadStatus(phase ? { url: sourceURL, phase } : null);
      };
      reportPhase('manifest');
      try {
        const next = await downloadCurrentCatalog(
          catalogTransport,
          active.state,
          sourceURL,
          controller.signal,
          () => reportPhase('catalog')
        );
        if (controller.signal.aborted)
          throw new Error('ダウンロードを中断しました。');
        reportPhase('saving');
        await active.commit(revision, () => next);
        if (alive.current) {
          setState(active.state);
          setMessage(
            '教材を保存しました。下の「学習を始める」から開けます。オフラインでも使えます。 / Saved for offline practice.'
          );
        }
      } catch (error: unknown) {
        throw new Error(
          controller.signal.aborted
            ? 'ダウンロードを中断しました。保存済みの教材と進捗はそのままです。 / Download cancelled.'
            : `ダウンロードできませんでした。通信を確認して、もう一度お試しください。保存済みの教材と進捗はそのままです。 / Download failed; retry when connected. ${readableDownloadError(error)}`
        );
      } finally {
        download.current = null;
        reportPhase(null);
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
    messageKind,
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
    downloadLatest,
    downloadStatus,
    cancelDownload,
  };
}

function readableDownloadError(error: unknown): string {
  return error instanceof Error ? error.message : '';
}
