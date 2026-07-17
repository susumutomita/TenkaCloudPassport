import { describe, expect, it } from 'bun:test';
import {
  BridgeSelectionError,
  type BridgeSelectionParticipant,
  bridgeConfidence,
  bridgePairKey,
  buildSelectedBridgeFromEvidence,
  offerNeedComplementMatches,
  type ParticipantBridgeResult,
  type SelectedBridge,
  selectBridges,
  sharedLanguage,
} from './bridge-selection';
import { publicPassportWithClues as passport } from './domain-test-kit';

/**
 * Issue 12: 根拠付き Bridge 選定アルゴリズムの日本語 BDD テスト。アルゴリズム自体の
 * 正本は `docs/design/bridge-selection.md`。テスト用の参加者 ID は `ptc_<literal>` の
 * template literal 型として組み立てるため、`ParticipantId`（`session-identifiers.ts`）へ
 * 型エスケープ無しでそのまま代入できる。
 */
function participant<Id extends string>(
  id: Id,
  clueIds: readonly string[],
  languageCodes: readonly string[] = [],
  ownerAlias = ''
): BridgeSelectionParticipant {
  return {
    participantId: `ptc_${id}`,
    passport: passport(clueIds, languageCodes, ownerAlias),
  };
}

function expectBridgeSelectionError(
  action: () => void,
  code: BridgeSelectionError['code']
): void {
  try {
    action();
    throw new Error('BridgeSelectionError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(BridgeSelectionError);
    if (error instanceof BridgeSelectionError) {
      expect(error.code).toBe(code);
    }
  }
}

function bridgeOf(
  outcomes: ReturnType<typeof selectBridges>,
  participantId: string
): ParticipantBridgeResult {
  const outcome = outcomes.find((item) => item.participantId === participantId);
  if (!outcome) throw new Error('参加者が見つかりません。');
  return outcome.result;
}

/** `bridgeOf` の結果を `bridge` へ narrowing し、`no-signal` なら失敗させる。 */
function expectBridge(result: ParticipantBridgeResult): SelectedBridge {
  if (result.kind !== 'bridge') throw new Error('bridge が必要です。');
  return result.bridge;
}

describe('Layer 1: ID を持たない Public Passport ペアの純粋判定', () => {
  describe('offerNeedComplementMatches', () => {
    it('一方の offers ともう一方の lookingFor が同じ category なら 1 件返す', () => {
      const matches = offerNeedComplementMatches(
        passport(['information-security']),
        passport(['product-design'])
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]?.category).toBe('skill');
      expect(matches[0]?.offerSide).toBe('a');
      expect(matches[0]?.offerClue.value).toBe('information-security');
      expect(matches[0]?.seekClue.value).toBe('product-design');
    });

    it('双方が補完し合う場合は双方向 2 件を返す（相互補完だけのケース）', () => {
      const matches = offerNeedComplementMatches(
        passport(['information-security', 'local-tournament']),
        passport(['product-design', 'regional-event-operations'])
      );

      expect(matches).toHaveLength(2);
      expect(matches.map((match) => match.offerSide).sort()).toEqual([
        'a',
        'b',
      ]);
    });

    it('category が異なる Offer/Need は相互補完とみなさない', () => {
      const matches = offerNeedComplementMatches(
        passport(['regional-event-operations']),
        passport(['product-design'])
      );

      expect(matches).toEqual([]);
    });

    it('複数の offers 手掛かりのうち category が一致する最初の 1 組だけを使う', () => {
      const matches = offerNeedComplementMatches(
        passport(['regional-event-operations', 'information-security']),
        passport(['product-design'])
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]?.offerClue.value).toBe('information-security');
    });

    it('offers 側にも lookingFor 側にも該当がなければ空配列になる', () => {
      const matches = offerNeedComplementMatches(
        passport(['open-source']),
        passport(['accessibility'])
      );

      expect(matches).toEqual([]);
    });
  });

  describe('sharedLanguage', () => {
    it('共通する Language をカタログ順で最初の 1 件だけ返す', () => {
      const language = sharedLanguage(
        passport(['open-source'], ['en', 'ja']),
        passport(['open-source'], ['ja'])
      );

      expect(language).toBe('ja');
    });

    it('異なる Language しか持たない場合は undefined を返す', () => {
      const language = sharedLanguage(
        passport(['open-source'], ['ja']),
        passport(['open-source'], ['en'])
      );

      expect(language).toBeUndefined();
    });
  });
});

describe('bridgeConfidence: Evidence の種別と件数から定性的 Confidence を導く', () => {
  it('Evidence が空の場合は判定できず例外になる', () => {
    expect(() => bridgeConfidence([])).toThrow();
  });
});

describe('buildSelectedBridgeFromEvidence: Bridge Contract の組み立て', () => {
  it('Evidence が空の場合は Bridge を組み立てない', () => {
    expect(() => buildSelectedBridgeFromEvidence([], [])).toThrow();
  });
});

describe('2 名: Pair の基本ケース', () => {
  it('Evidence が 1 件もなければ両者とも no-signal になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['regional-event-operations']),
        participant('b', ['accessibility']),
      ],
    });

    expect(
      outcomes.every((outcome) => outcome.result.kind === 'no-signal')
    ).toBe(true);
  });

  it('Topic Evidence が 1 件あれば Bridge を返し Confidence は possible になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
      ],
    });

    for (const outcome of outcomes) {
      const bridge = expectBridge(outcome.result);
      expect(bridge.confidence).toBe('possible');
      expect(bridge.evidenceIds).toHaveLength(1);
      expect(bridge.reason).toContain('オープンソース');
      expect(bridge.opener).toContain('オープンソース');
    }
  });

  it('Offer/Need 相互補完だけでも 1 件で Confidence は promising になる（相互補完だけのケース）', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['information-security']),
        participant('b', ['product-design']),
      ],
    });

    for (const outcome of outcomes) {
      const bridge = expectBridge(outcome.result);
      expect(bridge.confidence).toBe('promising');
      expect(bridge.evidenceIds).toHaveLength(1);
    }
  });

  it('Topic と共通 Language の両方があれば 2 件の Evidence で Confidence は promising になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source'], ['ja']),
        participant('b', ['open-source'], ['ja']),
      ],
    });

    for (const outcome of outcomes) {
      const bridge = expectBridge(outcome.result);
      expect(bridge.confidence).toBe('promising');
      expect(bridge.evidenceIds).toHaveLength(2);
    }
  });

  it('全員が同じ Bridge を参照し、参加者 ID には自分自身も含む全員が入る', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    const b = expectBridge(bridgeOf(outcomes, 'ptc_b'));
    expect(a).toEqual(b);
    expect([...a.participantIds].sort()).toEqual(['ptc_a', 'ptc_b']);
  });
});

describe('3 名: 奇数の基本ケース', () => {
  it('2 名だけに Evidence があれば Pair が優先され、繋がりのない残り 1 名は no-signal になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['event-lessons']),
      ],
    });

    expect(bridgeOf(outcomes, 'ptc_a').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_c').kind).toBe('no-signal');
  });

  it('残り 1 名が Pair のどちらかと 2 つの独立した Evidence で繋がっていれば、全員に意味のある promising な 3 人 Bridge になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source'], ['ja']),
        participant('b', ['open-source'], ['ja']),
        participant('c', ['open-source']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    const b = expectBridge(bridgeOf(outcomes, 'ptc_b'));
    const c = expectBridge(bridgeOf(outcomes, 'ptc_c'));

    expect([...a.participantIds].sort()).toEqual(['ptc_a', 'ptc_b', 'ptc_c']);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    // a-b は Topic + Language の 2 件、c は a・b いずれとも Topic だけで繋がる。
    // Topic は全員共通の 1 事実として去重され、独立した事実は Topic と Language の 2 件。
    expect(a.evidenceIds).toHaveLength(2);
    expect(a.confidence).toBe('promising');
  });

  it('残り 1 名が同じ 1 事実だけで Pair の双方と繋がる場合、去重されて Confidence は possible のままになる（重複 Evidence の禁止）', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['open-source']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    const b = expectBridge(bridgeOf(outcomes, 'ptc_b'));
    const c = expectBridge(bridgeOf(outcomes, 'ptc_c'));

    expect([...a.participantIds].sort()).toEqual(['ptc_a', 'ptc_b', 'ptc_c']);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    // a-b、c-a、c-b の 3 辺すべてが同じ「open-source を共有している」という
    // 1 つの事実を検出するが、去重により Evidence は 1 件だけになり、
    // 同じ reason 文が 3 回並ぶこともない。
    expect(a.evidenceIds).toHaveLength(1);
    expect(a.confidence).toBe('possible');
    const occurrences = a.reason.split('オープンソース').length - 1;
    expect(occurrences).toBe(1);
  });

  it('3 人 Bridge が Offer/Need 相互補完と Topic 共通を同時に含む場合、別々の事実として両方とも残る（去重は同一事実だけに限る）', () => {
    const outcomes = selectBridges({
      participants: [
        // a-c は Offer/Need 相互補完（c が offers、a が lookingFor で同じ category）。
        // a-b は Topic 共通（open-source）。相互補完のほうが Confidence が高いため
        // a-c が Pair として先に確定し、b が孤立して a-c の Pair へ統合される。
        participant('a', ['open-source', 'product-design']),
        participant('b', ['open-source']),
        participant('c', ['information-security']),
      ],
    });

    const bridge = expectBridge(bridgeOf(outcomes, 'ptc_a'));

    expect([...bridge.participantIds].sort()).toEqual([
      'ptc_a',
      'ptc_b',
      'ptc_c',
    ]);
    expect(bridge.evidenceIds).toEqual([
      'complement:skill:ptc_c:information-security:ptc_a:product-design',
      'topic:open-source:ptc_a,ptc_b,ptc_c',
    ]);
    expect(bridge.confidence).toBe('promising');
  });

  it('誰にも Evidence がなければ全員 no-signal になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['accessibility']),
        participant('c', ['event-lessons']),
      ],
    });

    expect(
      outcomes.every((outcome) => outcome.result.kind === 'no-signal')
    ).toBe(true);
  });
});

describe('4 名: 偶数は常に Pair のみで 3 人 Bridge を作らない', () => {
  it('2 組の Pair に分かれる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['accessibility']),
        participant('d', ['accessibility']),
      ],
    });

    expect(outcomes.every((outcome) => outcome.result.kind === 'bridge')).toBe(
      true
    );
  });

  it('Pair が 1 組しか組めない場合、残り 2 名も 3 人 Bridge にはせずそれぞれ no-signal になる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['accessibility']),
        participant('d', ['event-lessons']),
      ],
    });

    expect(bridgeOf(outcomes, 'ptc_a').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_c').kind).toBe('no-signal');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('no-signal');
  });
});

describe('5 名: 奇数', () => {
  it('2 組の Pair + 孤立した 1 名は no-signal のままになる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['accessibility']),
        participant('d', ['accessibility']),
        participant('e', ['event-lessons']),
      ],
    });

    expect(bridgeOf(outcomes, 'ptc_a').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_c').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_e').kind).toBe('no-signal');
  });

  it('孤立した 1 名がどちらかの Pair と Evidence で繋がっていれば 3 人 Bridge に統合される', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['accessibility']),
        participant('d', ['accessibility']),
        participant('e', ['accessibility']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    const c = expectBridge(bridgeOf(outcomes, 'ptc_c'));
    const e = expectBridge(bridgeOf(outcomes, 'ptc_e'));

    expect([...a.participantIds].sort()).toEqual(['ptc_a', 'ptc_b']);
    expect([...c.participantIds].sort()).toEqual(['ptc_c', 'ptc_d', 'ptc_e']);
    expect(e).toEqual(c);
    // c-d、e-c、e-d の 3 辺すべてが「accessibility を共有している」という同じ
    // 1 事実を検出するが、去重により Evidence は 1 件だけになる。
    expect(c.evidenceIds).toHaveLength(1);
  });
});

describe('6 名: 偶数', () => {
  it('3 組の Pair に分かれる', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['accessibility']),
        participant('d', ['accessibility']),
        participant('e', ['event-lessons']),
        participant('f', ['event-lessons']),
      ],
    });

    expect(outcomes).toHaveLength(6);
    expect(outcomes.every((outcome) => outcome.result.kind === 'bridge')).toBe(
      true
    );
  });
});

describe('同点の Tie-break と Order-independence', () => {
  it('参加者 ID が同じ強さで競合する場合、正規化した ID の辞書順で決定的に 1 組だけ選ぶ', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
        participant('c', ['open-source']),
        participant('d', ['event-lessons']),
      ],
    });

    expect(bridgeOf(outcomes, 'ptc_a').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_c').kind).toBe('no-signal');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('no-signal');
  });

  it('Confidence が高い相手を優先する（Evidence 件数が同じでも promising が possible に勝つ）', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source', 'information-security']),
        participant('b', ['open-source']),
        participant('c', ['product-design']),
        participant('d', ['event-lessons']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    expect([...a.participantIds].sort()).toEqual(['ptc_a', 'ptc_c']);
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('no-signal');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('no-signal');
  });

  it('同じ Confidence でも Evidence 件数が多い相手を優先する', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['information-security'], ['ja']),
        participant('b', ['product-design']),
        participant('z', ['product-design'], ['ja']),
        participant('d', ['event-lessons']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    expect(a.participantIds.includes('ptc_z')).toBe(true);
    expect(a.participantIds.includes('ptc_b')).toBe(false);
    expect(a.evidenceIds).toHaveLength(2);
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('no-signal');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('no-signal');
  });

  it('参加者の入力順序を変えても同じ結果になる（単純な Tie のケース）', () => {
    const order1 = [
      participant('a', ['open-source']),
      participant('b', ['open-source']),
      participant('c', ['open-source']),
      participant('d', ['event-lessons']),
    ];
    const order2 = [
      participant('d', ['event-lessons']),
      participant('c', ['open-source']),
      participant('a', ['open-source']),
      participant('b', ['open-source']),
    ];

    expect(selectBridges({ participants: order2 })).toEqual(
      selectBridges({ participants: order1 })
    );
  });

  it('参加者の入力順序を変えても同じ結果になる（3 人 Bridge を含むケース）', () => {
    const order1 = [
      participant('a', ['open-source']),
      participant('b', ['open-source']),
      participant('c', ['accessibility']),
      participant('d', ['accessibility']),
      participant('e', ['accessibility']),
    ];
    const order2 = [
      participant('e', ['accessibility']),
      participant('c', ['accessibility']),
      participant('b', ['open-source']),
      participant('a', ['open-source']),
      participant('d', ['accessibility']),
    ];

    expect(selectBridges({ participants: order2 })).toEqual(
      selectBridges({ participants: order1 })
    );
  });
});

describe('Owner Rejection の除外', () => {
  it('拒否した組合せを含む新規 Bridge は生成しない', () => {
    const a = participant('a', ['open-source']);
    const b = participant('b', ['open-source']);

    const outcomes = selectBridges({
      participants: [a, b],
      excludedPairs: new Set([bridgePairKey(a.participantId, b.participantId)]),
    });

    expect(
      outcomes.every((outcome) => outcome.result.kind === 'no-signal')
    ).toBe(true);
  });

  it('拒否されていない相手とは新規 Bridge を生成できる', () => {
    const a = participant('a', ['open-source']);
    const b = participant('b', ['open-source', 'event-lessons']);
    const d = participant('d', ['event-lessons']);

    const outcomes = selectBridges({
      participants: [a, b, d],
      excludedPairs: new Set([bridgePairKey(a.participantId, b.participantId)]),
    });

    expect(bridgeOf(outcomes, 'ptc_a').kind).toBe('no-signal');
    expect(bridgeOf(outcomes, 'ptc_b').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('bridge');
  });

  it('3 人 Bridge への統合でも拒否した組合せは統合されない', () => {
    const c = participant('c', ['accessibility']);
    const d = participant('d', ['accessibility']);
    const e = participant('e', ['accessibility']);

    const outcomes = selectBridges({
      participants: [c, d, e],
      excludedPairs: new Set([bridgePairKey(e.participantId, c.participantId)]),
    });

    expect(bridgeOf(outcomes, 'ptc_c').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_d').kind).toBe('bridge');
    expect(bridgeOf(outcomes, 'ptc_e').kind).toBe('no-signal');
  });
});

describe('Evidence の Trace 可能性 (Bridge Contract)', () => {
  it('evidenceIds は実際に使った Evidence の evidenceId と一致する', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source'], ['ja']),
        participant('b', ['open-source'], ['ja']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    expect(a.evidenceIds).toEqual([
      'topic:open-source:ptc_a:ptc_b',
      'language:ja:ptc_a:ptc_b',
    ]);
  });

  it('reason と opener は Evidence の内容だけから構成され、Owner Alias の自由記述を含まない', () => {
    const alias = 'つちのこ＠日本語エイリアス';
    const a = participant('a', ['open-source'], [], alias);
    const b = participant('b', ['open-source']);

    const outcomes = selectBridges({ participants: [a, b] });
    const bridge = expectBridge(bridgeOf(outcomes, 'ptc_a'));

    expect(bridge.reason).not.toContain(alias);
    expect(bridge.opener).not.toContain(alias);
    expect(bridge.reason).toContain('オープンソース');
  });
});

describe('Unicode・表記揺れ・重複・境界', () => {
  it('Owner Alias が同じ Unicode 文字列でも、確認済み手掛かりが異なれば no-signal になる（Alias は Evidence に混入しない）', () => {
    const alias = 'つちのこ🐾ＡＢＣ';
    const a = participant('a', ['open-source'], [], alias);
    const b = participant('b', ['accessibility'], [], alias);

    const outcomes = selectBridges({ participants: [a, b] });

    expect(
      outcomes.every((outcome) => outcome.result.kind === 'no-signal')
    ).toBe(true);
  });

  it('同じ category でも異なる ClueId は Topic Evidence として一致しない（カタログ ID 単位の一致判定）', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['accessibility']),
      ],
    });

    expect(
      outcomes.every((outcome) => outcome.result.kind === 'no-signal')
    ).toBe(true);
  });

  it('Language が空配列の参加者同士は Topic だけで判定され、共通 Language の Evidence は発生しない', () => {
    const outcomes = selectBridges({
      participants: [
        participant('a', ['open-source']),
        participant('b', ['open-source']),
      ],
    });

    const a = expectBridge(bridgeOf(outcomes, 'ptc_a'));
    expect(a.evidenceIds).toHaveLength(1);
  });

  it('同じ参加者 ID を重複指定すると型付きエラーになる', () => {
    const a = participant('a', ['open-source']);

    expectBridgeSelectionError(
      () => selectBridges({ participants: [a, a] }),
      'DUPLICATE_PARTICIPANT'
    );
  });
});

describe('参加者数の境界', () => {
  it('1 名では型付きエラーになる', () => {
    expectBridgeSelectionError(
      () =>
        selectBridges({ participants: [participant('a', ['open-source'])] }),
      'INVALID_PARTICIPANT_COUNT'
    );
  });

  it('7 名では型付きエラーになる', () => {
    const seven = Array.from({ length: 7 }, (_, index) =>
      participant(`p${index}`, ['open-source'])
    );

    expectBridgeSelectionError(
      () => selectBridges({ participants: seven }),
      'INVALID_PARTICIPANT_COUNT'
    );
  });
});

describe('決定性', () => {
  it('同じ入力を複数回実行しても同じ結果になる', () => {
    const participants = [
      participant('a', ['open-source']),
      participant('b', ['open-source']),
    ];

    expect(selectBridges({ participants })).toEqual(
      selectBridges({ participants })
    );
  });
});
