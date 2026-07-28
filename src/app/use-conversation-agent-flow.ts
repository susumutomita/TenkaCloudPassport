import { useCallback, useMemo, useRef, useState } from 'react';
import type { AgentModelProvider } from '../domain/agent-model-provider';
import { MAX_BRIDGE_SELECTION_PARTICIPANTS } from '../domain/bridge-selection';
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
import type { CameraQrCapturePort } from './camera-qr-capture';
import {
  CONVERSATION_AGENT_SAMPLE_PEER_CARD,
  type ConversationAgentPresentedResultState,
  type ConversationAgentResultState,
  decodeConversationAgentPeerCard,
  INITIAL_CONVERSATION_AGENT_RESULT,
  presentConversationAgentResult,
} from './conversation-agent-flow';
import {
  conversationAgentScanErrorMessage,
  performConversationAgentCleanup,
  planConversationAgentStart,
  resolveConversationAgentRun,
  resolveScannedPeer,
} from './conversation-agent-flow-controller';
import { conversationExampleGeneratorForProvider } from './conversation-example-capability';
import type { Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import { readableError } from './readable-error';
import { useConversationExample } from './use-conversation-example';

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
  /**
   * Issue 146: 対面の相手端末に表示された QR を実カメラで読み取る Port。
   * 単一端末デモ用の in-process `QrScannerPort` では相手のカードを取り込めない
   * （`publish()` された Lounge Invite しか返らない）ため、この画面は
   * `CameraQrCapturePort` を使う。
   */
  readonly cameraQrCapturePort: CameraQrCapturePort;
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
  /**
   * Step B: `MAX_BRIDGE_SELECTION_PARTICIPANTS`（自分を含む）に達していないか。
   * 画面はこれが `false` のとき取り込み導線を隠し、満席である旨だけを伝える。
   */
  readonly canAddPeer: boolean;
  readonly pasteInput: string;
  readonly errorMessage: string | null;
  readonly result: ConversationAgentPresentedResultState;
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
  cameraQrCapturePort,
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
  const conversationExampleGenerator =
    conversationExampleGeneratorForProvider(provider);
  const {
    state: conversationExampleState,
    prepare: prepareConversationExample,
    generate: generateConversationExample,
    cancel: cancelConversationExample,
    hide: hideConversationExample,
  } = useConversationExample(conversationExampleGenerator);
  // Provider 呼出しは非同期のため、セッションが破棄・やり直された後に届く
  // 遅延完了が古い結果を上書きしないための世代キー。
  const runKeyRef = useRef<string | null>(null);
  // major（Issue 104 PR #132、stale scan race）: `onScanPeer` の Promise は
  // 非同期のため、待機中に `close`/`onReset` → 再 `open` されると、旧 scan の
  // 完了が新しい session の空 peer slot へ紛れ込みうる。`open`/`close`/
  // `onReset`/`onRemovePeer` のたびに世代を進め、scan 開始時に捕まえた世代と
  // 突き合わせて stale な完了を破棄する（`conversation-agent-flow-controller.ts`
  // の `resolveScannedPeer` が実行テスト付きでこの判定を持つ）。`/simplify`
  // 指摘（reuse/simplification）: 専用の interface・factory 関数を作らず、
  // 上の `runKeyRef` と同じ「plain な `useRef`」の流儀に揃える。
  const scanGenerationRef = useRef(0);

  /**
   * code-reviewer 指摘（major）: `runKeyRef` を `null` へ戻すだけでは
   * `providerRunner.run(...)`（Native Lane を直列に占有する非同期実行）自体は
   * 止まらない。Pet Interaction 側（`PassportApp.tsx` の `cancelActiveProvider`）
   * と同じく、状態をリセットする全経路（`open` / `close` / `onReset` /
   * `onRemovePeer`）で必ず `providerRunner.forget(...)` を呼び、実行中なら
   * Cancel、確定済みなら Ledger 上のエントリを破棄する。blocker（PR #132）:
   * この呼び忘れ regression を構造的に防ぐため、実際の forget() 呼び出し順序は
   * `conversation-agent-flow-controller.ts` の `performConversationAgentCleanup`
   * （実行テスト付き）へ一本化する。
   */
  const forgetActiveRun = useCallback((): void => {
    const activeEncounterKey = runKeyRef.current;
    runKeyRef.current = null;
    performConversationAgentCleanup({
      activeEncounterKey,
      forget: providerRunner.forget,
    });
  }, [providerRunner]);

  const resetTransientState = useCallback((): void => {
    // Issue 146: 画面を離れる・やり直す経路で Camera Preview を開いたままにしない。
    // 待機中でなければ no-op で、待機中なら SCAN_CANCELLED として決着する
    // （その完了は上の世代キーが stale として捨てる）。
    cameraQrCapturePort.cancel();
    hideConversationExample();
    setPasteInput('');
    setErrorMessage(null);
    setResult(INITIAL_CONVERSATION_AGENT_RESULT);
    forgetActiveRun();
  }, [cameraQrCapturePort, forgetActiveRun, hideConversationExample]);

  const open = useCallback(
    (introCard: IntroCard | null): void => {
      scanGenerationRef.current += 1;
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
    scanGenerationRef.current += 1;
    setSession(null);
    resetTransientState();
    onNavigateToSettings();
  }, [onNavigateToSettings, resetTransientState]);

  const addPeer = useCallback(
    (card: IntroCard): void => {
      setSession((current) => {
        if (!current) return current;
        // Step B（Issue 104 受入基準「複数参加者の全ペアを端末内で評価する」）:
        // Step A の「相手 1 名で取り込み導線を隠す」制限を外し、
        // `MAX_BRIDGE_SELECTION_PARTICIPANTS` までの参加者を受け入れる。
        // PR #132 の blocker（見えない 2 人目が個別に消せなくなる）は、
        // 画面が `peers` を全件リスト表示し 1 名ずつ `onRemovePeer` を持つように
        // なったことで解消している。上限超過は下の `addConversationSessionPeer`
        // が `SESSION_FULL` を投げ、静かに落とさず理由を表示する。
        try {
          const next = addConversationSessionPeer(current, {
            participantId: createParticipantId(webCryptoRandomBytes),
            introCard: card,
          });
          hideConversationExample();
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
    [hideConversationExample, locale]
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
   * Issue 146: 実カメラを開いて相手の QR を 1 件読み取る。Port の `capture()` を
   * 呼び、生文字列を受け取るだけという呼び出しの形は従来どおりで、この画面は
   * カメラパッケージを直接 import しない（`qr-scanner-port.ts` の architect
   * guidance と同じ原則）。取り消し・権限拒否の文言化は
   * `conversationAgentScanErrorMessage` が一元的に判断する。
   */
  const onScanPeer = useCallback((): void => {
    const generationAtStart = scanGenerationRef.current;
    void resolveScannedPeer({
      scanGenerationRef,
      generationAtStart,
      scan: () => cameraQrCapturePort.capture(),
      decode: decodeConversationAgentPeerCard,
      addPeer,
      onError: (error) => {
        setErrorMessage(
          conversationAgentScanErrorMessage({
            error,
            locale,
            fallbackMessage: MESSAGES[locale].conversationAgent.runErrorMessage,
          })
        );
      },
    });
  }, [addPeer, cameraQrCapturePort, locale]);

  /** 設計文書「審査官が単独で試せる審査戦略」: QR・URL 往復を経ないテスト専用の内部経路。 */
  const onUseSampleCard = useCallback((): void => {
    addPeer(CONVERSATION_AGENT_SAMPLE_PEER_CARD);
  }, [addPeer]);

  const onRemovePeer = useCallback(
    (participantId: ParticipantId): void => {
      scanGenerationRef.current += 1;
      setSession((current) =>
        current
          ? removeConversationSessionPeer(current, participantId)
          : current
      );
      hideConversationExample();
      setResult(INITIAL_CONVERSATION_AGENT_RESULT);
      forgetActiveRun();
    },
    [forgetActiveRun, hideConversationExample]
  );

  const onReset = useCallback((): void => {
    scanGenerationRef.current += 1;
    setSession((current) =>
      current ? clearConversationSessionPeers(current) : current
    );
    hideConversationExample();
    setPasteInput('');
    setErrorMessage(null);
    setResult(INITIAL_CONVERSATION_AGENT_RESULT);
    forgetActiveRun();
  }, [forgetActiveRun, hideConversationExample]);

  /**
   * 既存の Provider Contract（Rules / Local Agent、`providerRunner`・`provider` は
   * Pet Interaction と同じ共有 instance）をそのまま呼ぶ。N 者間 Evidence 抽出
   * （`selectConversationBridge`）は `bridge-selection.ts` の Fairness Rule を
   * 再利用し、最終選定後の 1 組にだけ既存 2 者間 Contract を適用する（ADR-0036）。
   */
  const onStart = useCallback((): void => {
    if (!session) return;
    if (result.kind === 'running') return;
    hideConversationExample();
    const plan = planConversationAgentStart({
      session,
      deadlineAtWallClockMs: Date.now() + INTERACTION_DEADLINE_MS,
      language: locale,
    });
    if (plan.kind === 'no-signal') {
      setResult({ kind: 'no-signal' });
      return;
    }
    if (plan.kind === 'rules-bridge') {
      setResult({
        kind: 'bridge',
        reason: plan.reason,
        opener: plan.opener,
        partnerNames: plan.partnerNames,
      });
      return;
    }
    runKeyRef.current = plan.encounterKey;
    setResult({ kind: 'running' });
    void resolveConversationAgentRun({
      activeRunKeyRef: runKeyRef,
      encounterKey: plan.encounterKey,
      run: () =>
        providerRunner.run({
          state: INITIAL_PROVIDER_RUNTIME_STATE,
          encounterKey: plan.encounterKey,
          provider,
          input: plan.input,
        }),
      onSuccess: (runResult) => {
        const { outcome } = runResult;
        const { decision } = outcome;
        if (decision.kind !== 'bridge') {
          hideConversationExample();
          setResult({ kind: 'no-signal' });
          return;
        }
        if (
          outcome.settledBy === 'primary' &&
          conversationExampleGenerator !== null
        ) {
          prepareConversationExample({
            bridgeReason: decision.reason,
            bridgeOpener: decision.opener,
            ownerProfileText: plan.input.ownerProfileText,
            peerProfileText: plan.input.encounteredProfileText,
            language: plan.input.language ?? locale,
          });
        } else {
          hideConversationExample();
        }
        setResult({
          kind: 'bridge',
          reason: decision.reason,
          opener: decision.opener,
          partnerNames: plan.partnerNames,
        });
      },
      onError: () => {
        hideConversationExample();
        setResult({
          kind: 'error',
          message: MESSAGES[locale].conversationAgent.runErrorMessage,
        });
      },
    });
  }, [
    conversationExampleGenerator,
    hideConversationExample,
    locale,
    prepareConversationExample,
    provider,
    providerRunner,
    result.kind,
    session,
  ]);

  const presentedResult = useMemo(
    () =>
      presentConversationAgentResult(result, {
        state: conversationExampleState,
        onGenerate: generateConversationExample,
        onCancel: cancelConversationExample,
      }),
    [
      cancelConversationExample,
      conversationExampleState,
      generateConversationExample,
      result,
    ]
  );

  return {
    hasSelfIntroCard: session !== null,
    peers: (session?.peers ?? []).map((peer) => ({
      name: peer.introCard.name,
      participantId: peer.participantId,
    })),
    canAddPeer:
      session !== null &&
      session.peers.length + 1 < MAX_BRIDGE_SELECTION_PARTICIPANTS,
    pasteInput,
    errorMessage,
    result: presentedResult,
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
