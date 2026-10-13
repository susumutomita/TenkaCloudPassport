import { describe, expect, it } from 'bun:test';
import { LOCALES, type Locale } from './locale';
import { MESSAGES } from './messages';

/**
 * Issue 15: 型（`Record<Locale, AppMessages>`）だけでは「値が空文字列」「`en` が `ja` の
 * コピーのまま」までは検出できないため、実行時にも Key 集合の一致・非空・翻訳差分を
 * 確認する。既存の Screen Accessibility テストが検査していた正確な文言のピン留めも、
 * ここへ集約する（`docs/design/i18n-and-accessibility.md` のテスト戦略）。
 */

type Leaf = string | ((...args: never[]) => string);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectLeafPaths(node: unknown, prefix: string): string[] {
  if (typeof node === 'string' || typeof node === 'function') {
    return [prefix];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, index) =>
      collectLeafPaths(item, `${prefix}.${index}`)
    );
  }
  if (isPlainObject(node)) {
    return Object.keys(node).flatMap((key) =>
      collectLeafPaths(node[key], prefix ? `${prefix}.${key}` : key)
    );
  }
  throw new Error(`未対応の Message 型です: ${prefix}`);
}

function readPath(node: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    return isPlainObject(current) ? current[key] : undefined;
  }, node);
}

/** 代表的な引数でパラメータ化関数を呼び、非空の文字列を返すことだけを確認する。 */
function sampleCall(fn: (...args: never[]) => string): string {
  const arity = fn.length;
  const args = Array.from({ length: arity }, (_, index) =>
    index === 0 ? 1 : index === 1 ? 2 : true
  );
  return (fn as (...values: unknown[]) => string)(...args);
}

describe('Message Catalog（src/app/i18n/messages.ts）', () => {
  it('ja と en は完全に同じ Leaf Key 集合を持つ', () => {
    const jaPaths = collectLeafPaths(MESSAGES.ja, '').sort();
    const enPaths = collectLeafPaths(MESSAGES.en, '').sort();

    expect(enPaths).toEqual(jaPaths);
  });

  it.each([
    ...LOCALES,
  ])('%s のすべての文字列 Leaf は空文字列でない', (locale: Locale) => {
    const paths = collectLeafPaths(MESSAGES[locale], '');
    for (const path of paths) {
      const leaf = readPath(MESSAGES[locale], path) as Leaf;
      const text =
        typeof leaf === 'function'
          ? sampleCall(leaf as (...args: never[]) => string)
          : leaf;
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('ja と en は少なくとも半分以上の Leaf で異なる文字列を持つ（コピーではなく翻訳されている）', () => {
    const paths = collectLeafPaths(MESSAGES.ja, '');
    let differing = 0;
    for (const path of paths) {
      const jaLeaf = readPath(MESSAGES.ja, path) as Leaf;
      const enLeaf = readPath(MESSAGES.en, path) as Leaf;
      const jaText =
        typeof jaLeaf === 'function'
          ? sampleCall(jaLeaf as (...args: never[]) => string)
          : jaLeaf;
      const enText =
        typeof enLeaf === 'function'
          ? sampleCall(enLeaf as (...args: never[]) => string)
          : enLeaf;
      if (jaText !== enText) differing += 1;
    }
    expect(differing).toBeGreaterThan(paths.length / 2);
  });

  it('パラメータ化関数は引数を文言へ反映する', () => {
    expect(MESSAGES.ja.passportCreation.petNameCounter(3, 24)).toContain(
      '3 / 24'
    );
    expect(MESSAGES.en.passportCreation.petNameCounter(3, 24)).toContain(
      '3 / 24'
    );
    expect(MESSAGES.ja.hostInvite.participantsTitle(1, 2)).toContain('1 / 2');
    expect(MESSAGES.ja.passportCreation.saveButton(true)).toBe(
      '端末内に保存中'
    );
    expect(MESSAGES.ja.passportCreation.saveButton(false)).toBe(
      'Local Profile を端末内に明示保存'
    );
    expect(MESSAGES.en.passportCreation.saveButton(true)).not.toBe(
      MESSAGES.en.passportCreation.saveButton(false)
    );
  });

  it('Issue 15: hostInvite.participantRow は JA/EN で別々の区切り表現を使う（全角記号を英語表示へ持ち込まない）', () => {
    expect(
      MESSAGES.ja.hostInvite.participantRow('あなた（Host）', 'Ready')
    ).toBe('あなた（Host）：Ready');
    expect(MESSAGES.en.hostInvite.participantRow('You (Host)', 'Ready')).toBe(
      'You (Host): Ready'
    );
    expect(
      MESSAGES.en.hostInvite.participantRow('Guest', 'Not Ready')
    ).not.toContain('：');
  });

  it('Owner Question の 3 択ラベルは JA/EN それぞれ存在する', () => {
    expect(MESSAGES.ja.ownerQuestion.answerButton).toBe('答える');
    expect(MESSAGES.ja.ownerQuestion.noButton).toBe('分からない');
    expect(MESSAGES.ja.ownerQuestion.declineButton).toBe('パス');
    expect(MESSAGES.en.ownerQuestion.answerButton).toBe('Answer');
    expect(MESSAGES.en.ownerQuestion.noButton).not.toHaveLength(0);
    expect(MESSAGES.en.ownerQuestion.declineButton).toBe('Pass');
  });

  it('Camera Permission の 5 状態すべてに JA/EN 双方の title を持つ', () => {
    for (const locale of LOCALES) {
      const notice = MESSAGES[locale].cameraPermissionNotice;
      expect(notice.notDeterminedTitle.length).toBeGreaterThan(0);
      expect(notice.grantedTitle.length).toBeGreaterThan(0);
      expect(notice.deniedTitle.length).toBeGreaterThan(0);
      expect(notice.revokedTitle.length).toBeGreaterThan(0);
      expect(notice.hardwareUnavailableTitle.length).toBeGreaterThan(0);
    }
  });

  it('Profile Notice の 8 種類すべてに JA/EN 双方の title を持つ', () => {
    for (const locale of LOCALES) {
      const titles = MESSAGES[locale].passportCreation.noticeTitles;
      for (const kind of [
        'empty',
        'restored',
        'validation-error',
        'save-error',
        'storage-unavailable',
        'invalid-data',
        'read-error',
        'lounge-discarded',
      ] as const) {
        expect(titles[kind].length).toBeGreaterThan(0);
      }
    }
  });

  it('Destroyed Lounge の 4 種類の終了理由すべてに JA/EN 双方を持つ', () => {
    for (const locale of LOCALES) {
      const reasons = MESSAGES[locale].destroyedLounge.reasons;
      for (const reason of [
        'completed',
        'owner-exit',
        'host-ended',
        'expired',
      ] as const) {
        expect(reasons[reason].length).toBeGreaterThan(0);
      }
    }
  });

  it('Bridge / no-signal は用語集の指定用語のため翻訳せず両 Locale で同じ綴りを使う', () => {
    expect(MESSAGES.ja.outcome.bridgeLabel).toBe('Bridge');
    expect(MESSAGES.en.outcome.bridgeLabel).toBe('Bridge');
    expect(MESSAGES.ja.outcome.noSignalLabel).toBe('no-signal');
    expect(MESSAGES.en.outcome.noSignalLabel).toBe('no-signal');
  });
});
