import { describe, expect, it } from 'bun:test';
import {
  createReducedMotionPort,
  type ReduceMotionEnvironment,
} from './reduced-motion-port';

/** 常に true を返す実際の別実装（Reduce Motion 有効）。 */
const ENABLED_ENVIRONMENT: ReduceMotionEnvironment = {
  isReduceMotionEnabled: () => Promise.resolve(true),
};

/** 常に false を返す実際の別実装（Reduce Motion 無効）。 */
const DISABLED_ENVIRONMENT: ReduceMotionEnvironment = {
  isReduceMotionEnabled: () => Promise.resolve(false),
};

/** 取得に失敗する実際の別実装（環境が対応していない、権限エラー等）。 */
const FAILING_ENVIRONMENT: ReduceMotionEnvironment = {
  isReduceMotionEnabled: () => Promise.reject(new Error('unsupported')),
};

describe('Reduce Motion Port', () => {
  it('Environment が true を返せば Reduce Motion 有効として伝える', async () => {
    const port = createReducedMotionPort(ENABLED_ENVIRONMENT);

    expect(await port.isReduceMotionEnabled()).toBe(true);
  });

  it('Environment が false を返せば Reduce Motion 無効として伝える', async () => {
    const port = createReducedMotionPort(DISABLED_ENVIRONMENT);

    expect(await port.isReduceMotionEnabled()).toBe(false);
  });

  it('Environment の取得が失敗しても Motion 有効側（false）へ fail-safe する', async () => {
    const port = createReducedMotionPort(FAILING_ENVIRONMENT);

    expect(await port.isReduceMotionEnabled()).toBe(false);
  });
});
