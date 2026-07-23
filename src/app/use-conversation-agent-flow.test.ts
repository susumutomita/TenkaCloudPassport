import { describe, expect, it } from 'bun:test';
import { createIntroCard, type IntroCard } from '../domain/intro-card';
import {
  performConversationAgentCleanup,
  resolveConversationAgentRun,
  resolveScannedPeer,
} from './conversation-agent-flow-controller';

/**
 * Issue 104 PR #132（Codex 指摘 major）: `use-conversation-agent-flow.ts` の
 * 状態機械を実行するテストが無かった。この repo には React render harness が
 * 無く hook 本体を直接実行できないため、`local-model-management-controller.ts`
 * と同じ流儀で切り出した `conversation-agent-flow-controller.ts` の純関数を
 * ここで直接実行し、pending scan・Settings 離脱時の forget()・遅延完了破棄の
 * 契約を固定する。`/simplify` 指摘（reuse/simplification）: 世代管理は専用の
 * interface・factory を作らず、`useRef` 相当の plain な `{ current: number }`
 * を直接使う（`resolveConversationAgentRun` の `activeRunKeyRef` と同じ流儀）。
 */

describe('performConversationAgentCleanup（blocker: 全離脱経路の forget() 集約）', () => {
  it('実行中の encounterKey がある場合、forget をその key で呼ぶ', () => {
    const forgotten: string[] = [];

    performConversationAgentCleanup({
      activeEncounterKey: 'conversation-agent:alice|bob',
      forget: (key) => forgotten.push(key),
    });

    expect(forgotten).toEqual(['conversation-agent:alice|bob']);
  });

  it('実行中の encounterKey が無い場合、forget を呼ばない', () => {
    const forgotten: string[] = [];

    performConversationAgentCleanup({
      activeEncounterKey: null,
      forget: (key) => forgotten.push(key),
    });

    expect(forgotten).toEqual([]);
  });
});

const SAMPLE_CARD: IntroCard = createIntroCard({ name: 'Scanned Peer' });

interface ScanHarness {
  readonly scanGenerationRef: { current: number };
  readonly addedPeers: IntroCard[];
  readonly errors: unknown[];
  run: (
    scan: () => Promise<string>,
    generationAtStart?: number
  ) => Promise<void>;
}

function scanHarness(): ScanHarness {
  const scanGenerationRef = { current: 0 };
  const addedPeers: IntroCard[] = [];
  const errors: unknown[] = [];
  return {
    scanGenerationRef,
    addedPeers,
    errors,
    run(scan, generationAtStart = scanGenerationRef.current) {
      return resolveScannedPeer({
        scanGenerationRef,
        generationAtStart,
        scan,
        decode: (raw) => {
          if (raw === 'invalid') throw new Error('decode failed');
          return SAMPLE_CARD;
        },
        addPeer: (card) => addedPeers.push(card),
        onError: (error) => errors.push(error),
      });
    },
  };
}

describe('resolveScannedPeer（major: pending scan の stale race 破棄）', () => {
  it('scan・decode が成功すれば addPeer を呼び、onError は呼ばない', async () => {
    const harness = scanHarness();

    await harness.run(() =>
      Promise.resolve('https://card.tenkacloud.com/c/#raw')
    );

    expect(harness.addedPeers).toEqual([SAMPLE_CARD]);
    expect(harness.errors).toEqual([]);
  });

  it('scan が失敗した場合、onError を呼び addPeer は呼ばない', async () => {
    const harness = scanHarness();
    const failure = new Error('scan failed');

    await harness.run(() => Promise.reject(failure));

    expect(harness.errors).toEqual([failure]);
    expect(harness.addedPeers).toEqual([]);
  });

  it('decode が失敗した場合、onError を呼び addPeer は呼ばない', async () => {
    const harness = scanHarness();

    await harness.run(() => Promise.resolve('invalid'));

    expect(harness.errors.length).toBe(1);
    expect(harness.addedPeers).toEqual([]);
  });

  it('scan 完了までに世代が進んでいた場合（close/reset→再 open）、成功結果を静かに破棄する', async () => {
    const harness = scanHarness();
    const generationAtStart = harness.scanGenerationRef.current;
    let resolveScan: (raw: string) => void = () => undefined;
    const scanPromise = new Promise<string>((resolve) => {
      resolveScan = resolve;
    });

    const pending = harness.run(() => scanPromise, generationAtStart);
    harness.scanGenerationRef.current += 1; // close→再 open 相当
    resolveScan('https://card.tenkacloud.com/c/#raw');
    await pending;

    expect(harness.addedPeers).toEqual([]);
    expect(harness.errors).toEqual([]);
  });

  it('scan 完了までに世代が進んでいた場合、失敗結果も静かに破棄する（onError を呼ばない）', async () => {
    const harness = scanHarness();
    const generationAtStart = harness.scanGenerationRef.current;
    let rejectScan: (error: unknown) => void = () => undefined;
    const scanPromise = new Promise<string>((_resolve, reject) => {
      rejectScan = reject;
    });

    const pending = harness.run(() => scanPromise, generationAtStart);
    harness.scanGenerationRef.current += 1;
    rejectScan(new Error('late failure'));
    await pending;

    expect(harness.errors).toEqual([]);
    expect(harness.addedPeers).toEqual([]);
  });
});

interface RunHarness {
  readonly runKeyRef: { current: string | null };
  readonly successes: number[];
  readonly errors: unknown[];
}

function runHarness(): RunHarness {
  return { runKeyRef: { current: null }, successes: [], errors: [] };
}

describe('resolveConversationAgentRun（major: 遅延完了破棄）', () => {
  it('Provider 実行が成功し key が一致していれば onSuccess を呼ぶ', async () => {
    const harness = runHarness();
    harness.runKeyRef.current = 'conversation-agent:alice|bob';

    await resolveConversationAgentRun({
      activeRunKeyRef: harness.runKeyRef,
      encounterKey: 'conversation-agent:alice|bob',
      run: () => Promise.resolve(42),
      onSuccess: (result) => harness.successes.push(result),
      onError: (error) => harness.errors.push(error),
    });

    expect(harness.successes).toEqual([42]);
    expect(harness.errors).toEqual([]);
  });

  it('Provider 実行が失敗し key が一致していれば onError を呼ぶ', async () => {
    const harness = runHarness();
    harness.runKeyRef.current = 'conversation-agent:alice|bob';
    const failure = new Error('provider failed');

    await resolveConversationAgentRun({
      activeRunKeyRef: harness.runKeyRef,
      encounterKey: 'conversation-agent:alice|bob',
      run: () => Promise.reject(failure),
      onSuccess: (result) => harness.successes.push(result),
      onError: (error) => harness.errors.push(error),
    });

    expect(harness.errors).toEqual([failure]);
    expect(harness.successes).toEqual([]);
  });

  it('完了までに runKeyRef が変わっていれば（close/reset/次の onStart）、成功結果を破棄する', async () => {
    const harness = runHarness();
    harness.runKeyRef.current = 'conversation-agent:alice|bob';
    let resolveRun: (value: number) => void = () => undefined;
    const runPromise = new Promise<number>((resolve) => {
      resolveRun = resolve;
    });

    const pending = resolveConversationAgentRun({
      activeRunKeyRef: harness.runKeyRef,
      encounterKey: 'conversation-agent:alice|bob',
      run: () => runPromise,
      onSuccess: (result) => harness.successes.push(result),
      onError: (error) => harness.errors.push(error),
    });
    harness.runKeyRef.current = null; // forgetActiveRun 相当（close/reset）
    resolveRun(42);
    await pending;

    expect(harness.successes).toEqual([]);
    expect(harness.errors).toEqual([]);
  });

  it('完了までに runKeyRef が変わっていれば、失敗結果も破棄する（onError を呼ばない）', async () => {
    const harness = runHarness();
    harness.runKeyRef.current = 'conversation-agent:alice|bob';
    let rejectRun: (error: unknown) => void = () => undefined;
    const runPromise = new Promise<number>((_resolve, reject) => {
      rejectRun = reject;
    });

    const pending = resolveConversationAgentRun({
      activeRunKeyRef: harness.runKeyRef,
      encounterKey: 'conversation-agent:alice|bob',
      run: () => runPromise,
      onSuccess: (result) => harness.successes.push(result),
      onError: (error) => harness.errors.push(error),
    });
    harness.runKeyRef.current = 'conversation-agent:alice|carol'; // 次の onStart 相当
    rejectRun(new Error('late failure'));
    await pending;

    expect(harness.errors).toEqual([]);
    expect(harness.successes).toEqual([]);
  });
});
