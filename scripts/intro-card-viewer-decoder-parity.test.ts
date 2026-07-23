import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { createIntroCard } from '../src/domain/intro-card';
import {
  decodeIntroCardUrlFragment,
  decodeIntroCardUrlFragmentQuizProgressHex,
  encodeIntroCardUrl,
} from '../src/protocol/intro-card-url';

/**
 * Issue 130（Codex 指摘 major）: `intro-card-viewer.test.ts` の大半は source-text 検査
 * （文字列の部分一致）であり、ビューア（`site/c/index.html`）の実際のデコーダを
 * 一度も実行しない。本ファイルは、共有の fixture コーパス（有効/無効な fragment）に
 * 対して本体（`src/protocol/intro-card-url.ts`）とビューアの両デコーダを実際に
 * 実行し、受理/拒否の判定と復元結果が一致することを固定する。
 *
 * ビューアはビルドステップを持たない完全静的ファイルのため、`site/c/index.html` の
 * `<script>` から decode 系の純関数だけ（DOM に触れない範囲）を文字列として切り出し、
 * `new Function` で評価して実行する。切り出し範囲は `BASE64URL_ALPHABET` 定数から
 * `decodeFragment` 関数の終わりまでで、`document` / `window` を一切参照しない
 * （このテストで実行前に確認する）。
 */
const viewerPath = join(import.meta.dir, '..', 'site/c/index.html');

interface ViewerDecoder {
  readonly decodeFragment: (fragment: string) => Record<string, unknown> | null;
}

async function loadViewerDecoder(): Promise<ViewerDecoder> {
  const text = await Bun.file(viewerPath).text();
  const start = text.indexOf('const BASE64URL_ALPHABET =');
  const endMarker = '\n  function escapeVCardValue(value) {';
  const end = text.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(
      'site/c/index.html の decode 関数スライスの境界が見つかりません。'
    );
  }
  const slice = text.slice(start, end);
  expect(slice).not.toContain('document.');
  expect(slice).not.toContain('window.');
  expect(slice).not.toContain('location.');

  // このリポジトリ自身の静的ファイル（site/c/index.html、commit 済みソース）を
  // 実行して parity を検証するテスト専用の手段であり、外部・実行時入力を評価する
  // ものではない（上の 3 つの expect で document/window/location 不参照を保証する）。
  const factory = new Function(
    `${slice}\nreturn { decodeFragment };`
  ) as () => ViewerDecoder;
  return factory();
}

function fragmentFromPayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

interface DecodeAttempt {
  readonly ok: boolean;
  readonly name?: string;
  readonly title?: string;
  readonly organization?: string;
  readonly selfIntro?: string;
  readonly links?: readonly string[];
  readonly email?: string;
  readonly phone?: string;
  readonly quizProgressHex?: string;
  readonly themeIds?: readonly string[];
}

function decodeWithTypeScript(fragment: string): DecodeAttempt {
  try {
    const card = decodeIntroCardUrlFragment(fragment);
    const quizProgressHex = decodeIntroCardUrlFragmentQuizProgressHex(fragment);
    return {
      ok: true,
      name: card.name,
      title: card.title,
      organization: card.organization,
      selfIntro: card.selfIntro,
      links: card.links,
      email: card.email,
      phone: card.phone,
      quizProgressHex,
      themeIds: card.themeIds,
    };
  } catch {
    return { ok: false };
  }
}

function decodeWithViewer(
  decoder: ViewerDecoder,
  fragment: string
): DecodeAttempt {
  const card = decoder.decodeFragment(fragment);
  if (card === null) return { ok: false };
  return {
    ok: true,
    name: card.name as string,
    title: card.title as string | undefined,
    organization: card.organization as string | undefined,
    selfIntro: card.selfIntro as string | undefined,
    links: card.links as readonly string[] | undefined,
    email: card.email as string | undefined,
    phone: card.phone as string | undefined,
    quizProgressHex: card.stamp as string | undefined,
    themeIds: card.themeIds as readonly string[] | undefined,
  };
}

interface Fixture {
  readonly name: string;
  readonly fragment: string;
  readonly expectValid: boolean;
}

function buildFixtures(): readonly Fixture[] {
  const minimalCard = createIntroCard({ name: 'テスト太郎' });
  const fullCard = createIntroCard({
    name: 'フル太郎',
    title: 'Engineer',
    organization: 'TenkaCloud',
    selfIntro: 'よろしくお願いします。',
    links: ['https://example.com/full-taro'],
    email: 'full-taro@example.com',
    phone: '090-1234-5678',
  });

  return [
    {
      name: '本体の encodeIntroCardUrl が生成した最小 fragment（q なし）',
      fragment: new URL(encodeIntroCardUrl(minimalCard)).hash.slice(1),
      expectValid: true,
    },
    {
      name: '本体の encodeIntroCardUrl が生成した全項目 + q 付き fragment',
      fragment: new URL(encodeIntroCardUrl(fullCard, 'f')).hash.slice(1),
      expectValid: true,
    },
    {
      name: '手組み最小 payload（name のみ）',
      fragment: fragmentFromPayload({ v: 1, n: 'Alice' }),
      expectValid: true,
    },
    {
      name: 'q が全ビット分の長い 16 進文字列',
      fragment: fragmentFromPayload({ v: 1, n: 'Bob', q: 'ffff' }),
      expectValid: true,
    },
    {
      name: '未知の key を含む payload',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', extra: 'x' }),
      expectValid: false,
    },
    {
      name: 'version が 1 以外',
      fragment: fragmentFromPayload({ v: 2, n: 'Eve' }),
      expectValid: false,
    },
    {
      name: 'v が欠けている（必須 key 不足）',
      fragment: fragmentFromPayload({ n: 'Eve' }),
      expectValid: false,
    },
    {
      name: 'n が欠けている（必須 key 不足）',
      fragment: fragmentFromPayload({ v: 1 }),
      expectValid: false,
    },
    {
      name: 'email の形式が不正',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', e: 'not-an-email' }),
      expectValid: false,
    },
    {
      name: 'phone の形式が不正（文字を含む）',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', p: 'call-me' }),
      expectValid: false,
    },
    {
      name: 'links が上限（5 件）を超える',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Eve',
        l: [
          'https://a.example.com',
          'https://b.example.com',
          'https://c.example.com',
          'https://d.example.com',
          'https://e.example.com',
          'https://f.example.com',
        ],
      }),
      expectValid: false,
    },
    {
      name: 'links の要素が http(s) で始まらない',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Eve',
        l: ['ftp://x.example.com'],
      }),
      expectValid: false,
    },
    {
      name: 'q が 16 進以外の文字を含む',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', q: 'zz' }),
      expectValid: false,
    },
    {
      name: 'q が空文字',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', q: '' }),
      expectValid: false,
    },
    {
      name: 'q が上限（32 文字）を超える',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', q: 'f'.repeat(33) }),
      expectValid: false,
    },
    {
      name: 'name が domain の上限（50 文字）を超える（protocol 層の上限は満たすが domain 層で拒否）',
      fragment: fragmentFromPayload({ v: 1, n: 'あ'.repeat(51) }),
      expectValid: false,
    },
    {
      name: '本体の encodeIntroCardUrl が生成した themeIds 付き fragment（Issue 104 / ADR-0036）',
      fragment: new URL(
        encodeIntroCardUrl(
          createIntroCard({
            name: 'テーマ太郎',
            themeIds: ['open-source', 'accessibility'],
          })
        )
      ).hash.slice(1),
      expectValid: true,
    },
    {
      name: '手組み themeIds（m）が上限（3 件）ちょうど',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Bob',
        m: ['open-source', 'accessibility', 'information-security'],
      }),
      expectValid: true,
    },
    {
      name: 'm が配列ではない',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', m: 'open-source' }),
      expectValid: false,
    },
    {
      name: 'm が空配列',
      fragment: fragmentFromPayload({ v: 1, n: 'Eve', m: [] }),
      expectValid: false,
    },
    {
      name: 'm が上限（3 件）を超える',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Eve',
        m: [
          'open-source',
          'accessibility',
          'information-security',
          'cloud-infrastructure',
        ],
      }),
      expectValid: false,
    },
    {
      name: 'major（Issue 104 PR #132、Codex 指摘）: m の要素がカタログに実在しない ID',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Eve',
        m: ['not-a-real-clue-id'],
      }),
      expectValid: false,
    },
    {
      name: 'major（Issue 104 PR #132、Codex 指摘）: m の要素が重複している',
      fragment: fragmentFromPayload({
        v: 1,
        n: 'Eve',
        m: ['open-source', 'open-source'],
      }),
      expectValid: false,
    },
    {
      name: '空文字の fragment',
      fragment: '',
      expectValid: false,
    },
    {
      name: 'base64url として不正な文字を含む fragment',
      fragment: '!!!not-base64!!!',
      expectValid: false,
    },
    {
      name: 'base64url としては妥当だが JSON として不正',
      fragment: Buffer.from('{not-json', 'utf-8').toString('base64url'),
      expectValid: false,
    },
    {
      name: 'JSON として妥当だが object ではない（配列）',
      fragment: Buffer.from('[1,2,3]', 'utf-8').toString('base64url'),
      expectValid: false,
    },
  ];
}

describe('intro-card-url の本体デコーダとビューアデコーダの parity（Issue 130 major）', () => {
  it.each(
    buildFixtures()
  )('$name: 受理/拒否の判定と復元結果が本体・ビューアで一致する', async ({
    fragment,
    expectValid,
  }) => {
    const decoder = await loadViewerDecoder();
    const tsResult = decodeWithTypeScript(fragment);
    const viewerResult = decodeWithViewer(decoder, fragment);

    expect(tsResult.ok).toBe(expectValid);
    expect(viewerResult.ok).toBe(tsResult.ok);

    if (tsResult.ok && viewerResult.ok) {
      expect(viewerResult.name).toBe(tsResult.name);
      expect(viewerResult.title).toBe(tsResult.title);
      expect(viewerResult.organization).toBe(tsResult.organization);
      expect(viewerResult.selfIntro).toBe(tsResult.selfIntro);
      expect(viewerResult.links).toEqual(tsResult.links);
      expect(viewerResult.email).toBe(tsResult.email);
      expect(viewerResult.phone).toBe(tsResult.phone);
      expect(viewerResult.quizProgressHex).toBe(tsResult.quizProgressHex);
      expect(viewerResult.themeIds).toEqual(tsResult.themeIds);
    }
  });
});
