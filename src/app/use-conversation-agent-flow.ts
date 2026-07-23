import { useCallback, useRef, useState } from 'react';
import type { AgentModelProvider } from '../domain/agent-model-provider';
import {
  buildConversationAgentModelInput,
  selectConversationBridge,
} from '../domain/conversation-agent-evidence';
import {
  addConversationSessionPeer,
  type ConversationSession,
  clearConversationSessionPeers,
  createConversationSession,
  removeConversationSessionPeer,
} from '../domain/conversation-session';
import type { IntroCard } from '../domain/intro-card';
import { INTERACTION_DEADLINE_MS } from '../domain/pet-interaction';
import {
  createParticipantId,
  type ParticipantId,
} from '../domain/session-identifiers';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import type { ConversationAgentPeerView } from '../screens/ConversationAgentScreen';
import {
  type AgentProviderSessionRunner,
  INITIAL_PROVIDER_RUNTIME_STATE,
} from './agent-provider-session';
import {
  CONVERSATION_AGENT_SAMPLE_PEER_CARD,
  type ConversationAgentResultState,
  decodeConversationAgentPeerCard,
  INITIAL_CONVERSATION_AGENT_RESULT,
} from './conversation-agent-flow';
import type { Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import type { QrScannerPort } from './qr-scanner-port';
import { readableError } from './readable-error';

/**
 * Issue 104 / ADR-0036: 端末内会話エージェント（Step A）の state・handler を
 * `PassportApp.tsx` 本体から切り出す custom hook。`use-pilot-measurement-flow.ts` /
 * `use-local-diagnostics-flow.ts` と同じ「複雑な flow を hook へ集約し、
 * `PassportApp` の Cognitive Complexity を抑える」既存方針をそのまま踏襲する。
 * `providerRunner`・`provider`（Rules / Local Agent）は Pet Interaction と同じ
 * 共有 instance を呼び出し側からそのまま受け取り、新しい instance は作らない。
 */
export interface UseConversationAgentFlowInput {
  readonly locale: Locale;
  readonly qrScannerPort: QrScannerPort;
  readonly providerRunner: AgentProviderSessionRunner;
  readonly provider: AgentModelProvider;
  /** Settings 画面から本機能へ遷移する（stage 遷移自体は呼び出し側が持つ）。 */
  readonly onNavigateToConversationAgent: () => void;
  /** 本機能から Settings 画面へ戻る（stage 遷移自体は呼び出し側が持つ）。 */
  readonly onNavigateToSettings: () => void;
}

export interface ConversationAgentFlow {
  readonly hasSelfIntroCard: boolean;
  readonly peers: readonly ConversationAgentPeerView[];
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  readonly result: ConversationAgentResultState;
  readonly onChangePasteInput: (value: string) => void;
  readonly onSubmitPasteInput: () => void;
  readonly onScanPeer: () => void;
  readonly onUseSampleCard: () => void;
  readonly onRemovePeer: (participantId: ParticipantId) => void;
  readonly onStart: () => void;
  readonly onReset: () => void;
  /** Settings からこの機能を開く。`introCard` が無ければ Notice だけを表示する。 */
  readonly open: (introCard: IntroCard | null) => void;
  /** 画面を離れる。受信済みの相手カードを含むセッションを即時に破棄する。 */
  readonly close: () => void;
}

export function useConversationAgentFlow({
  locale,
  qrScannerPort,
  providerRunner,
  provider,
  onNavigateToConversationAgent,
  onNavigateToSettings,
}: UseConversationAgentFlowInput): ConversationAgentFlow {
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [pasteInput, setPasteInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ConversationAgentResultState>(
    INITIAL_CONVERSATION_AGENT_RESULT
  );
  // Provider 呼出しは非同期のため、セッションが破棄・やり直された後に届く
  // 遅延完了が古い結果を上書きしないための世代キー。
  const runKeyRef = useRef<string | null>(null);

  /**
   * code-reviewer 指摘（major）: `runKeyRef` を `null` へ戻すだけでは
   * `providerRunner.run(...)`（Native Lane を直列に占有する非同期実行）自体は
   * 止まらない。Pet Interaction 側（`PassportApp.tsx` の `cancelActiveProvider`）
   * と同じく、状態をリセットする全経路（`open` / `close` / `onReset` /
   * `onRemovePeer`）で必ず `providerRunner.forget(...)` を呼び、実行中なら
   * Cancel、確定済みなら Ledger 上のエントリを破棄する。
   */
  const forgetActiveRun = useCallback((): void => {
    const activeEncounterKey = runKeyRef.current;
    runKeyRef.current = null;
    if (activeEncounterKey) providerRunner.forget(activeEncounterKey);
  }, [providerRunner]);

  const resetTransientState = useCallback((): void => {
    setPasteInput('');
    setErrorMessage(null);
    setResult(INITIAL_CONVERSATION_AGENT_RESULT);
    forgetActiveRun();
  }, [forgetActiveRun]);

  const open = useCallback(
    (introCard: IntroCard | null): void => {
      setSession(
        introCard
          ? createConversationSession({
              participantId: createParticipantId(webCryptoRandomBytes),
              introCard,
            })
          : null
      );
      resetTransientState();
      onNavigateToConversationAgent();
    },
    [onNavigateToConversationAgent, resetTransientState]
  );

  const close = useCallback((): void => {
    setSession(null);
    resetTransientState();
    onNavigateToSettings();
  }, [onNavigateToSettings, resetTransientState]);

  const addPeer = useCallback(
    (card: IntroCard): void => {
      setSession((current) => {
        if (!current) return current;
        // code-reviewer 指摘（blocker）: Step A は自分 + 相手 1 名限定の UI
        // であり、画面（`ConversationAgentScreen.tsx`）は相手が 1 名でも
        // 入ると取り込み導線（スキャン・貼り付け・サンプル）自体を隠す。
        // だが `onScanPeer` の Promise は非同期で、解決前に貼り付け/サンプルが
        // 先に成立すると、後から解決した scan がこのガード無しでは見えない
        // 2 人目を静かに追加してしまう（`onRemovePeer` は `peers[0]` の ID しか
        // 渡せないため、その 2 人目は個別に消せなくなる）。既に 1 名いる場合は
        // 追加を拒否する。
        if (current.peers.length > 0) return current;
        try {
          const next = addConversationSessionPeer(current, {
            participantId: createParticipantId(webCryptoRandomBytes),
            introCard: card,
          });
          setPasteInput('');
          setErrorMessage(null);
          setResult(INITIAL_CONVERSATION_AGENT_RESULT);
          return next;
        } catch (error: unknown) {
          setErrorMessage(
            readableError(
              error,
              MESSAGES[locale].conversationAgent.runErrorMessage
            )
          );
          return current;
        }
      });
    },
    [locale]
  );

  const onSubmitPasteInput = useCallback((): void => {
    if (pasteInput.trim().length === 0) return;
    try {
      addPeer(decodeConversationAgentPeerCard(pasteInput));
    } catch (error: unknown) {
      setErrorMessage(
        readableError(error, MESSAGES[locale].conversationAgent.runErrorMessage)
      );
    }
  }, [addPeer, locale, pasteInput]);

  /**
   * 既存の `qrScannerPort`（Lounge Invite と同じ M1 in-process Port）をそのまま
   * 再利用する。将来 M3 が実カメラへ差し替えても、この呼び出し（Port の
   * `scan()` を呼び、生文字列を渡すだけ）は変えずに済む
   * （`qr-scanner-port.ts` の architect guidance と同じ原則）。
   */
  const onScanPeer = useCallback((): void => {
    void qrScannerPort.scan().then(
      (raw) => {
        try {
          addPeer(decodeConversationAgentPeerCard(raw));
        } catch (error: unknown) {
          setErrorMessage(
            readableError(
              error,
              MESSAGES[locale].conversationAgent.runErrorMessage
            )
          );
        }
      },
      (error: unknown) => {
        setErrorMessage(
          readableError(
            error,
            MESSAGES[locale].conversationAgent.runErrorMessage
          )
        );
      }
    );
  }, [addPeer, locale, qrScannerPort]);

  /** 設計文書「審査官が単独で試せる審査戦略」: QR・URL 往復を経ないテスト専用の内部経路。 */
  const onUseSampleCard = useCallback((): void => {
    addPeer(CONVERSATION_AGENT_SAMPLE_PEER_CARD);
  }, [addPeer]);

  const onRemovePeer = useCallback(
    (participantId: ParticipantId): void => {
      setSession((current) =>
        current
          ? removeConversationSessionPeer(current, participantId)
          : current
      );
      setResult(INITIAL_CONVERSATION_AGENT_RESULT);
      forgetActiveRun();
    },
    [forgetActiveRun]
  );

  const onReset = useCallback((): void => {
    setSession((current) =>
      current ? clearConversationSessionPeers(current) : current
    );
    setPasteInput('');
    setErrorMessage(null);
    setResult(INITIAL_CONVERSATION_AGENT_RESULT);
    forgetActiveRun();
  }, [forgetActiveRun]);

  /**
   * 既存の Provider Contract（Rules / Local Agent、`providerRunner`・`provider` は
   * Pet Interaction と同じ共有 instance）をそのまま呼ぶ。N 者間 Evidence 抽出
   * （`selectConversationBridge`）は `bridge-selection.ts` の Fairness Rule を
   * 再利用し、最終選定後の 1 組にだけ既存 2 者間 Contract を適用する（ADR-0036）。
   */
  const onStart = useCallback((): void => {
    if (!session) return;
    if (result.kind === 'running') return;
    const bridgeResult = selectConversationBridge(session);
    if (bridgeResult.kind === 'no-signal') {
      setResult({ kind: 'no-signal' });
      return;
    }
    const input = buildConversationAgentModelInput(
      session,
      bridgeResult.bridge,
      Date.now() + INTERACTION_DEADLINE_MS,
      locale
    );
    if (!input) {
      setResult({ kind: 'no-signal' });
      return;
    }
    const encounterKey = `conversation-agent:${[
      ...bridgeResult.bridge.participantIds,
    ]
      .sort()
      .join('|')}`;
    runKeyRef.current = encounterKey;
    setResult({ kind: 'running' });
    void providerRunner
      .run({
        state: INITIAL_PROVIDER_RUNTIME_STATE,
        encounterKey,
        provider,
        input,
      })
      .then(
        (runResult) => {
          if (runKeyRef.current !== encounterKey) return;
          const decision = runResult.outcome.decision;
          setResult(
            decision.kind === 'bridge'
              ? {
                  kind: 'bridge',
                  reason: decision.reason,
                  opener: decision.opener,
                }
              : { kind: 'no-signal' }
          );
        },
        () => {
          if (runKeyRef.current !== encounterKey) return;
          setResult({
            kind: 'error',
            message: MESSAGES[locale].conversationAgent.runErrorMessage,
          });
        }
      );
  }, [locale, provider, providerRunner, result.kind, session]);

  return {
    hasSelfIntroCard: session !== null,
    peers: (session?.peers ?? []).map((peer) => ({
      name: peer.introCard.name,
      participantId: peer.participantId,
    })),
    pasteInput,
    errorMessage,
    result,
    onChangePasteInput: setPasteInput,
    onSubmitPasteInput,
    onScanPeer,
    onUseSampleCard,
    onRemovePeer,
    onStart,
    onReset,
    open,
    close,
  };
}
