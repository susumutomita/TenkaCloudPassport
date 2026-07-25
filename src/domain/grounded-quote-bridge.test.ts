import { describe, expect, it } from 'bun:test';
import {
  AGENT_MODEL_QUOTE_MAX_CHARS,
  type GroundedQuoteBridgeInput,
  verifyGroundedQuoteBridge,
} from './grounded-quote-bridge';

const OWNER_TEXT =
  '週末は近所の低山を歩いています。仕事ではクラウド基盤の運用をしています。';
const PEER_TEXT =
  'アウトドア全般が好きで、最近はキャンプに行きます。普段は組み込み開発です。';

function input(
  overrides: Partial<GroundedQuoteBridgeInput> = {}
): GroundedQuoteBridgeInput {
  return {
    ownerProfileText: OWNER_TEXT,
    encounteredProfileText: PEER_TEXT,
    ownerQuote: '低山を歩いています',
    peerQuote: 'アウトドア全般が好き',
    ...overrides,
  };
}

describe('モデルが挙げた根拠引用の検証（Issue 147）', () => {
  it('両方の引用が入力文にそのまま存在すれば受理する', () => {
    const verified = verifyGroundedQuoteBridge(input());

    expect(verified).toEqual({
      ownerQuote: '低山を歩いています',
      peerQuote: 'アウトドア全般が好き',
    });
  });

  it('前後の空白は落としてから照合する', () => {
    const verified = verifyGroundedQuoteBridge(
      input({ ownerQuote: '  低山を歩いています  ' })
    );

    expect(verified?.ownerQuote).toBe('低山を歩いています');
  });

  it('入力文に存在しない引用は、モデルの創作として拒否する', () => {
    expect(
      verifyGroundedQuoteBridge(input({ ownerQuote: '登山が趣味です' }))
    ).toBeNull();
  });

  it('相手側の文にしか無い引用を自分側の引用として出したら拒否する', () => {
    expect(
      verifyGroundedQuoteBridge(input({ ownerQuote: 'アウトドア全般が好き' }))
    ).toBeNull();
  });

  it('空文字・空白だけの引用は拒否する', () => {
    expect(verifyGroundedQuoteBridge(input({ ownerQuote: '' }))).toBeNull();
    expect(verifyGroundedQuoteBridge(input({ peerQuote: '   ' }))).toBeNull();
  });

  it('上限文字数を超える引用は拒否する（自己紹介文の丸ごと転記を防ぐ）', () => {
    const longText = 'あ'.repeat(AGENT_MODEL_QUOTE_MAX_CHARS + 1);

    expect(
      verifyGroundedQuoteBridge(
        input({ ownerProfileText: longText, ownerQuote: longText })
      )
    ).toBeNull();
  });

  it('上限ちょうどの引用は受理する', () => {
    const exactText = 'あ'.repeat(AGENT_MODEL_QUOTE_MAX_CHARS);

    expect(
      verifyGroundedQuoteBridge(
        input({ ownerProfileText: exactText, ownerQuote: exactText })
      )
    ).not.toBeNull();
  });

  it('プロフィール文が無ければ、引用の根拠を確かめられないので拒否する', () => {
    expect(
      verifyGroundedQuoteBridge(input({ ownerProfileText: undefined }))
    ).toBeNull();
    expect(
      verifyGroundedQuoteBridge(input({ encounteredProfileText: undefined }))
    ).toBeNull();
  });

  it('メールアドレスを含む引用は、入力文にあっても表示しない', () => {
    const textWithEmail = '連絡は a@example.com までどうぞ。';

    expect(
      verifyGroundedQuoteBridge(
        input({
          ownerProfileText: textWithEmail,
          ownerQuote: 'a@example.com',
        })
      )
    ).toBeNull();
  });

  it('URL を含む引用は、入力文にあっても表示しない', () => {
    const textWithUrl = 'ブログは https://example.com にあります。';

    expect(
      verifyGroundedQuoteBridge(
        input({
          ownerProfileText: textWithUrl,
          ownerQuote: 'https://example.com',
        })
      )
    ).toBeNull();
  });

  it('電話番号らしい数字の並びを含む引用は表示しない', () => {
    const textWithPhone = '番号は 09012345678 です。';

    expect(
      verifyGroundedQuoteBridge(
        input({ ownerProfileText: textWithPhone, ownerQuote: '09012345678' })
      )
    ).toBeNull();
  });

  it('年号のような短い数字は、連絡先とみなさず通す', () => {
    const textWithYear = '2020 年からクラウドをやっています。';

    expect(
      verifyGroundedQuoteBridge(
        input({
          ownerProfileText: textWithYear,
          ownerQuote: '2020 年からクラウド',
        })
      )
    ).not.toBeNull();
  });

  it('制御文字を含む引用は拒否する', () => {
    const textWithControl = 'クラウド\u0000基盤';

    expect(
      verifyGroundedQuoteBridge(
        input({
          ownerProfileText: textWithControl,
          ownerQuote: 'クラウド\u0000基盤',
        })
      )
    ).toBeNull();
  });

  it('文字列ではない値は拒否する', () => {
    expect(
      verifyGroundedQuoteBridge({
        ownerProfileText: OWNER_TEXT,
        encounteredProfileText: PEER_TEXT,
        ownerQuote: 42,
        peerQuote: 'アウトドア全般が好き',
      })
    ).toBeNull();
  });
});
