import { describe, expect, it } from 'bun:test';
import {
  ConversationExampleError,
  parseConversationExampleTurn,
} from './conversation-example';

function expectInvalidTurnOutput(action: () => unknown): void {
  try {
    action();
    throw new Error('ConversationExampleError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ConversationExampleError);
    if (!(error instanceof ConversationExampleError)) throw error;
    expect(error.code).toBe('INVALID_OUTPUT');
  }
}

describe('parseConversationExampleTurn（Issue 169 のターン毎 fail-closed 出力契約）', () => {
  it('speaker は呼び出し側の交互スケジュールから決め、text だけを検証する', () => {
    expect(
      parseConversationExampleTurn({ text: '最近触った OSS は？' }, 'owner', [])
    ).toEqual({ speaker: 'owner', text: '最近触った OSS は？' });
    expect(
      parseConversationExampleTurn({ text: '小さな CLI です' }, 'peer', [])
    ).toEqual({ speaker: 'peer', text: '小さな CLI です' });
  });

  it('speaker field を Native 応答から受理せず、追加 Field も拒否する', () => {
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(
        { speaker: 'peer', text: 'こんにちは' },
        'owner',
        []
      )
    );
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(
        { text: 'こんにちは', extra: true },
        'owner',
        []
      )
    );
  });

  it('空文字、81 文字、改行、連絡先らしい本文を拒否する', () => {
    for (const text of [
      '   ',
      'あ'.repeat(81),
      '1 行目\n2 行目',
      '連絡は a@example.com へ',
      'https://example.com を見てください',
      '電話は 090-1234-5678 です',
    ]) {
      expectInvalidTurnOutput(() =>
        parseConversationExampleTurn({ text }, 'owner', [])
      );
    }
  });

  it('前後の空白だけを取り除く', () => {
    expect(
      parseConversationExampleTurn({ text: '  質問です  ' }, 'owner', [])
    ).toEqual({ speaker: 'owner', text: '質問です' });
  });

  it('Getter を実行せず、型違い・null を拒否する', () => {
    let getterCalls = 0;
    const accessorTurn: Record<string, unknown> = Object.create(null);
    Object.defineProperty(accessorTurn, 'text', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'こんにちは';
      },
    });
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(accessorTurn, 'owner', [])
    );
    expect(getterCalls).toBe(0);
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(null, 'owner', [])
    );
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn({ text: 42 }, 'owner', [])
    );
  });

  it('owner 実機観測（Issue 169）: transcript のいずれかと完全一致する繰り返しを拒否する', () => {
    const transcript = [
      { speaker: 'owner' as const, text: '週末の過ごし方について教えて下さい' },
      { speaker: 'peer' as const, text: '近くの山を歩くのが好きです' },
    ];

    // 直前ターン（peer）との一致だけでなく、話者を問わず transcript 全体との
    // 完全一致（trim 後）を拒否する（1 ターン目との一致も検出する）。
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(
        { text: '週末の過ごし方について教えて下さい' },
        'owner',
        transcript
      )
    );
    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(
        { text: '  近くの山を歩くのが好きです  ' },
        'peer',
        transcript
      )
    );
  });

  it('話者が異なっていても、transcript 中の別話者の発話と完全一致すれば拒否する', () => {
    // レビュー指摘の回帰テスト: 上のテストは「同じ話者が自分の過去発話を繰り返す」
    // ケースだけを検証していた。Guard は話者を問わず transcript 全体を見る設計
    // （ADR-0051）のため、話者が異なる完全一致（owner の発話を peer が繰り返す）
    // も拒否されることを固定する。
    const transcript = [
      { speaker: 'owner' as const, text: '週末の過ごし方について教えて下さい' },
    ];

    expectInvalidTurnOutput(() =>
      parseConversationExampleTurn(
        { text: '週末の過ごし方について教えて下さい' },
        'peer',
        transcript
      )
    );
  });

  it('trim 後に完全一致しない、似ているだけの本文は受理する', () => {
    const transcript = [
      { speaker: 'owner' as const, text: '週末の過ごし方について教えて下さい' },
    ];

    expect(
      parseConversationExampleTurn(
        { text: '週末はどんなことをしていますか？' },
        'peer',
        transcript
      )
    ).toEqual({ speaker: 'peer', text: '週末はどんなことをしていますか？' });
  });
});
