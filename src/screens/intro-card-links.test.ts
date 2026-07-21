import { describe, expect, it } from 'bun:test';
import { INTRO_CARD_MAX_LINKS } from '../domain/intro-card';
import {
  addOtherLink,
  buildIntroCardLinks,
  canAddOtherLink,
  classifyIntroCardLinks,
  type IntroCardLinksDraft,
  nonEmptyLinkCount,
  normalizeNamedLink,
  removeOtherLink,
  updateOtherLink,
} from './intro-card-links';

function draft(
  overrides: Partial<IntroCardLinksDraft> = {}
): IntroCardLinksDraft {
  return {
    x: '',
    github: '',
    linkedin: '',
    portfolio: '',
    otherLinks: [],
    ...overrides,
  };
}

describe('normalizeNamedLink（Issue 90: ユーザー名だけの入力を URL へ補完する）', () => {
  it('http:// でも https:// でもない入力は、サービス別 URL prefix を補って返す', () => {
    expect(normalizeNamedLink('x', 'taro_tanaka')).toBe(
      'https://x.com/taro_tanaka'
    );
    expect(normalizeNamedLink('github', 'taro-tanaka')).toBe(
      'https://github.com/taro-tanaka'
    );
    expect(normalizeNamedLink('linkedin', 'taro-tanaka')).toBe(
      'https://www.linkedin.com/in/taro-tanaka'
    );
  });

  it('すでに http:// または https:// から始まる入力はそのまま返す（大文字小文字を問わない）', () => {
    expect(normalizeNamedLink('x', 'https://x.com/taro_tanaka')).toBe(
      'https://x.com/taro_tanaka'
    );
    expect(normalizeNamedLink('github', 'HTTP://github.com/taro-tanaka')).toBe(
      'HTTP://github.com/taro-tanaka'
    );
  });

  it('前後の空白は trim してから判定・補完する', () => {
    expect(normalizeNamedLink('x', '  taro_tanaka  ')).toBe(
      'https://x.com/taro_tanaka'
    );
  });

  it('空文字・空白のみの入力は空文字のまま返す（未入力欄として扱う）', () => {
    expect(normalizeNamedLink('x', '')).toBe('');
    expect(normalizeNamedLink('github', '   ')).toBe('');
  });

  it('X の伝統的な @ 付きハンドルは @ を落としてから補完する（code-reviewer 指摘）', () => {
    expect(normalizeNamedLink('x', '@taro_tanaka')).toBe(
      'https://x.com/taro_tanaka'
    );
  });

  it('スキームを省いてドメインごと貼り付けた入力は、ドメインを二重にせずスキームだけ補う（code-reviewer 指摘）', () => {
    expect(normalizeNamedLink('x', 'x.com/taro_tanaka')).toBe(
      'https://x.com/taro_tanaka'
    );
    expect(normalizeNamedLink('x', 'twitter.com/taro_tanaka')).toBe(
      'https://twitter.com/taro_tanaka'
    );
    expect(normalizeNamedLink('github', 'www.github.com/taro-tanaka')).toBe(
      'https://www.github.com/taro-tanaka'
    );
    expect(normalizeNamedLink('linkedin', 'linkedin.com/in/taro-tanaka')).toBe(
      'https://linkedin.com/in/taro-tanaka'
    );
  });

  it('サービスのドメインちょうど（パスなし）の貼り付けもスキームだけ補う', () => {
    expect(normalizeNamedLink('github', 'github.com')).toBe(
      'https://github.com'
    );
  });
});

describe('buildIntroCardLinks（保存時に domain へ渡す links 配列の組み立て）', () => {
  it('4 名前付き欄がすべて空なら空配列を返す', () => {
    expect(buildIntroCardLinks(draft())).toEqual([]);
  });

  it('名前付き欄はサービス別 prefix で補完し、Portfolio は補完しない（URL のみ前提）', () => {
    const links = buildIntroCardLinks(
      draft({
        x: 'taro',
        github: 'taro',
        linkedin: 'taro',
        portfolio: 'https://taro.example.com',
      })
    );
    expect(links).toEqual([
      'https://x.com/taro',
      'https://github.com/taro',
      'https://www.linkedin.com/in/taro',
      'https://taro.example.com',
    ]);
  });

  it('自由リンクは trim するだけで補完しない', () => {
    const links = buildIntroCardLinks(
      draft({ otherLinks: ['  https://example.com  ', ''] })
    );
    expect(links).toEqual(['https://example.com']);
  });

  it('空欄（名前付き・自由リンクの両方）は結果から除外する', () => {
    const links = buildIntroCardLinks(
      draft({
        x: '',
        github: '   ',
        otherLinks: ['', '  ', 'https://example.com'],
      })
    );
    expect(links).toEqual(['https://example.com']);
  });
});

describe('nonEmptyLinkCount / canAddOtherLink（追加ボタンの活性判定と件数表示）', () => {
  it('空欄を数えず、実際に保存される件数を返す', () => {
    expect(
      nonEmptyLinkCount(
        draft({ x: 'taro', otherLinks: ['', 'https://a.example.com'] })
      )
    ).toBe(2);
  });

  it('上限未満なら追加ボタンを有効にする', () => {
    expect(canAddOtherLink(draft({ x: 'taro', github: 'taro' }))).toBe(true);
  });

  it('上限（INTRO_CARD_MAX_LINKS）に達したら追加ボタンを無効にする', () => {
    const full = draft({
      x: 'a',
      github: 'b',
      linkedin: 'c',
      portfolio: 'https://d.example.com',
      otherLinks: ['https://e.example.com'],
    });
    expect(nonEmptyLinkCount(full)).toBe(INTRO_CARD_MAX_LINKS);
    expect(canAddOtherLink(full)).toBe(false);
  });
});

describe('addOtherLink / removeOtherLink / updateOtherLink（自由リンク欄の追加・削除・更新）', () => {
  it('addOtherLink は末尾に空文字の行を 1 件追加する', () => {
    expect(addOtherLink([])).toEqual(['']);
    expect(addOtherLink(['https://a.example.com'])).toEqual([
      'https://a.example.com',
      '',
    ]);
  });

  it('removeOtherLink は指定 index の行だけを取り除き、他の行の順序は保つ', () => {
    expect(
      removeOtherLink(
        [
          'https://a.example.com',
          'https://b.example.com',
          'https://c.example.com',
        ],
        1
      )
    ).toEqual(['https://a.example.com', 'https://c.example.com']);
  });

  it('updateOtherLink は指定 index の値だけを差し替える', () => {
    expect(
      updateOtherLink(
        ['https://a.example.com', 'https://b.example.com'],
        0,
        'https://z.example.com'
      )
    ).toEqual(['https://z.example.com', 'https://b.example.com']);
  });

  it('元の配列を破壊的に変更しない（呼び出し側の再 render に安全）', () => {
    const original = ['https://a.example.com'];
    addOtherLink(original);
    removeOtherLink(original, 0);
    updateOtherLink(original, 0, 'https://z.example.com');
    expect(original).toEqual(['https://a.example.com']);
  });
});

describe('classifyIntroCardLinks（保存済み links を編集画面の欄へ逆分類する）', () => {
  it('保存済み links が空なら全欄が空になる', () => {
    expect(classifyIntroCardLinks([])).toEqual({
      x: '',
      github: '',
      linkedin: '',
      portfolio: '',
      otherLinks: [],
    });
  });

  it('X（x.com・twitter.com どちらも）・GitHub・LinkedIn の hostname を対応欄へ割り当てる', () => {
    expect(
      classifyIntroCardLinks([
        'https://x.com/taro',
        'https://twitter.com/jiro',
        'https://github.com/taro',
        'https://www.linkedin.com/in/taro',
      ])
    ).toEqual({
      x: 'https://x.com/taro',
      github: 'https://github.com/taro',
      linkedin: 'https://www.linkedin.com/in/taro',
      portfolio: '',
      otherLinks: ['https://twitter.com/jiro'],
    });
  });

  it('同一サービスが 2 件以上ある場合、最初の 1 件だけを欄に割り当て、残りは自由リンクへ回す', () => {
    const classified = classifyIntroCardLinks([
      'https://github.com/taro',
      'https://github.com/taro-side-project',
    ]);
    expect(classified.github).toBe('https://github.com/taro');
    expect(classified.otherLinks).toEqual([
      'https://github.com/taro-side-project',
    ]);
  });

  it('未知サービス（Portfolio に相当するものを含む）は自由リンクへ回し、Portfolio 欄は常に空で始まる', () => {
    const classified = classifyIntroCardLinks([
      'https://taro.example.com',
      'https://github.com/taro',
    ]);
    expect(classified.portfolio).toBe('');
    expect(classified.otherLinks).toEqual(['https://taro.example.com']);
    expect(classified.github).toBe('https://github.com/taro');
  });

  it('URL として解析できない値（想定外データ）も自由リンクへ回して破棄しない', () => {
    const classified = classifyIntroCardLinks(['not-a-valid-url']);
    expect(classified.otherLinks).toEqual(['not-a-valid-url']);
  });
});
