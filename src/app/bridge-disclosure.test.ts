import { describe, expect, it } from 'bun:test';
import {
  INITIAL_BRIDGE_DISCLOSURE_STATE,
  reduceBridgeDisclosure,
} from './bridge-disclosure';

describe('Bridge 表示状態', () => {
  it('結果画面を開いた時点では Bridge を mask する', () => {
    expect(INITIAL_BRIDGE_DISCLOSURE_STATE).toBe('masked');
  });

  it('Owner の明示操作中だけ Bridge を表示し、再び mask できる', () => {
    const visible = reduceBridgeDisclosure(INITIAL_BRIDGE_DISCLOSURE_STATE, {
      type: 'reveal',
    });
    const masked = reduceBridgeDisclosure(visible, { type: 'mask' });

    expect(visible).toBe('visible');
    expect(masked).toBe('masked');
  });

  it('アプリが非アクティブになると表示中の Bridge を再び mask する', () => {
    const visible = reduceBridgeDisclosure(INITIAL_BRIDGE_DISCLOSURE_STATE, {
      type: 'reveal',
    });

    expect(
      reduceBridgeDisclosure(visible, { type: 'app-became-inactive' })
    ).toBe('masked');
  });
});
