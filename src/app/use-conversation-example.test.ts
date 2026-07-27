import { describe, expect, it } from 'bun:test';
import {
  expectInOrder,
  readSourceFile,
} from '../screens/accessibility-test-kit';

function source(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-conversation-example.ts');
}

describe('useConversationExample の React lifecycle 契約（Issue 155）', () => {
  it('Generator identity ごとに Controller を 1 件だけ構成する', async () => {
    const text = await source();

    expectInOrder(text, [
      'const controller = useMemo(',
      'createConversationExampleFlowController(generator)',
      '[generator]',
    ]);
  });

  it('Controller 変更・unmount 時に購読解除して dispose する', async () => {
    const text = await source();

    expectInOrder(text, [
      'const unsubscribe = controller.subscribe(',
      'return () => {',
      'unsubscribe();',
      'controller.dispose();',
      '};',
      '}, [controller]);',
    ]);
  });

  it('旧 Controller の遅延 snapshot を現在の画面へ表示しない', async () => {
    const text = await source();

    expect(text).toContain('snapshot.controller === controller');
    // ': controller.getState()' は初期 snapshot 構築（'state: controller.getState()'）
    // にも部分一致するため、三項演算子の 2 行をまとめて一意に照合する。
    expectInOrder(text, [
      'snapshot.controller === controller',
      '? snapshot.state\n        : controller.getState()',
    ]);
  });
});
