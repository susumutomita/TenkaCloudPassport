import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

/**
 * PassportApp.tsx はレンダリング用の統合テスト基盤（React Testing Library 相当）を
 * 持たないため（新規依存を増やさない方針）、各関数の本体が正しい次の Stage へ
 * 遷移することをソーステキスト検査で固定する。過去に、Encounter 完了後の遷移先を
 * 誤って書き換え、Host が Invite QR へ到達できない回帰が発生したため、その再発を
 * この Test で防ぐ。
 */
function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

const FUNCTION_NAMES = [
  'saveLocalProfile',
  'continueToPreview',
  'hostLounge',
  'markHostReady',
  'beginGuestScan',
  'performScan',
  'guestReady',
  'discardInviteFlow',
  'cancelInvite',
  'restartEncounter',
  'editLocalProfile',
] as const;

/**
 * `{` / `}` の対応だけで関数本体を切り出す。対象関数（PassportApp.tsx の Stage 遷移
 * 関数）は文字列 / テンプレートリテラルの中に `{` や `}` を含まないため、この単純な
 * 深さ計測で正しく切り出せる。将来、対象関数の本文にそのような文字を含む文字列
 * リテラルを足す場合は、この前提が崩れないことを確認すること。
 */
function functionBody(text: string, name: string): string {
  const declarationPattern = new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{`);
  const match = declarationPattern.exec(text);
  if (!match || match.index === undefined) {
    throw new Error(`関数 ${name} が見つかりません。`);
  }
  const start = match.index + match[0].length;
  let depth = 1;
  let index = start;
  while (depth > 0 && index < text.length) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') depth -= 1;
    index += 1;
  }
  return text.slice(start, index);
}

describe('PassportApp の Stage 遷移契約', () => {
  it('各関数の本体を過不足なく抽出できる', async () => {
    const text = await source();
    for (const name of FUNCTION_NAMES) {
      expect(functionBody(text, name).length).toBeGreaterThan(0);
    }
  });

  it('保存・復元は Encounter（相手の公開内容入力）へ進む', async () => {
    const text = await source();

    expect(functionBody(text, 'saveLocalProfile')).toContain(
      "setStage('encounter')"
    );
    expect(text).toContain("setStage('encounter')");
  });

  it('Encounter の続行は Owner 自身の共有 Preview（Host 前段）へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'continueToPreview');

    expect(body).toContain("setStage('share-preview')");
    expect(body).not.toContain("setStage('guest-share-preview')");
  });

  it('Owner の Lounge 開始操作は Host Invite 画面（QR 表示）へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'hostLounge');

    expect(body).toContain("setStage('host-invite')");
    expect(body).toContain('joinLoungeRoom');
    expect(body).toContain('qrScannerPort.publish(');
  });

  it('ゲストとして QR を読み取る操作は Guest Scan 画面へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'beginGuestScan');

    expect(body).toContain("setStage('guest-scan')");
  });

  it('Scan 成功後は新規入力を求めず Guest の共有 Preview へ進む', async () => {
    const text = await source();
    const body = functionBody(text, 'performScan');

    expect(body).toContain("setStage('guest-share-preview')");
    expect(body).not.toContain("setStage('encounter')");
    expect(body).toContain('resolveGuestProfile');
  });

  it('Host / Guest どちらの Ready 操作も ready 到達時に Agent State Machine を開始し、Room の tick を破棄する', async () => {
    const text = await source();
    const hostBody = functionBody(text, 'markHostReady');
    const guestBody = functionBody(text, 'guestReady');

    for (const body of [hostBody, guestBody]) {
      expect(body).toContain("status === 'ready'");
      expect(body).toContain('startLoungeFromRoom');
      expect(body).toContain('setLoungeRoom(null)');
    }
  });

  it('Invite フローからの離脱経路（キャンセル・再開・Profile 編集）はすべて discardInviteFlow を呼ぶ', async () => {
    const text = await source();

    for (const name of [
      'cancelInvite',
      'restartEncounter',
      'editLocalProfile',
    ]) {
      expect(functionBody(text, name)).toContain('discardInviteFlow()');
    }
  });

  it('Guest の共有 Preview からの Back は再走査を強制する画面へ戻さない', async () => {
    const text = await source();

    expect(text).not.toContain("onBackToHostInvite'");
    // guest-share-preview の Back 実装が 'guest-scan' を setStage しないことを確認する。
    const guestPreviewIndex = text.indexOf("stage === 'guest-share-preview'");
    const sharePreviewIndex = text.indexOf(
      "stage === 'share-preview' &&",
      guestPreviewIndex
    );
    const guestPreviewBlock = text.slice(guestPreviewIndex, sharePreviewIndex);
    expect(guestPreviewBlock).not.toContain("setStage('guest-scan')");
  });
});
