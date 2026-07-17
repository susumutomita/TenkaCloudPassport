import { describe, expect, it } from 'bun:test';
import {
  type ActiveLounge,
  evaluateLounge,
  LOUNGE_TTL_MS,
  type RetiredLounge,
  startLounge,
} from '../domain/lounge';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { reduceLounge } from './lounge-reducer';

function activeLounge() {
  const profile = createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: [],
  });
  const passport = projectPublicPassport(profile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: ['open-source'],
    languageCodes: [],
    ownerConfirmed: true,
  });
  return startLounge({
    ownerPassport: passport,
    encounteredPassport: passport,
    clock: { wallClockMs: 1_000, monotonicMs: 2_000 },
  });
}

const EXPIRY_CLOCK = {
  wallClockMs: 1_000 + LOUNGE_TTL_MS,
  monotonicMs: 2_100,
};

/**
 * Issue 11 で reducer の `'evaluate'` Action を削除した（Rules Provider への直接判定は
 * `pet-interaction-flow.ts` の bounded protocol へ置き換わり、reducer からは呼ばれなく
 * なったため）。この reducer の競合テストが必要とするのは「すでに retired な Lounge」
 * という fixture であり、その retired 状態を作る手段は reducer 経由である必要はない。
 * `evaluateLounge`（`src/domain/lounge.ts` の公開 API、100% カバレッジのまま残る）を
 * 直接呼んで fixture を作り、reducer 自体（`clock-tick` / `complete`）の競合処理だけを
 * 検証対象にする。
 */
function retiredLounge(active: ActiveLounge): RetiredLounge {
  const retired = evaluateLounge(active, RULES_PROVIDER, {
    wallClockMs: 1_100,
    monotonicMs: 2_100,
  });
  if (retired.status !== 'retired') throw new Error('retired が必要です。');
  return retired;
}

describe('Lounge reducer の競合処理', () => {
  it('判定確定の後に期限切れが並んでも結果を完全破棄する', () => {
    const retired = retiredLounge(activeLounge());
    const expired = reduceLounge(retired, {
      type: 'clock-tick',
      clock: EXPIRY_CLOCK,
    });

    expect(expired).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('破棄後に終了操作が重なっても最初の破棄理由を維持する', () => {
    const exited = reduceLounge(activeLounge(), { type: 'owner-exit' });
    const hostedEnd = reduceLounge(exited, { type: 'host-ended' });
    const completed = reduceLounge(hostedEnd, { type: 'complete' });

    expect(completed).toEqual({ status: 'destroyed', reason: 'owner-exit' });
  });

  it('判定確定済み Lounge を完了すると Bridge と Passport を完全破棄する', () => {
    const retired = retiredLounge(activeLounge());
    const completed = reduceLounge(retired, { type: 'complete' });

    expect(completed).toEqual({ status: 'destroyed', reason: 'completed' });
  });
});

describe('Background / Foreground 復帰時の app-resumed イベント', () => {
  it('単調増加時計がほぼ進まず壁時計だけが 20 分先へ進んでいても、停止時間を延長扱いにせず破棄する', () => {
    // 端末の Suspend 中は monotonic（uptime）が実質停止する一方、壁時計は現実の
    // 経過時間どおりに進む。Foreground 復帰直後に届く app-resumed イベントが、
    // この差を「期限延長」に扱わないことを固定する。
    const resumed = reduceLounge(activeLounge(), {
      type: 'app-resumed',
      clock: { wallClockMs: 1_000 + LOUNGE_TTL_MS, monotonicMs: 2_001 },
    });

    expect(resumed).toEqual({ status: 'destroyed', reason: 'expired' });
  });

  it('期限前に復帰した場合は active 状態を変更しない', () => {
    const active = activeLounge();
    const resumed = reduceLounge(active, {
      type: 'app-resumed',
      clock: { wallClockMs: 1_500, monotonicMs: 2_500 },
    });

    expect(resumed).toBe(active);
  });

  it('破棄済みの Lounge に app-resumed が届いても同じ終端状態を維持する', () => {
    const destroyed = reduceLounge(activeLounge(), { type: 'owner-exit' });
    const resumed = reduceLounge(destroyed, {
      type: 'app-resumed',
      clock: { wallClockMs: 1_000 + LOUNGE_TTL_MS, monotonicMs: 999_999 },
    });

    expect(resumed).toBe(destroyed);
  });
});
