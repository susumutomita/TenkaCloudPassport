import { describe, expect, it } from 'bun:test';
import { createBridge } from './bridge';
import { createLocalPrivateProfile, projectPublicPassport } from './passport';

describe('Bridge 生成', () => {
  it('確認済みの共通手掛かり 1 件から口頭会話の理由を生成する', () => {
    const profile = createLocalPrivateProfile({
      candidateClueIds: ['regional-event-operations'],
      selectedForPassportClueIds: ['regional-event-operations'],
    });
    const passport = projectPublicPassport(profile, {
      clueIds: ['regional-event-operations'],
      ownerConfirmed: true,
    });
    const clue = passport.clues[0];
    if (!clue) throw new Error('確認済みの手掛かりが必要です。');

    const bridge = createBridge(clue);

    expect(bridge.evidence).toEqual(['regional-event-operations']);
    expect(bridge.message).toContain('地域イベントの運営');
    expect(bridge.message).toContain('話してみませんか');
  });
});
