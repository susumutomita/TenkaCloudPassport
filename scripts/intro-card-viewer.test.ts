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
import { QUIZ_QUESTION_COUNT } from '../src/domain/quiz-catalog';
import { QUIZ_PROGRESS_HEX_MAX_LENGTH } from '../src/domain/quiz-progress-code';
import {
  OPTIONAL_PAYLOAD_KEYS,
  REQUIRED_PAYLOAD_KEYS,
} from '../src/protocol/intro-card-url';

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
      'anchor.textContent = linkLabel(link)',
    ]);
  });

  it('リンクの hostname が既知サービス（X / GitHub / LinkedIn）ならサービス名ラベルを、それ以外は hostname を表示する（Issue 90）', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function linkLabel(link) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    // textContent 経由のみで表示する安全契約（innerHTML 不使用）は既存テストで
    // 固定済みのため、ここではラベル解決ロジック自体を検査する。
    expect(body).toContain('new URL(link).hostname');
    expect(body).toContain('KNOWN_LINK_HOST_LABELS[hostname] ?? hostname');
    expect(text).toContain("'x.com': 'X'");
    expect(text).toContain("'twitter.com': 'X'");
    expect(text).toContain("'github.com': 'GitHub'");
    expect(text).toContain("'linkedin.com': 'LinkedIn'");
  });

  it('linkLabel は URL として解析できない値を安全にそのまま返す（フェイルセーフ、例外を投げない）', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function linkLabel(link) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain('try {');
    expect(body).toContain('} catch {');
    expect(body).toContain('return link;');
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

  it('QR の中身の URL であることを示す独自ドメイン文字列（card.tenkacloud.com）はハードコードしない', async () => {
    const text = await readViewerSource();

    // ビューワーは location.hash だけを読み、自分自身の canonical URL を
    // 知る必要がない（`src/protocol/intro-card-url.ts` の INTRO_CARD_VIEWER_URL が
    // 唯一の定義元）。Issue 94 で GitHub Pages（susumutomita.github.io）から
    // card.tenkacloud.com へ移行した後も、この不変条件（ドメイン非依存）は変わらない。
    expect(text).not.toContain('card.tenkacloud.com');
    expect(text).not.toContain('susumutomita.github.io');
  });
});

/**
 * Issue 110 / ADR-0035: クイズ進捗ビットマスク（`q`）のスタンプ表示契約。
 * `src/domain/quiz-catalog.ts` / `src/domain/quiz-progress-code.ts` /
 * `src/protocol/intro-card-url.ts` の allowlist・定数と、このビューアの複製が
 * ドリフトしていないことを固定する。
 */
describe('クイズ進捗スタンプ（q、Issue 110 / ADR-0035）の表示契約', () => {
  it('KNOWN_PAYLOAD_KEYS が intro-card-url.ts の正本（REQUIRED/OPTIONAL_PAYLOAD_KEYS）と厳密に一致する（Issue 130 major: hardcode 文字列同士の比較ではなく正本と比較する）', async () => {
    const text = await readViewerSource();
    const expectedKeys = [...REQUIRED_PAYLOAD_KEYS, ...OPTIONAL_PAYLOAD_KEYS];
    const expectedLiteral = `const KNOWN_PAYLOAD_KEYS = [${expectedKeys
      .map((key) => `'${key}'`)
      .join(', ')}];`;

    expect(text).toContain(expectedLiteral);
  });

  it('QUIZ_QUESTION_COUNT・QUIZ_PROGRESS_HEX_MAX_LENGTH が domain の定数と同じ値を複製している（drift 検出）', async () => {
    const text = await readViewerSource();

    expect(text).toContain(
      `const QUIZ_QUESTION_COUNT = ${QUIZ_QUESTION_COUNT};`
    );
    expect(text).toContain(
      `const QUIZ_PROGRESS_HEX_MAX_LENGTH = ${QUIZ_PROGRESS_HEX_MAX_LENGTH};`
    );
  });

  it('validatedQuizProgressHex は 16 進以外・空文字・桁数超過を rejectField で fail-closed に拒否する', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function validatedQuizProgressHex(value) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain('if (value === undefined) return undefined;');
    expect(body).toContain(
      'value.length === 0 || value.length > QUIZ_PROGRESS_HEX_MAX_LENGTH'
    );
    expect(body).toContain('QUIZ_PROGRESS_HEX_PATTERN.test(value)');
    expect(body.match(/rejectField\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3
    );
  });

  it('buildCardFromPayload は stamp フィールドとして q を validatedQuizProgressHex 経由で組み込む', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function buildCardFromPayload(parsed) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain('stamp: validatedQuizProgressHex(parsed.q)');
  });

  it('quizStampCells は q を BigInt ビット演算で QUIZ_QUESTION_COUNT 桁分だけデコードする（未定義の高位ビットは無視）', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function quizStampCells(hex) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toMatch(/const mask = BigInt\(`0x\$\{hex\}`\);/);
    expect(body).toContain('index < QUIZ_QUESTION_COUNT');
    expect(body).toContain('(mask & (1n << BigInt(index))) !== 0n');
  });

  it('renderQuizStamp は q が無い（undefined）カードでは何もせず、既存 QR の見た目を変えない', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function renderQuizStamp(card) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain('if (card.stamp === undefined) return;');
  });

  it('renderQuizStamp はセルを createElement + className だけで組み立て、innerHTML を使わない', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function renderQuizStamp(card) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expect(body).toContain("document.createElement('span')");
    expect(body).toContain('cell.className =');
    expect(body).not.toContain('innerHTML');
    expect(body).toContain(
      "document.getElementById('quiz-stamp-count').textContent ="
    );
    expect(body).toContain(
      "document.getElementById('quiz-stamp').hidden = false;"
    );
  });

  it('renderCard は renderContacts の後に renderQuizStamp を呼ぶ', async () => {
    const text = await readViewerSource();
    const start = text.indexOf('function renderCard(card) {');
    const end = text.indexOf('\n  }', start);
    const body = text.slice(start, end);

    expectInOrder(body, ['renderContacts(card);', 'renderQuizStamp(card);']);
  });

  it('quiz-stamp セクションは HTML 上は既定で hidden であり、グリッドと件数表示の 2 要素を持つ', async () => {
    const text = await readViewerSource();

    expect(text).toContain('<div id="quiz-stamp" class="quiz-stamp" hidden>');
    expect(text).toContain(
      '<div id="quiz-stamp-grid" class="quiz-stamp-grid"></div>'
    );
    expect(text).toContain(
      '<p id="quiz-stamp-count" class="quiz-stamp-count"></p>'
    );
  });
});
