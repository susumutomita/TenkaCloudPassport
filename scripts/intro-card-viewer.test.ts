import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  INTRO_CARD_LINK_MAX_LENGTH,
  INTRO_CARD_MAX_LINKS,
  INTRO_CARD_NAME_MAX_LENGTH,
  INTRO_CARD_ORGANIZATION_MAX_LENGTH,
  INTRO_CARD_PHONE_MAX_LENGTH,
  INTRO_CARD_SELF_INTRO_MAX_LENGTH,
  INTRO_CARD_TITLE_MAX_LENGTH,
} from '../src/domain/intro-card';

/**
 * Issue 84: `site/c/index.html` は完全静的・外部リクエストゼロの自己紹介ページ
 * ビューワーで、ビルドステップを持たない。実行環境（ヘッドレスブラウザ）を
 * 持たないため、正本の挙動契約をソーステキスト検査で固定する
 * （`src/screens/*-accessibility.test.ts` と同じ慣行）。
 */
const viewerPath = join(import.meta.dir, '..', 'site/c/index.html');
const readViewerSource = (): Promise<string> => Bun.file(viewerPath).text();

function expectInOrder(text: string, labels: readonly string[]): void {
  let previous = -1;
  for (const label of labels) {
    const position = text.indexOf(label);
    expect(position).toBeGreaterThan(previous);
    previous = position;
  }
}

describe('自己紹介ページビューワー（site/c/index.html、Issue 84）の挙動契約', () => {
  it('innerHTML・dangerouslySetInnerHTML を使わず、表示は textContent だけで行う', async () => {
    const text = await readViewerSource();

    expect(text).not.toMatch(/\bdangerouslySetInnerHTML\b|\.\s*innerHTML\s*=/);
    expect(text).toContain('.textContent =');
  });

  it('外部ホストへのリクエストを一切発行しない（script src・link href・img src が無い）', async () => {
    const text = await readViewerSource();

    expect(text).not.toMatch(/<script[^>]+\bsrc\s*=/i);
    expect(text).not.toMatch(/<link[^>]+\bhref\s*=\s*["']https?:/i);
    expect(text).not.toMatch(/<img\b/i);
    // カード内容はブラウザ内で組み立てる DOM だけで、fetch/XHR/WebSocket は使わない。
    expect(text).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/);
  });

  it('location.hash を base64url + JSON でブラウザ内デコードし、fail-closed の 2 状態を持つ', async () => {
    const text = await readViewerSource();

    expect(text).toContain('location.hash');
    expect(text).toContain('BASE64URL_ALPHABET');
    expect(text).toContain("new TextDecoder('utf-8', { fatal: true })");
    expect(text).toContain("getElementById('no-hash')");
    expect(text).toContain("getElementById('decode-error')");
  });

  it('JSON の version（v）と必須の name（n）を検証してから復元し、未知の key は fragment 全体を拒否する', async () => {
    const text = await readViewerSource();

    expect(text).toContain('parsed.v !== 1');
    expect(text).toContain('validatedName(parsed.n)');
    expect(text).toContain('hasOnlyKnownKeys(parsed)');
  });

  it('links は https?:// だけを許可し、javascript: 等の scheme・上限件数超過・非 string 要素は fragment 全体を拒否する', async () => {
    const text = await readViewerSource();

    expect(text).toContain('/^https?:\\/\\//i');
    const start = text.indexOf('function validatedLinks(value) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain('rejectField()');
    expect(body).toContain('normalized.length > MAX_LINKS');
    expect(body).toContain('link.length > LINK_MAX_LENGTH');
  });

  it('src/domain/intro-card.ts の文字数上限定数と同じ値を複製している（drift 検出）', async () => {
    const text = await readViewerSource();

    expect(text).toContain(
      `const NAME_MAX_LENGTH = ${INTRO_CARD_NAME_MAX_LENGTH};`
    );
    expect(text).toContain(
      `const TITLE_MAX_LENGTH = ${INTRO_CARD_TITLE_MAX_LENGTH};`
    );
    expect(text).toContain(
      `const ORGANIZATION_MAX_LENGTH = ${INTRO_CARD_ORGANIZATION_MAX_LENGTH};`
    );
    expect(text).toContain(
      `const SELF_INTRO_MAX_LENGTH = ${INTRO_CARD_SELF_INTRO_MAX_LENGTH};`
    );
    expect(text).toContain(`const MAX_LINKS = ${INTRO_CARD_MAX_LINKS};`);
    expect(text).toContain(
      `const LINK_MAX_LENGTH = ${INTRO_CARD_LINK_MAX_LENGTH};`
    );
    expect(text).toContain(
      `const PHONE_MAX_LENGTH = ${INTRO_CARD_PHONE_MAX_LENGTH};`
    );
  });

  it('email・phone は src/domain/intro-card.ts と同じ正規表現で形式検証し、不正なら fragment 全体を拒否する', async () => {
    const text = await readViewerSource();

    expect(text).toContain(
      String.raw`const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;`
    );
    expect(text).toContain(String.raw`const PHONE_PATTERN = /^[0-9+\-() ]+$/;`);
    expect(text).toContain('EMAIL_PATTERN.test(email)');
    expect(text).toContain('PHONE_PATTERN.test(phone)');
  });

  it('外部リンクの a 要素は target="_blank" と rel="noopener noreferrer" を必ず両方設定する', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function renderLinks(card) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      "anchor.target = '_blank'",
      "anchor.rel = 'noopener noreferrer'",
      'anchor.textContent = link',
    ]);
  });

  it('連絡先に追加ボタンは vCard 3.0 を組み立てて Blob URL 経由で .vcf をダウンロードさせる', async () => {
    const text = await readViewerSource();

    expect(text).toContain("'BEGIN:VCARD'");
    expect(text).toContain("'END:VCARD'");
    expect(text).toContain("type: 'text/vcard;charset=utf-8'");
    expect(text).toContain('URL.createObjectURL(blob)');
    expect(text).toContain('anchor.download =');
  });

  it('buildVCard は全フィールド（phone を含む）を escapeVCardValue でエスケープしてから行に組み立てる（vCard インジェクション対策）', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function buildVCard(card) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    for (const field of ['organization', 'title', 'phone', 'email']) {
      expect(body).toContain(`escapeVCardValue(card.${field})`);
    }
    // TEL 行は生の card.phone を直接テンプレートに埋め込まない
    // （fragment 経由で \r\n や ; を仕込む vCard インジェクションを防ぐ）。
    expect(body).not.toMatch(/TEL;TYPE=CELL:\$\{card\.phone\}/);
  });

  it('vCard のエスケープ規則は src/protocol/vcard.ts の escapeVCardValue と同じ順序で適用する', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function escapeVCardValue(value) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, [
      String.raw`.replace(/\\/g, '\\\\')`,
      String.raw`.replace(/,/g, '\\,')`,
      String.raw`.replace(/;/g, '\\;')`,
      String.raw`.replace(/\r\n|\r|\n/g, '\\n')`,
    ]);
  });

  it('html lang、viewport、robots noindex を持つ（個人ページを検索に出さない）', async () => {
    const text = await readViewerSource();

    expect(text).toMatch(/<html\b[^>]*\blang\s*=\s*"ja"/);
    expect(text).toMatch(/<meta\b[^>]*name=["']viewport["']/i);
    expect(text).toMatch(/<meta\b[^>]*name=["']robots["'][^>]*noindex/i);
  });

  it('QR の中身の URL であることを示す独自ドメイン文字列（susumutomita.github.io）はハードコードしない', async () => {
    const text = await readViewerSource();

    // ビューワーは location.hash だけを読み、自分自身の canonical URL を
    // 知る必要がない（`src/protocol/intro-card-url.ts` の INTRO_CARD_VIEWER_URL が
    // 唯一の定義元）。
    expect(text).not.toContain('susumutomita.github.io');
  });
});
