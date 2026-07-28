import { describe, expect, it } from 'bun:test';
import {
  type AppleFoundationModelsUnavailableReason,
  checkAppleFoundationModelsAvailability,
  parseAppleFoundationModelsAvailability,
} from './apple-foundation-models-availability';

describe('Apple Foundation Models Availability の解析', () => {
  it('available を受理する', () => {
    expect(parseAppleFoundationModelsAvailability('available')).toEqual({
      status: 'available',
    });
  });

  it('既知の unavailable 理由を bounded な reason へ解析する', () => {
    const cases: ReadonlyArray<
      readonly [string, AppleFoundationModelsUnavailableReason]
    > = [
      ['unavailable-device-not-eligible', 'device-not-eligible'],
      [
        'unavailable-apple-intelligence-not-enabled',
        'apple-intelligence-not-enabled',
      ],
      ['unavailable-model-not-ready', 'model-not-ready'],
      ['unavailable-unsupported-os', 'unsupported-os'],
      ['unavailable-unknown', 'unknown'],
    ];

    for (const [raw, reason] of cases) {
      expect(parseAppleFoundationModelsAvailability(raw)).toEqual({
        status: 'unavailable',
        reason,
      });
    }
  });

  it('未知の文字列・型・null は unavailable/unknown へ fail-closed に丸める', () => {
    for (const value of [
      null,
      undefined,
      42,
      {},
      [],
      '',
      'Available',
      'unavailable-totally-made-up',
      'unavailable-',
    ]) {
      expect(parseAppleFoundationModelsAvailability(value)).toEqual({
        status: 'unavailable',
        reason: 'unknown',
      });
    }
  });
});

describe('Native Availability の読み取り境界', () => {
  it('Native の読み取りが成功すれば、その値を解析して返す', async () => {
    const result = await checkAppleFoundationModelsAvailability(
      async () => 'available'
    );

    expect(result).toEqual({ status: 'available' });
  });

  it('Native の読み取りが例外を投げても unknown へ fail-closed に丸める（クラッシュしない）', async () => {
    const result = await checkAppleFoundationModelsAvailability(async () => {
      throw new Error('Native Module でエラーが発生しました。');
    });

    expect(result).toEqual({ status: 'unavailable', reason: 'unknown' });
  });

  it('Native Module 不在（Android / Web / Expo Go）で解決される null も unavailable/unknown にする', async () => {
    const result = await checkAppleFoundationModelsAvailability(
      async () => null
    );

    expect(result).toEqual({ status: 'unavailable', reason: 'unknown' });
  });
});
