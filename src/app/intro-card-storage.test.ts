import { afterEach, describe, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { IntroCard } from '../domain/intro-card';
import { ExpoFileSystemIntroCardStorageAdapter } from './expo-file-system-intro-card-storage';
import {
  EMPTY_INTRO_CARD_DRAFT_FIELDS,
  type IntroCardDraftFields,
  IntroCardStorageError,
  type IntroCardStoragePort,
  isEmptyIntroCardDraft,
  UnavailableIntroCardStorageAdapter,
} from './intro-card-storage';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  temporaryDirectory as newTemporaryDirectory,
  removeTemporaryDirectory,
  WriteFailingProfileDocument,
  WriteFailingWebStorage,
} from './storage-test-kit';
import {
  INTRO_CARD_DRAFT_STORAGE_KEY,
  INTRO_CARD_STORAGE_KEY,
  WebIntroCardStorageAdapter,
} from './web-intro-card-storage';

/** Native adapter のテストで使う、確定カードとは別ファイルへ書く下書き用 document。 */
function draftDocumentIn(directory: string): BunProfileDocument {
  return new BunProfileDocument(path.join(directory, 'intro-card-draft.json'));
}

function draft(): IntroCardDraftFields {
  return {
    ...EMPTY_INTRO_CARD_DRAFT_FIELDS,
    name: '田中太郎',
    title: 'Eng',
    otherLinks: ['https://example.com/a'],
  };
}

const temporaryRoots: string[] = [];

function temporaryDirectory(): string {
  const directory = newTemporaryDirectory();
  temporaryRoots.push(directory);
  return directory;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    removeTemporaryDirectory(root);
  }
});

function card(): IntroCard {
  return {
    name: '田中太郎',
    title: 'Engineer',
    selfIntro: 'LT 登壇者です。',
    links: ['https://github.com/example'],
  };
}

async function expectStorageError(
  action: () => Promise<unknown>,
  code: IntroCardStorageError['code']
): Promise<void> {
  try {
    await action();
    throw new Error('IntroCardStorageError が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(IntroCardStorageError);
    if (error instanceof IntroCardStorageError) {
      expect(error.code).toBe(code);
      expect(error.cause).toBeDefined();
    }
  }
}

async function saveAndRestore(storage: IntroCardStoragePort): Promise<void> {
  expect(await storage.load()).toBeNull();
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
  await storage.save(card());
  expect(await storage.load()).toEqual(card());
  const usage = await storage.inspect();
  expect(usage.count).toBe(1);
  expect(usage.bytes).toBeGreaterThan(0);
  await storage.remove();
  await storage.remove();
  expect(await storage.load()).toBeNull();
  expect(await storage.inspect()).toEqual({ count: 0, bytes: 0 });
}

describe('Intro Card Storage adapter', () => {
  it('file-backed localStorage 相当へ明示保存した Intro Card だけを復元する', async () => {
    const storage = new WebIntroCardStorageAdapter(
      new FileBackedWebStorage(temporaryDirectory())
    );

    await saveAndRestore(storage);
  });

  it('実ファイル I/O を使う Native adapter で明示保存した Intro Card だけを復元する', async () => {
    const directory = temporaryDirectory();
    const document = new BunProfileDocument(
      path.join(directory, 'intro-card.json')
    );
    const storage = new ExpoFileSystemIntroCardStorageAdapter(
      document,
      draftDocumentIn(directory)
    );

    await saveAndRestore(storage);
  });

  it('Web と Native の壊れた JSON を INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(INTRO_CARD_STORAGE_KEY, '{');
    const nativePath = path.join(temporaryDirectory(), 'intro-card.json');
    writeFileSync(nativePath, '{', 'utf8');

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          new BunProfileDocument(nativePath),
          null
        ).load(),
      'INVALID_DATA'
    );
  });

  it('name を欠いた保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(INTRO_CARD_STORAGE_KEY, JSON.stringify({ title: 'x' }));

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('links が文字列配列ではない保存データを INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(
      INTRO_CARD_STORAGE_KEY,
      JSON.stringify({ name: '田中太郎', links: 'not-an-array' })
    );

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('フィールド上限を超える保存データも createIntroCard の検証で INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(
      INTRO_CARD_STORAGE_KEY,
      JSON.stringify({ name: 'あ'.repeat(51) })
    );

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).load(),
      'INVALID_DATA'
    );
  });

  it('createIntroCard の検証に違反する Card を保存しようとすると INVALID_DATA を投げる（型を経由しない誤用への防御）', async () => {
    const invalidCard: IntroCard = { name: '' };

    await expectStorageError(
      () =>
        new WebIntroCardStorageAdapter(
          new FileBackedWebStorage(temporaryDirectory())
        ).save(invalidCard),
      'INVALID_DATA'
    );
  });

  it('Storage 媒体がない場合は UNAVAILABLE を返す', async () => {
    await expectStorageError(
      () => new WebIntroCardStorageAdapter(null).load(),
      'UNAVAILABLE'
    );
    await expectStorageError(
      () => new ExpoFileSystemIntroCardStorageAdapter(null, null).save(card()),
      'UNAVAILABLE'
    );
    const unavailable = new UnavailableIntroCardStorageAdapter(
      new Error('OS の保存領域を開けません。')
    );
    await expectStorageError(() => unavailable.load(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.save(card()), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.inspect(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.remove(), 'UNAVAILABLE');
    await expectStorageError(() => unavailable.loadDraft(), 'UNAVAILABLE');
    await expectStorageError(
      () => unavailable.saveDraft(draft()),
      'UNAVAILABLE'
    );
    await expectStorageError(() => unavailable.clearDraft(), 'UNAVAILABLE');
  });

  it('Native の下書き Storage 媒体がない場合は UNAVAILABLE を返す（確定カード用 document はあっても下書き用が無ければ拒否する）', async () => {
    const document = new BunProfileDocument(
      path.join(temporaryDirectory(), 'intro-card.json')
    );
    const storage = new ExpoFileSystemIntroCardStorageAdapter(document, null);

    await expectStorageError(() => storage.loadDraft(), 'UNAVAILABLE');
    await expectStorageError(() => storage.saveDraft(draft()), 'UNAVAILABLE');
    await expectStorageError(() => storage.clearDraft(), 'UNAVAILABLE');
  });

  it('実ファイルの読込失敗と書込失敗を区別して返す', async () => {
    const webRoot = temporaryDirectory();
    const failure = new Error('write failure');

    await expectStorageError(
      () =>
        new WebIntroCardStorageAdapter(
          new WriteFailingWebStorage(webRoot, failure)
        ).save(card()),
      'WRITE_FAILED'
    );

    const missingParent = path.join(
      temporaryDirectory(),
      'missing',
      'intro-card.json'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          new WriteFailingProfileDocument(missingParent, failure),
          null
        ).save(card()),
      'WRITE_FAILED'
    );
  });

  it('Native 使用量は OS が size を返さない場合も実内容の Byte 数を返す', async () => {
    const filePath = path.join(temporaryDirectory(), 'size-unknown.json');
    const delegate = new BunProfileDocument(filePath);
    await delegate.write(JSON.stringify(card()));
    const sizeUnknownDocument = {
      get exists(): boolean {
        return delegate.exists;
      },
      get size(): null {
        return null;
      },
      text: () => delegate.text(),
      write: (content: string) => delegate.write(content),
      delete: () => delegate.delete(),
    };
    const storage = new ExpoFileSystemIntroCardStorageAdapter(
      sizeUnknownDocument,
      null
    );

    const usage = await storage.inspect();

    expect(usage.count).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });

  it('isEmptyIntroCardDraft は全欄空のときだけ true を返す', () => {
    expect(isEmptyIntroCardDraft(EMPTY_INTRO_CARD_DRAFT_FIELDS)).toBe(true);
    expect(
      isEmptyIntroCardDraft({ ...EMPTY_INTRO_CARD_DRAFT_FIELDS, name: '田中' })
    ).toBe(false);
    expect(
      isEmptyIntroCardDraft({
        ...EMPTY_INTRO_CARD_DRAFT_FIELDS,
        otherLinks: ['https://example.com'],
      })
    ).toBe(false);
  });

  it('isEmptyIntroCardDraft は空白文字だけの欄を空扱いにする（code-reviewer 指摘: 誤って「値あり」判定しない）', () => {
    expect(
      isEmptyIntroCardDraft({ ...EMPTY_INTRO_CARD_DRAFT_FIELDS, name: '   ' })
    ).toBe(true);
    expect(
      isEmptyIntroCardDraft({
        ...EMPTY_INTRO_CARD_DRAFT_FIELDS,
        linkX: '　',
      })
    ).toBe(true);
  });

  it('isEmptyIntroCardDraft は otherLinks が空文字の行を含むだけでも「値あり」とみなす（自由リンク追加ボタンで増やした空行を保持する意図的な仕様）', () => {
    expect(
      isEmptyIntroCardDraft({
        ...EMPTY_INTRO_CARD_DRAFT_FIELDS,
        otherLinks: [''],
      })
    ).toBe(false);
  });

  async function draftAndRestore(storage: IntroCardStoragePort): Promise<void> {
    expect(await storage.loadDraft()).toBeNull();
    await storage.saveDraft(draft());
    expect(await storage.loadDraft()).toEqual(draft());
    await storage.clearDraft();
    await storage.clearDraft();
    expect(await storage.loadDraft()).toBeNull();
  }

  it('file-backed localStorage 相当へ明示保存した下書きだけを復元し、確定カードとは別 key に置く', async () => {
    const root = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(root);
    const storage = new WebIntroCardStorageAdapter(webStorage);

    await storage.save(card());
    await draftAndRestore(storage);

    // 下書きを clearDraft しても確定カードは影響を受けない（別 key の証拠）。
    expect(await storage.load()).toEqual(card());
    expect(webStorage.getItem(INTRO_CARD_STORAGE_KEY)).not.toBeNull();
  });

  it('実ファイル I/O を使う Native adapter で明示保存した下書きだけを復元し、確定カードとは別ファイルに置く', async () => {
    const directory = temporaryDirectory();
    const document = new BunProfileDocument(
      path.join(directory, 'intro-card.json')
    );
    const draftDocument = draftDocumentIn(directory);
    const storage = new ExpoFileSystemIntroCardStorageAdapter(
      document,
      draftDocument
    );

    await storage.save(card());
    await draftAndRestore(storage);

    expect(await storage.load()).toEqual(card());
    expect(document.exists).toBe(true);
  });

  it('Web と Native の壊れた下書き JSON は握り潰さず INVALID_DATA として拒否する（呼び出し側で握り潰す方針）', async () => {
    const webRoot = temporaryDirectory();
    const webStorage = new FileBackedWebStorage(webRoot);
    webStorage.setItem(INTRO_CARD_DRAFT_STORAGE_KEY, '{');
    const draftPath = path.join(temporaryDirectory(), 'intro-card-draft.json');
    writeFileSync(draftPath, '{', 'utf8');

    await expectStorageError(
      () => new WebIntroCardStorageAdapter(webStorage).loadDraft(),
      'INVALID_DATA'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          null,
          new BunProfileDocument(draftPath)
        ).loadDraft(),
      'INVALID_DATA'
    );
  });

  it('下書きの必須フィールドが文字列でない、または otherLinks が文字列配列でない場合は INVALID_DATA として拒否する', async () => {
    const webRoot = temporaryDirectory();
    const missingFieldStorage = new FileBackedWebStorage(webRoot);
    missingFieldStorage.setItem(
      INTRO_CARD_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...EMPTY_INTRO_CARD_DRAFT_FIELDS, name: 42 })
    );
    await expectStorageError(
      () => new WebIntroCardStorageAdapter(missingFieldStorage).loadDraft(),
      'INVALID_DATA'
    );

    const badOtherLinksStorage = new FileBackedWebStorage(temporaryDirectory());
    badOtherLinksStorage.setItem(
      INTRO_CARD_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...EMPTY_INTRO_CARD_DRAFT_FIELDS, otherLinks: 'x' })
    );
    await expectStorageError(
      () => new WebIntroCardStorageAdapter(badOtherLinksStorage).loadDraft(),
      'INVALID_DATA'
    );

    const nonObjectStorage = new FileBackedWebStorage(temporaryDirectory());
    nonObjectStorage.setItem(INTRO_CARD_DRAFT_STORAGE_KEY, '"just a string"');
    await expectStorageError(
      () => new WebIntroCardStorageAdapter(nonObjectStorage).loadDraft(),
      'INVALID_DATA'
    );
  });

  it('下書きの読込・書込に失敗した場合は READ_FAILED / WRITE_FAILED を返す', async () => {
    const failure = new Error('write failure');
    await expectStorageError(
      () =>
        new WebIntroCardStorageAdapter(
          new WriteFailingWebStorage(temporaryDirectory(), failure)
        ).saveDraft(draft()),
      'WRITE_FAILED'
    );

    const missingParent = path.join(
      temporaryDirectory(),
      'missing',
      'intro-card-draft.json'
    );
    await expectStorageError(
      () =>
        new ExpoFileSystemIntroCardStorageAdapter(
          null,
          new WriteFailingProfileDocument(missingParent, failure)
        ).saveDraft(draft()),
      'WRITE_FAILED'
    );
  });
});
