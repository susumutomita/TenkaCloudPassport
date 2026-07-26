import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ConversationExampleGenerator,
  ConversationExampleInput,
} from '../domain/conversation-example';
import {
  createConversationExampleFlowController,
  type ConversationExampleFlowController,
  type ConversationExampleViewState,
} from './conversation-example-flow';

export interface ConversationExampleFlow {
  readonly state: ConversationExampleViewState;
  readonly prepare: (input: ConversationExampleInput) => void;
  readonly generate: () => void;
  readonly cancel: () => void;
  readonly hide: () => void;
}

interface ControllerSnapshot {
  readonly controller: ConversationExampleFlowController;
  readonly state: ConversationExampleViewState;
}

/** React lifecycle だけを担当し、非同期状態機械そのものは Pure Controller へ委譲する。 */
export function useConversationExample(
  generator: ConversationExampleGenerator | null
): ConversationExampleFlow {
  const controller = useMemo(
    () => createConversationExampleFlowController(generator),
    [generator]
  );
  const [snapshot, setSnapshot] = useState<ControllerSnapshot>(() => ({
    controller,
    state: controller.getState(),
  }));

  useEffect(() => {
    setSnapshot({ controller, state: controller.getState() });
    const unsubscribe = controller.subscribe((state) => {
      setSnapshot({ controller, state });
    });
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  const prepare = useCallback(
    (input: ConversationExampleInput): void => controller.prepare(input),
    [controller]
  );
  const generate = useCallback((): void => controller.generate(), [controller]);
  const cancel = useCallback((): void => controller.cancel(), [controller]);
  const hide = useCallback((): void => controller.hide(), [controller]);

  return {
    state:
      snapshot.controller === controller
        ? snapshot.state
        : controller.getState(),
    prepare,
    generate,
    cancel,
    hide,
  };
}
