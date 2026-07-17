import { describe, expect, it } from 'bun:test';
import { createBridge, createBridgeFromEvidence } from './bridge';
import { createLocalPrivateProfile, projectPublicPassport } from './passport';

describe('Bridge 生成', () => {
  it('確認済みの共通手掛かり 1 件から口頭会話の理由を生成する', () => {
    const profile = createLocalPrivateProfile({
      petName: 'こむぎ',
      petEmoji: '🐾',
      ownerAlias: '',
      candidateClueIds: ['regional-event-operations'],
      selectedForPassportClueIds: ['regional-event-operations'],
      languageCodes: [],
    });
    const passport = projectPublicPassport(profile, {
      includePetName: true,
      includePetEmoji: true,
      includeOwnerAlias: false,
      clueIds: ['regional-event-operations'],
      languageCodes: [],
      ownerConfirmed: true,
    });
    const clue = passport.clues[0];
    if (!clue) throw new Error('確認済みの手掛かりが必要です。');

    const bridge = createBridge(clue);

    expect(bridge.evidence.clues.map((item) => item.value)).toEqual([
      'regional-event-operations',
    ]);
    expect(bridge.message).toContain('地域イベントの運営');
    expect(bridge.message).toContain('話してみませんか');
  });

  it('Match Evidence が空の場合は Bridge を生成しない', () => {
    expect(() =>
      createBridgeFromEvidence({ schemaVersion: 1, clues: [] })
    ).toThrow('1 件以上');
  });
});
