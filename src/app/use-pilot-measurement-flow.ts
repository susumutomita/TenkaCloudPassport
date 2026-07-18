import { useCallback, useState } from 'react';
import type { BackupSharePort } from './backup-share-port';
import {
  type ConversationSelfReport,
  createPilotMeasurementController,
  type PilotMeasurementController,
  type PilotMeasurementView,
  type PilotOutcomeEvent,
} from './pilot-measurement';

export type PilotMeasurementFlow = PilotMeasurementView &
  Omit<PilotMeasurementController, 'view'> & {
    readonly open: () => void;
    readonly close: () => void;
  };

interface UsePilotMeasurementFlowInput {
  readonly sharePort: BackupSharePort;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

export function usePilotMeasurementFlow({
  sharePort,
  onOpen,
  onClose,
}: UsePilotMeasurementFlowInput): PilotMeasurementFlow {
  const [controller] = useState(() =>
    createPilotMeasurementController(sharePort)
  );
  const [, setRevision] = useState(0);
  const renderLatest = useCallback(
    () => setRevision((current) => current + 1),
    []
  );

  const open = useCallback((): void => {
    controller.refreshPreview();
    onOpen();
    renderLatest();
  }, [controller, onOpen, renderLatest]);

  const close = useCallback((): void => {
    onClose();
  }, [onClose]);

  const refreshPreview = useCallback((): void => {
    controller.refreshPreview();
    renderLatest();
  }, [controller, renderLatest]);

  const share = useCallback(async (): Promise<void> => {
    const pending = controller.share();
    renderLatest();
    await pending;
    renderLatest();
  }, [controller, renderLatest]);

  const start = useCallback((): void => {
    controller.start();
    renderLatest();
  }, [controller, renderLatest]);

  const setResearchEnabled = useCallback(
    (enabled: boolean): void => {
      controller.setResearchEnabled(enabled);
      renderLatest();
    },
    [controller, renderLatest]
  );

  const ready = useCallback(
    (monotonicMs: number): void => {
      controller.ready(monotonicMs);
      renderLatest();
    },
    [controller, renderLatest]
  );

  const outcome = useCallback(
    (event: PilotOutcomeEvent): void => {
      controller.outcome(event);
      renderLatest();
    },
    [controller, renderLatest]
  );

  const selfReport = useCallback(
    (answer: ConversationSelfReport): void => {
      controller.selfReport(answer);
      renderLatest();
    },
    [controller, renderLatest]
  );

  const skipSelfReport = useCallback((): void => {
    controller.skipSelfReport();
    renderLatest();
  }, [controller, renderLatest]);

  const abandon = useCallback((): void => {
    controller.abandon();
    renderLatest();
  }, [controller, renderLatest]);

  const reset = useCallback((): void => {
    controller.reset();
    renderLatest();
  }, [controller, renderLatest]);

  return {
    ...controller.view(),
    open,
    close,
    refreshPreview,
    share,
    setResearchEnabled,
    start,
    ready,
    outcome,
    selfReport,
    skipSelfReport,
    abandon,
    reset,
  };
}
