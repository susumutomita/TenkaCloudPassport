import { describe, expect, it } from 'bun:test';
import {
  addConversationSessionPeer,
  type ConversationSessionParticipant,
  createConversationSession,
} from '../domain/conversation-session';
import { createIntroCard, type IntroCard } from '../domain/intro-card';
import { readSourceFile } from '../screens/accessibility-test-kit';
import {
  conversationAgentScanErrorMessage,
  performConversationAgentCleanup,
  planConversationAgentStart,
  resolveConversationAgentRun,
  resolveScannedPeer,
} from './conversation-agent-flow-controller';
import { MESSAGES } from './i18n/messages';
import { QrScanError } from './qr-scanner-port';

function hookSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-conversation-agent-flow.ts');
}

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

describe('conversationAgentScanErrorMessage（Issue 146: 実カメラ読取の失敗表示）', () => {
  const fallbackMessage = '取り込みに失敗しました。';

  it('利用者が読み取りをやめた場合は何も表示しない', () => {
    const message = conversationAgentScanErrorMessage({
      error: new QrScanError('SCAN_CANCELLED', 'cancelled'),
      locale: 'ja',
      fallbackMessage,
    });

    expect(message).toBeNull();
  });

  it('権限が無い場合は locale 対応の既存文言を使う', () => {
    expect(
      conversationAgentScanErrorMessage({
        error: new QrScanError('PERMISSION_NOT_GRANTED', 'denied'),
        locale: 'ja',
        fallbackMessage,
      })
    ).toBe(MESSAGES.ja.qrErrorNotice.permissionNotGranted);
    expect(
      conversationAgentScanErrorMessage({
        error: new QrScanError('PERMISSION_NOT_GRANTED', 'denied'),
        locale: 'en',
        fallbackMessage,
      })
    ).toBe(MESSAGES.en.qrErrorNotice.permissionNotGranted);
  });

  it('QR 読取層以外の Error はその message を表示する', () => {
    const message = conversationAgentScanErrorMessage({
      error: new Error('カードを読み取れませんでした。'),
      locale: 'ja',
      fallbackMessage,
    });

    expect(message).toBe('カードを読み取れませんでした。');
  });

  it('Error ではない値は既定文言へ落とす', () => {
    const message = conversationAgentScanErrorMessage({
      error: 'not an error',
      locale: 'ja',
      fallbackMessage,
    });

    expect(message).toBe(fallbackMessage);
  });
});

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

describe('planConversationAgentStart（Step B: 全ペア評価から 1 組を選ぶ 3 分岐、ADR-0048 で Bridge 無し経路を追加）', () => {
  /**
   * ADR-0048: Rules bridge 無し経路は自己紹介の自由記述（`selfIntro`）の有無が
   * 分岐点になるため、`themeIds` に加えて任意の `selfIntro` を指定できるようにする。
   */
  function participant<Id extends string>(
    id: Id,
    name: string,
    themeIds: readonly string[] = [],
    selfIntro?: string
  ): ConversationSessionParticipant {
    return {
      participantId: `ptc_${id}`,
      introCard: createIntroCard({
        name,
        ...(themeIds.length > 0 ? { themeIds } : {}),
        ...(selfIntro === undefined ? {} : { selfIntro }),
      }),
    };
  }

  const DEADLINE_MS = 60_000;

  it('どのペアにも根拠が無い場合、no-signal を返す', () => {
    const session = addConversationSessionPeer(
      createConversationSession(participant('self', '田中太郎')),
      participant('peer', '鈴木花子')
    );

    expect(
      planConversationAgentStart({
        session,
        deadlineAtWallClockMs: DEADLINE_MS,
        language: 'ja',
      })
    ).toEqual({ kind: 'no-signal' });
  });

  it('自分 + 相手 1 名の Bridge は provider-run を返し、encounterKey を participantId の昇順で組み立てる', () => {
    const session = addConversationSessionPeer(
      createConversationSession(
        participant('self', '田中太郎', ['open-source'])
      ),
      participant('peer', '鈴木花子', ['open-source'])
    );

    const plan = planConversationAgentStart({
      session,
      deadlineAtWallClockMs: DEADLINE_MS,
      language: 'ja',
    });

    expect(plan.kind).toBe('provider-run');
    if (plan.kind === 'provider-run') {
      expect(plan.encounterKey).toBe('conversation-agent:ptc_peer|ptc_self');
      expect(plan.partnerNames).toEqual(['鈴木花子']);
      expect(plan.input.deadlineAtWallClockMs).toBe(DEADLINE_MS);
      expect(plan.input.language).toBe('ja');
    }
  });

  it('3 名以上が 1 つの Bridge へ統合された場合、Rules が計算済みの Reason / Opener をそのまま返す（no-signal へ落とさない）', () => {
    const session = addConversationSessionPeer(
      addConversationSessionPeer(
        createConversationSession(
          participant('self', '田中太郎', ['open-source'])
        ),
        participant('peerA', '鈴木花子', ['open-source'])
      ),
      participant('peerB', '佐藤次郎', ['open-source'])
    );

    const plan = planConversationAgentStart({
      session,
      deadlineAtWallClockMs: DEADLINE_MS,
      language: 'ja',
    });

    expect(plan.kind).toBe('rules-bridge');
    if (plan.kind === 'rules-bridge') {
      expect(plan.reason).toContain('オープンソース');
      expect(plan.opener).toContain('オープンソース');
      expect(plan.partnerNames).toEqual(['鈴木花子', '佐藤次郎']);
    }
  });

  it('根拠を持たない相手が混ざっていても、根拠のある 1 組だけを選んで Provider へ渡す', () => {
    const session = addConversationSessionPeer(
      addConversationSessionPeer(
        createConversationSession(
          participant('self', '田中太郎', ['open-source'])
        ),
        participant('peerA', '鈴木花子', ['open-source'])
      ),
      participant('peerB', '根拠なしの人')
    );

    const plan = planConversationAgentStart({
      session,
      deadlineAtWallClockMs: DEADLINE_MS,
      language: 'ja',
    });

    expect(plan.kind).toBe('provider-run');
    if (plan.kind === 'provider-run') {
      expect(plan.partnerNames).toEqual(['鈴木花子']);
      expect(plan.encounterKey).toBe('conversation-agent:ptc_peerA|ptc_self');
    }
  });

  it('相互補完と共通点の両方が成立する 3 名は 1 つの Bridge へ統合され、根拠の強い相互補完が先頭に来る', () => {
    const session = addConversationSessionPeer(
      addConversationSessionPeer(
        createConversationSession(
          participant('self', '田中太郎', [
            'open-source',
            'information-security',
          ])
        ),
        participant('peerA', '共通点だけの人', ['open-source'])
      ),
      participant('peerB', '補完関係の人', ['product-design'])
    );

    const plan = planConversationAgentStart({
      session,
      deadlineAtWallClockMs: DEADLINE_MS,
      language: 'ja',
    });

    expect(plan.kind).toBe('rules-bridge');
    if (plan.kind === 'rules-bridge') {
      expect(plan.reason.indexOf('情報セキュリティ')).toBeLessThan(
        plan.reason.indexOf('オープンソース')
      );
      expect(plan.opener).toContain('情報セキュリティ');
      expect(plan.partnerNames).toEqual(['共通点だけの人', '補完関係の人']);
    }
  });

  describe('ADR-0048: Rules bridge（themeIds 一致）が無くても自由記述が揃えばモデルを走らせる', () => {
    it('テーマ不一致でも自分・相手 1 名の両方に自己紹介文があれば provider-run を返す', () => {
      const session = addConversationSessionPeer(
        createConversationSession(
          participant(
            'self',
            '田中太郎',
            ['local-tournament'],
            '週末は近所の低山を歩いています。'
          )
        ),
        participant(
          'peer',
          '鈴木花子',
          [],
          'アウトドア全般が好きで、最近はキャンプに行きます。'
        )
      );

      const plan = planConversationAgentStart({
        session,
        deadlineAtWallClockMs: DEADLINE_MS,
        language: 'ja',
      });

      expect(plan.kind).toBe('provider-run');
      if (plan.kind === 'provider-run') {
        expect(plan.encounterKey).toBe('conversation-agent:ptc_peer|ptc_self');
        expect(plan.partnerNames).toEqual(['鈴木花子']);
        expect(plan.input.ownerProfileText).toBe(
          '週末は近所の低山を歩いています。'
        );
        expect(plan.input.encounteredProfileText).toBe(
          'アウトドア全般が好きで、最近はキャンプに行きます。'
        );
        expect(plan.input.deadlineAtWallClockMs).toBe(DEADLINE_MS);
      }
    });

    it('相手に自己紹介文が無ければ、テーマ不一致と合わせて no-signal のままになる', () => {
      const session = addConversationSessionPeer(
        createConversationSession(
          participant(
            'self',
            '田中太郎',
            ['local-tournament'],
            '週末は近所の低山を歩いています。'
          )
        ),
        participant('peer', '鈴木花子')
      );

      expect(
        planConversationAgentStart({
          session,
          deadlineAtWallClockMs: DEADLINE_MS,
          language: 'ja',
        })
      ).toEqual({ kind: 'no-signal' });
    });

    it('相手が 2 名以上でテーマ一致ペアが無ければ、全員に自己紹介文があっても no-signal のままになる（ADR-0036 の N 者間対象外を維持）', () => {
      const session = addConversationSessionPeer(
        addConversationSessionPeer(
          createConversationSession(
            participant(
              'self',
              '田中太郎',
              ['local-tournament'],
              '週末は近所の低山を歩いています。'
            )
          ),
          participant(
            'peerA',
            '鈴木花子',
            ['accessibility'],
            'アウトドア全般が好きで、最近はキャンプに行きます。'
          )
        ),
        participant(
          'peerB',
          '佐藤次郎',
          ['cloud-infrastructure'],
          '週末はコーヒーを淹れています。'
        )
      );

      expect(
        planConversationAgentStart({
          session,
          deadlineAtWallClockMs: DEADLINE_MS,
          language: 'ja',
        })
      ).toEqual({ kind: 'no-signal' });
    });
  });
});

describe('/simplify 指摘（simplification/altitude、Follow-up F-056000 の副産物）: onDeviceAiActive は撤去済み', () => {
  it('唯一の消費者だった旧 ConversationAgentScreen 配線を Follow-up F-056000 で切ったため、公開 API からも撤去し、生の provider.kind 比較（INVARIANT_LOCAL_AGENT_SAFETY_BOUNDARY 対象）を導入しない', async () => {
    const text = await hookSource();

    expect(text).not.toContain('onDeviceAiActive');
    expect(text).not.toContain("provider.kind === 'local-agent'");
  });
});
