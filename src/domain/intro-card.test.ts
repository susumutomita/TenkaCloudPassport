import { describe, expect, it } from 'bun:test';
import {
  createIntroCard,
  INTRO_CARD_LINK_MAX_LENGTH,
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_MAX_THEMES,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_PHONE_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
  IntroCardError,
  type IntroCardField,
  validateIntroCardFieldValue,
} from './intro-card';
import { PUBLIC_PASSPORT_MAX_CLUES } from './passport';

function repeat(character: string, length: number): string {
  return character.repeat(length);
}

function captureError(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

/**
 * Issue 92: `IntroCardError.field` は保存失敗時に画面側がどの入力欄へ
 * focus するかの根拠になるため、すべての検証エラーで期待値を固定する。
 */
function expectIntroCardError(
  captured: unknown,
  code: IntroCardError['code'],
  field: IntroCardField
): void {
  expect(captured).toBeInstanceOf(IntroCardError);
  if (captured instanceof IntroCardError) {
    expect(captured.code).toBe(code);
    expect(captured.name).toBe('IntroCardError');
    expect(captured.field).toBe(field);
  }
}

describe('createIntroCard', () => {
  it('name だけを入力した場合、他のフィールドを持たないカードを作る', () => {
    const card = createIntroCard({ name: '田中太郎' });

    expect(card).toEqual({ name: '田中太郎' });
  });

  it('name を前後の空白ごと trim する', () => {
    const card = createIntroCard({ name: '  田中太郎  ' });

    expect(card.name).toBe('田中太郎');
  });

  it('全項目を入力すると、正規化した値を持つカードを作る', () => {
    const card = createIntroCard({
      name: '田中太郎',
      title: 'Engineer',
      organization: 'TenkaCloud',
      selfIntro: 'LT 登壇者です。',
      links: ['https://github.com/example', 'https://x.com/example'],
      email: 'taro@example.com',
      phone: '090-1234-5678',
    });

    expect(card).toEqual({
      name: '田中太郎',
      title: 'Engineer',
      organization: 'TenkaCloud',
      selfIntro: 'LT 登壇者です。',
      links: ['https://github.com/example', 'https://x.com/example'],
      email: 'taro@example.com',
      phone: '090-1234-5678',
    });
  });

  it('name が空文字の場合、NAME_REQUIRED を投げる', () => {
    const error = captureError(() => createIntroCard({ name: '' }));

    expectIntroCardError(error, 'NAME_REQUIRED', 'name');
  });

  it('name が空白のみの場合、NAME_REQUIRED を投げる', () => {
    const error = captureError(() => createIntroCard({ name: '   ' }));

    expectIntroCardError(error, 'NAME_REQUIRED', 'name');
  });

  it(`name が ${INTRO_CARD_NAME_MAX_LENGTH} 文字ちょうどの場合、受理する`, () => {
    const name = repeat('あ', INTRO_CARD_NAME_MAX_LENGTH);

    const card = createIntroCard({ name });

    expect(card.name).toBe(name);
  });

  it(`name が ${INTRO_CARD_NAME_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const name = repeat('あ', INTRO_CARD_NAME_MAX_LENGTH + 1);

    const error = captureError(() => createIntroCard({ name }));

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'name');
  });

  it('title・organization・selfIntro が空文字の場合、undefined へ正規化する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      title: '   ',
      organization: '',
      selfIntro: '  ',
    });

    expect(card.title).toBeUndefined();
    expect(card.organization).toBeUndefined();
    expect(card.selfIntro).toBeUndefined();
  });

  it(`title が ${INTRO_CARD_TITLE_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        title: repeat('あ', INTRO_CARD_TITLE_MAX_LENGTH + 1),
      })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'title');
  });

  it(`organization が ${INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        organization: repeat('あ', INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1),
      })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'organization');
  });

  it(`selfIntro が ${INTRO_CARD_SELF_INTRO_MAX_LENGTH} 文字ちょうどの場合、受理する`, () => {
    const selfIntro = repeat('あ', INTRO_CARD_SELF_INTRO_MAX_LENGTH);

    const card = createIntroCard({ name: '田中太郎', selfIntro });

    expect(card.selfIntro).toBe(selfIntro);
  });

  it(`selfIntro が ${INTRO_CARD_SELF_INTRO_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        selfIntro: repeat('あ', INTRO_CARD_SELF_INTRO_MAX_LENGTH + 1),
      })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'selfIntro');
  });

  it('links が空配列の場合、undefined へ正規化する', () => {
    const card = createIntroCard({ name: '田中太郎', links: [] });

    expect(card.links).toBeUndefined();
  });

  it('links の要素が空白のみの場合、除去したうえで残りを保持する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      links: ['https://example.com', '   ', ''],
    });

    expect(card.links).toEqual(['https://example.com']);
  });

  it('links の要素だけがすべて空白の場合、undefined へ正規化する', () => {
    const card = createIntroCard({ name: '田中太郎', links: ['  ', ''] });

    expect(card.links).toBeUndefined();
  });

  it(`links が ${INTRO_CARD_MAX_LINKS} 件ちょうどの場合、受理する`, () => {
    const links = Array.from(
      { length: INTRO_CARD_MAX_LINKS },
      (_, index) => `https://example.com/${index}`
    );

    const card = createIntroCard({ name: '田中太郎', links });

    expect(card.links).toEqual(links);
  });

  it(`links が ${INTRO_CARD_MAX_LINKS + 1} 件の場合、FIELD_TOO_LONG を投げる`, () => {
    const links = Array.from(
      { length: INTRO_CARD_MAX_LINKS + 1 },
      (_, index) => `https://example.com/${index}`
    );

    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', links })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'links');
  });

  it(`links の要素が ${INTRO_CARD_LINK_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const longLink = `https://example.com/${repeat('a', INTRO_CARD_LINK_MAX_LENGTH)}`;

    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', links: [longLink] })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'links');
  });

  it('links の要素が http/https で始まらない場合、INVALID_URL を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', links: ['ftp://example.com'] })
    );

    expectIntroCardError(error, 'INVALID_URL', 'links');
  });

  it('email が空文字の場合、undefined へ正規化する', () => {
    const card = createIntroCard({ name: '田中太郎', email: '  ' });

    expect(card.email).toBeUndefined();
  });

  it('email が x@y.z 形式の場合、受理する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      email: 'taro@example.com',
    });

    expect(card.email).toBe('taro@example.com');
  });

  it('email に @ が含まれない場合、INVALID_EMAIL を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', email: 'taro-example.com' })
    );

    expectIntroCardError(error, 'INVALID_EMAIL', 'email');
  });

  it('email にドメイン部の . がない場合、INVALID_EMAIL を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', email: 'taro@example' })
    );

    expectIntroCardError(error, 'INVALID_EMAIL', 'email');
  });

  it('phone が空文字の場合、undefined へ正規化する', () => {
    const card = createIntroCard({ name: '田中太郎', phone: '  ' });

    expect(card.phone).toBeUndefined();
  });

  it(`phone が ${INTRO_CARD_PHONE_MAX_LENGTH} 文字ちょうどの数字列の場合、受理する`, () => {
    const phone = repeat('0', INTRO_CARD_PHONE_MAX_LENGTH);

    const card = createIntroCard({ name: '田中太郎', phone });

    expect(card.phone).toBe(phone);
  });

  it(`phone が ${INTRO_CARD_PHONE_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        phone: repeat('0', INTRO_CARD_PHONE_MAX_LENGTH + 1),
      })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'phone');
  });

  it('phone に許可されていない文字（英字）を含む場合、INVALID_PHONE を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', phone: '090-abcd-5678' })
    );

    expectIntroCardError(error, 'INVALID_PHONE', 'phone');
  });

  it('phone の許可文字（数字・+・-・()・空白）をすべて受理する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      phone: '+81 (90) 1234-5678',
    });

    expect(card.phone).toBe('+81 (90) 1234-5678');
  });
});

describe('createIntroCard の全角・不可視文字の正規化（Issue 92: iOS 日本語キーボード対策）', () => {
  it('email に全角＠が混入している場合、正規化して半角として受理する（実機で報告された事象そのもの）', () => {
    const card = createIntroCard({
      name: '田中太郎',
      email: 'taro＠example.com',
    });

    expect(card.email).toBe('taro@example.com');
  });

  it('email に全角英数字が混入している場合、正規化して半角として受理する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      email: 'ｔａｒｏ@example.com',
    });

    expect(card.email).toBe('taro@example.com');
  });

  it('name にゼロ幅スペースが混入している場合、除去して保存する', () => {
    const card = createIntroCard({ name: '田中\u200B太郎' });

    expect(card.name).toBe('田中太郎');
  });

  it('name に半角カタカナが混入している場合、正規化して全角カタカナで保存する', () => {
    const card = createIntroCard({ name: '山田ﾀﾛｳ' });

    expect(card.name).toBe('山田タロウ');
  });

  it('phone に全角数字が混入している場合、正規化して半角で保存する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      phone: '０９０-１２３４-５６７８',
    });

    expect(card.phone).toBe('090-1234-5678');
  });

  it('links の要素に全角文字が混入している場合、正規化してから http/https 検証を通す', () => {
    const card = createIntroCard({
      name: '田中太郎',
      links: ['ｈｔｔｐｓ://example.com'],
    });

    expect(card.links).toEqual(['https://example.com']);
  });

  it('正規化で文字数が展開され上限を超える場合、FIELD_TOO_LONG を投げる（合字展開のエッジケース）', () => {
    // "㍻"（U+337B、SQUARE ERA NAME HEISEI）は NFKC 正規化で「平成」の 2 文字へ
    // 展開される。正規化前は 50 文字ちょうど（上限内）でも、正規化後は 51 文字になる。
    const name = `${repeat('あ', INTRO_CARD_NAME_MAX_LENGTH - 1)}㍻`;

    const error = captureError(() => createIntroCard({ name }));

    expectIntroCardError(error, 'FIELD_TOO_LONG', 'name');
  });

  it('selfIntro に ZWJ（U+200D）結合絵文字シーケンスが含まれる場合、分裂させず保存する（code-reviewer 指摘: ゼロ幅文字の一律除去が絵文字を壊す回帰防止）', () => {
    // 複数の人物絵文字を U+200D（ZERO WIDTH JOINER）でつないだ結合絵文字
    // シーケンス（例: 家族の絵文字）。U+200D を無条件除去すると、見た目が
    // 「1 つの家族」から「4 人がバラバラに並んだだけ」に変わってしまう。
    const familyEmoji = '👨‍👩‍👧‍👦';

    const card = createIntroCard({
      name: '田中太郎',
      selfIntro: `よろしくお願いします ${familyEmoji}`,
    });

    expect(card.selfIntro).toBe(`よろしくお願いします ${familyEmoji}`);
  });

  it('links に ZWJ（U+200D）を含む値がある場合も除去せずそのまま検証する（http/https 判定に影響しない）', () => {
    const card = createIntroCard({
      name: '田中太郎',
      links: [`https://example.com/${'👨‍👩'}`],
    });

    expect(card.links).toEqual([`https://example.com/${'👨‍👩'}`]);
  });
});

/**
 * Issue 93: 保存前（入力中・フォーカスアウト時）の 1 欄バリデーション。
 * `createIntroCard` と同じ private validator を再利用しているかどうかは、
 * 「保存時に FIELD_TOO_LONG/INVALID_* になるケースが、ここでも同じ
 * メッセージで返ってくる」ことで間接的に固定する（メッセージ文字列が
 * 2 箇所に分かれて drift する余地をなくす）。
 */
describe('validateIntroCardFieldValue', () => {
  it('name が空文字の場合、null を返す（保存前に急かさない）', () => {
    expect(
      validateIntroCardFieldValue({ field: 'name', value: '' })
    ).toBeNull();
  });

  it('name が空白のみの場合も null を返す', () => {
    expect(
      validateIntroCardFieldValue({ field: 'name', value: '   ' })
    ).toBeNull();
  });

  it(`name が ${INTRO_CARD_NAME_MAX_LENGTH + 1} 文字の場合、createIntroCard と同じ FIELD_TOO_LONG メッセージを返す`, () => {
    const name = repeat('あ', INTRO_CARD_NAME_MAX_LENGTH + 1);
    const thrown = captureError(() => createIntroCard({ name }));
    const liveMessage = validateIntroCardFieldValue({
      field: 'name',
      value: name,
    });

    expect(thrown).toBeInstanceOf(IntroCardError);
    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it('name が有効な場合、null を返す', () => {
    expect(
      validateIntroCardFieldValue({ field: 'name', value: '田中太郎' })
    ).toBeNull();
  });

  it('title が空文字の場合、null を返す（任意項目）', () => {
    expect(
      validateIntroCardFieldValue({ field: 'title', value: '' })
    ).toBeNull();
  });

  it(`title が ${INTRO_CARD_TITLE_MAX_LENGTH + 1} 文字の場合、createIntroCard と同じメッセージを返す`, () => {
    const title = repeat('あ', INTRO_CARD_TITLE_MAX_LENGTH + 1);
    const thrown = captureError(() =>
      createIntroCard({ name: '田中太郎', title })
    );
    const liveMessage = validateIntroCardFieldValue({
      field: 'title',
      value: title,
    });

    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it(`organization が ${INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1} 文字の場合、エラーメッセージを返す`, () => {
    const organization = repeat('あ', INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1);

    expect(
      validateIntroCardFieldValue({
        field: 'organization',
        value: organization,
      })
    ).not.toBeNull();
  });

  it(`selfIntro が ${INTRO_CARD_SELF_INTRO_MAX_LENGTH + 1} 文字の場合、エラーメッセージを返す`, () => {
    const selfIntro = repeat('あ', INTRO_CARD_SELF_INTRO_MAX_LENGTH + 1);

    expect(
      validateIntroCardFieldValue({ field: 'selfIntro', value: selfIntro })
    ).not.toBeNull();
  });

  it('email が空文字の場合、null を返す（任意項目）', () => {
    expect(
      validateIntroCardFieldValue({ field: 'email', value: '' })
    ).toBeNull();
  });

  it('email が不正な形式の場合、createIntroCard と同じメッセージを返す', () => {
    const thrown = captureError(() =>
      createIntroCard({ name: '田中太郎', email: 'not-an-email' })
    );
    const liveMessage = validateIntroCardFieldValue({
      field: 'email',
      value: 'not-an-email',
    });

    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it('email が正しい形式の場合、null を返す', () => {
    expect(
      validateIntroCardFieldValue({ field: 'email', value: 'taro@example.com' })
    ).toBeNull();
  });

  it('phone が空文字の場合、null を返す（任意項目）', () => {
    expect(
      validateIntroCardFieldValue({ field: 'phone', value: '' })
    ).toBeNull();
  });

  it('phone に許可されない文字（英字）を含む場合、createIntroCard と同じメッセージを返す', () => {
    const thrown = captureError(() =>
      createIntroCard({ name: '田中太郎', phone: 'abc' })
    );
    const liveMessage = validateIntroCardFieldValue({
      field: 'phone',
      value: 'abc',
    });

    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it('links が空文字の場合、null を返す（任意項目）', () => {
    expect(
      validateIntroCardFieldValue({ field: 'links', value: '' })
    ).toBeNull();
  });

  it('links が空白のみの場合、null を返す', () => {
    expect(
      validateIntroCardFieldValue({ field: 'links', value: '   ' })
    ).toBeNull();
  });

  it('links が http/https から始まらない場合、createIntroCard と同じメッセージを返す', () => {
    const thrown = captureError(() =>
      createIntroCard({ name: '田中太郎', links: ['example.com'] })
    );
    const liveMessage = validateIntroCardFieldValue({
      field: 'links',
      value: 'example.com',
    });

    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it(`links が ${INTRO_CARD_LINK_MAX_LENGTH + 1} 文字の場合、createIntroCard と同じメッセージを返す`, () => {
    const link = `https://example.com/${repeat('a', INTRO_CARD_LINK_MAX_LENGTH)}`;
    const thrown = captureError(() =>
      createIntroCard({ name: '田中太郎', links: [link] })
    );
    const liveMessage = validateIntroCardFieldValue({
      field: 'links',
      value: link,
    });

    expect(liveMessage).toBe((thrown as IntroCardError).message);
  });

  it('links が有効な URL の場合、null を返す', () => {
    expect(
      validateIntroCardFieldValue({
        field: 'links',
        value: 'https://github.com/example',
      })
    ).toBeNull();
  });

  it('links に全角文字が混入していても正規化してから検証する（Issue 92 と同じ正規化パイプライン）', () => {
    expect(
      validateIntroCardFieldValue({
        field: 'links',
        value: 'https://example.com/ｔａｒｏ',
      })
    ).toBeNull();
  });
});

describe('createIntroCard の themeIds（Issue 104: 端末内会話エージェント）', () => {
  it('themeIds を指定しない場合、themeIds を持たないカードを作る', () => {
    const card = createIntroCard({ name: '田中太郎' });

    expect(card.themeIds).toBeUndefined();
  });

  it('themeIds が空配列の場合、undefined へ正規化する', () => {
    const card = createIntroCard({ name: '田中太郎', themeIds: [] });

    expect(card.themeIds).toBeUndefined();
  });

  it('カタログに実在する themeIds を指定した場合、そのまま保持する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      themeIds: ['open-source', 'accessibility'],
    });

    expect(card.themeIds).toEqual(['open-source', 'accessibility']);
  });

  it(`themeIds が上限（${INTRO_CARD_MAX_THEMES} 件）ちょうどの場合、受理する`, () => {
    const card = createIntroCard({
      name: '田中太郎',
      themeIds: ['open-source', 'accessibility', 'information-security'],
    });

    expect(card.themeIds).toHaveLength(INTRO_CARD_MAX_THEMES);
  });

  it('INTRO_CARD_MAX_THEMES は Public Passport の PUBLIC_PASSPORT_MAX_CLUES と一致する（会話テーマとカタログ上限の drift を防ぐ）', () => {
    expect(INTRO_CARD_MAX_THEMES).toBe(PUBLIC_PASSPORT_MAX_CLUES);
  });

  it(`themeIds が上限（${INTRO_CARD_MAX_THEMES} 件）を超える場合、INVALID_THEME_IDS を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        themeIds: [
          'open-source',
          'accessibility',
          'information-security',
          'cloud-infrastructure',
        ],
      })
    );

    expect(error).toBeInstanceOf(IntroCardError);
    expect((error as IntroCardError).code).toBe('INVALID_THEME_IDS');
    expect((error as IntroCardError).field).toBeUndefined();
  });

  it('themeIds に重複がある場合、INVALID_THEME_IDS を投げる', () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        themeIds: ['open-source', 'open-source'],
      })
    );

    expect(error).toBeInstanceOf(IntroCardError);
    expect((error as IntroCardError).code).toBe('INVALID_THEME_IDS');
  });

  it('themeIds にカタログに存在しない ID が含まれる場合、INVALID_THEME_IDS を投げる', () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        themeIds: ['not-a-real-clue-id'],
      })
    );

    expect(error).toBeInstanceOf(IntroCardError);
    expect((error as IntroCardError).code).toBe('INVALID_THEME_IDS');
  });
});
