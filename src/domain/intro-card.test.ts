import { describe, expect, it } from 'bun:test';
import {
  createIntroCard,
  INTRO_CARD_LINK_MAX_LENGTH,
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_PHONE_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
  IntroCardError,
} from './intro-card';

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

function expectIntroCardError(
  captured: unknown,
  code: IntroCardError['code']
): void {
  expect(captured).toBeInstanceOf(IntroCardError);
  if (captured instanceof IntroCardError) {
    expect(captured.code).toBe(code);
    expect(captured.name).toBe('IntroCardError');
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

    expectIntroCardError(error, 'NAME_REQUIRED');
  });

  it('name が空白のみの場合、NAME_REQUIRED を投げる', () => {
    const error = captureError(() => createIntroCard({ name: '   ' }));

    expectIntroCardError(error, 'NAME_REQUIRED');
  });

  it(`name が ${INTRO_CARD_NAME_MAX_LENGTH} 文字ちょうどの場合、受理する`, () => {
    const name = repeat('あ', INTRO_CARD_NAME_MAX_LENGTH);

    const card = createIntroCard({ name });

    expect(card.name).toBe(name);
  });

  it(`name が ${INTRO_CARD_NAME_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const name = repeat('あ', INTRO_CARD_NAME_MAX_LENGTH + 1);

    const error = captureError(() => createIntroCard({ name }));

    expectIntroCardError(error, 'FIELD_TOO_LONG');
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

    expectIntroCardError(error, 'FIELD_TOO_LONG');
  });

  it(`organization が ${INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const error = captureError(() =>
      createIntroCard({
        name: '田中太郎',
        organization: repeat('あ', INTRO_CARD_ORGANIZATION_MAX_LENGTH + 1),
      })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG');
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

    expectIntroCardError(error, 'FIELD_TOO_LONG');
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

    expectIntroCardError(error, 'FIELD_TOO_LONG');
  });

  it(`links の要素が ${INTRO_CARD_LINK_MAX_LENGTH + 1} 文字の場合、FIELD_TOO_LONG を投げる`, () => {
    const longLink = `https://example.com/${repeat('a', INTRO_CARD_LINK_MAX_LENGTH)}`;

    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', links: [longLink] })
    );

    expectIntroCardError(error, 'FIELD_TOO_LONG');
  });

  it('links の要素が http/https で始まらない場合、INVALID_URL を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', links: ['ftp://example.com'] })
    );

    expectIntroCardError(error, 'INVALID_URL');
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

    expectIntroCardError(error, 'INVALID_EMAIL');
  });

  it('email にドメイン部の . がない場合、INVALID_EMAIL を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', email: 'taro@example' })
    );

    expectIntroCardError(error, 'INVALID_EMAIL');
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

    expectIntroCardError(error, 'FIELD_TOO_LONG');
  });

  it('phone に許可されていない文字（英字）を含む場合、INVALID_PHONE を投げる', () => {
    const error = captureError(() =>
      createIntroCard({ name: '田中太郎', phone: '090-abcd-5678' })
    );

    expectIntroCardError(error, 'INVALID_PHONE');
  });

  it('phone の許可文字（数字・+・-・()・空白）をすべて受理する', () => {
    const card = createIntroCard({
      name: '田中太郎',
      phone: '+81 (90) 1234-5678',
    });

    expect(card.phone).toBe('+81 (90) 1234-5678');
  });
});
