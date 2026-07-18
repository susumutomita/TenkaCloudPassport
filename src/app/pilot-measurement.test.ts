import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  acceptNativeShare,
  fileBackedNativeSharePort,
  fileDownloadSharePort,
  nativeShareAttemptCount,
  nativeShareContent,
  releaseNativeShare,
} from './backup-share-test-kit';
import {
  createPilotMeasurementController,
  PILOT_AGGREGATE_MAX_COUNT,
  PILOT_AGGREGATE_SCHEMA_VERSION,
  PILOT_MINIMUM_AGGREGATION_UNIT,
  type PilotEventAggregate,
  PilotMeasurementError,
  parsePilotEventAggregate,
} from './pilot-measurement';
import { trackTemporaryDirectories } from './storage-test-kit';

const { create: newTemporaryDirectory } = trackTemporaryDirectories();

function newController(): ReturnType<typeof createPilotMeasurementController> {
  return createPilotMeasurementController(
    fileDownloadSharePort(newTemporaryDirectory())
  );
}

function completeSession(
  controller: ReturnType<typeof createPilotMeasurementController>,
  input: {
    readonly outcome?: 'bridge' | 'no-signal';
    readonly provider?: 'rules' | 'local-llm' | 'fallback';
    readonly durationMs?: number;
  } = {}
): void {
  const outcome = input.outcome ?? 'bridge';
  const provider = input.provider ?? 'rules';
  const durationMs = input.durationMs ?? 10_000;
  controller.setResearchEnabled(true);
  controller.start();
  controller.ready(1_000);
  controller.outcome({
    kind: outcome,
    provider,
    monotonicMs: 1_000 + durationMs,
  });
  if (outcome === 'bridge') controller.skipSelfReport();
}

function exportableAggregate(): PilotEventAggregate {
  const controller = newController();
  for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
    completeSession(controller);
  }
  controller.refreshPreview();
  const aggregate = controller.view().preview?.aggregate;
  if (!aggregate) throw new Error('Export 可能な Aggregate が必要です。');
  return aggregate;
}

describe('Pilot Measurement の Memory-only Aggregate', () => {
  it('Start、Ready、Outcome、Provider、Self-report を個別 Event なしの Counter にする', () => {
    const controller = newController();
    controller.setResearchEnabled(true);

    controller.start();
    controller.ready(2_000);
    controller.outcome({
      kind: 'bridge',
      provider: 'local-llm',
      monotonicMs: 47_000,
    });
    expect(controller.view().selfReportPending).toBe(true);
    controller.selfReport('started-conversation');
    expect(controller.view().selfReportPending).toBe(false);

    expect(controller.view().aggregate).toEqual({
      aggregateSchemaVersion: PILOT_AGGREGATE_SCHEMA_VERSION,
      minimumAggregationUnit: PILOT_MINIMUM_AGGREGATION_UNIT,
      startReady: { started: 1, ready: 1 },
      readyToBridgeDurationBuckets: {
        under30Seconds: 0,
        from30To89Seconds: 1,
        from90To179Seconds: 0,
        atLeast180Seconds: 0,
      },
      outcomes: { bridge: 1, noSignal: 0 },
      providerRuns: { rules: 0, localLlm: 1, fallback: 0 },
      conversationStartSelfReport: {
        eligible: 1,
        startedConversation: 1,
        notYet: 0,
        preferNotToAnswer: 0,
      },
    });
  });

  it('Ready → Bridge の境界値だけを 4 Bucket へ変換し、正確な duration を残さない', () => {
    const controller = newController();
    for (const durationMs of [
      29_999, 30_000, 89_999, 90_000, 179_999, 180_000,
    ]) {
      completeSession(controller, { durationMs });
    }

    expect(controller.view().aggregate.readyToBridgeDurationBuckets).toEqual({
      under30Seconds: 1,
      from30To89Seconds: 2,
      from90To179Seconds: 2,
      atLeast180Seconds: 1,
    });
    const raw = JSON.stringify(controller.view().aggregate);
    for (const exact of [
      '29999',
      '30000',
      '89999',
      '90000',
      '179999',
      '180000',
    ]) {
      expect(raw).not.toContain(exact);
    }
  });

  it('no-signal は duration と Self-report 対象にせず、Fallback を排他的に 1 件数える', () => {
    const controller = newController();
    completeSession(controller, {
      outcome: 'no-signal',
      provider: 'fallback',
    });

    const aggregate = controller.view().aggregate;
    expect(aggregate.outcomes).toEqual({ bridge: 0, noSignal: 1 });
    expect(aggregate.providerRuns).toEqual({
      rules: 0,
      localLlm: 0,
      fallback: 1,
    });
    expect(aggregate.readyToBridgeDurationBuckets).toEqual({
      under30Seconds: 0,
      from30To89Seconds: 0,
      from90To179Seconds: 0,
      atLeast180Seconds: 0,
    });
    expect(aggregate.conversationStartSelfReport.eligible).toBe(0);
  });

  it('未回答と回答しないを Yes / No に推測せず、Self-report は 1 回だけ受理する', () => {
    const controller = newController();
    completeSession(controller);
    completeSession(controller);
    controller.start();
    controller.ready(100);
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 200 });
    controller.selfReport('not-yet');
    controller.selfReport('started-conversation');
    controller.start();
    controller.ready(300);
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 400 });
    controller.selfReport('prefer-not-to-answer');

    expect(controller.view().aggregate.conversationStartSelfReport).toEqual({
      eligible: 4,
      startedConversation: 0,
      notYet: 1,
      preferNotToAnswer: 1,
    });
  });

  it('順序外、二重 Event、離脱後 Event を no-op にして完了を捏造しない', () => {
    const controller = newController();

    controller.ready(1);
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 2 });
    controller.selfReport('started-conversation');
    expect(controller.view().aggregate.startReady.started).toBe(0);
    controller.setResearchEnabled(true);
    controller.start();
    controller.ready(10);
    controller.ready(11);
    controller.abandon();
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 12 });
    controller.start();
    controller.start();

    expect(controller.view().aggregate.startReady).toEqual({
      started: 3,
      ready: 1,
    });
    expect(controller.view().aggregate.outcomes).toEqual({
      bridge: 0,
      noSignal: 0,
    });
  });

  it('不正 Clock は固定 Error で拒否し、Counter を部分更新しない', () => {
    const controller = newController();
    controller.setResearchEnabled(true);
    controller.start();
    expect(() => controller.ready(Number.NaN)).toThrow(PilotMeasurementError);
    controller.ready(100);

    for (const monotonicMs of [Number.POSITIVE_INFINITY, 99]) {
      expect(() =>
        controller.outcome({
          kind: 'bridge',
          provider: 'rules',
          monotonicMs,
        })
      ).toThrow(PilotMeasurementError);
    }
    expect(controller.view().aggregate.outcomes.bridge).toBe(0);
  });

  it('新しい Controller は前 Process の Counter と未回答を復元しない', () => {
    const first = newController();
    completeSession(first);

    const restarted = newController();
    expect(restarted.view().aggregate.startReady.started).toBe(0);
    restarted.selfReport('started-conversation');
    expect(
      restarted.view().aggregate.conversationStartSelfReport.startedConversation
    ).toBe(0);
    expect(restarted.view().researchEnabled).toBe(false);
    expect(restarted.view().selfReportPending).toBe(false);
  });

  it('Research を無効にすると進行中 Session を破棄し、Product Event を集計しない', () => {
    const controller = newController();
    controller.setResearchEnabled(true);
    controller.start();
    controller.ready(100);
    controller.setResearchEnabled(false);
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 200 });
    controller.start();

    expect(controller.view().researchEnabled).toBe(false);
    expect(controller.view().aggregate.startReady).toEqual({
      started: 1,
      ready: 1,
    });
    expect(controller.view().aggregate.outcomes.bridge).toBe(0);
  });

  it('Schema の Count 上限後は Product を例外で止めず Research だけを無効化する', () => {
    const controller = newController();
    controller.setResearchEnabled(true);
    for (let count = 0; count <= PILOT_AGGREGATE_MAX_COUNT; count += 1) {
      controller.start();
    }

    expect(controller.view().aggregate.startReady.started).toBe(
      PILOT_AGGREGATE_MAX_COUNT
    );
    expect(controller.view().researchEnabled).toBe(false);
    controller.ready(1);
    controller.outcome({ kind: 'bridge', provider: 'rules', monotonicMs: 2 });
    expect(controller.view().aggregate.outcomes.bridge).toBe(0);
  });
});

describe('Pilot Event Aggregate の strict JSON と手動 Share', () => {
  it('Outcome 5 件未満では Preview JSON と Share Port 呼出を作らない', async () => {
    const root = newTemporaryDirectory();
    const controller = createPilotMeasurementController(
      fileDownloadSharePort(root)
    );
    for (
      let count = 0;
      count < PILOT_MINIMUM_AGGREGATION_UNIT - 1;
      count += 1
    ) {
      completeSession(controller);
    }

    controller.refreshPreview();
    expect(controller.view().preview).toBeNull();
    await controller.share();
    expect(
      existsSync(path.join(root, 'tenkacloud-passport-pilot-aggregate.json'))
    ).toBe(false);
  });

  it('5 Outcome で固定 field の Preview を作り、一回限りの明示 Share だけが同じ JSON を渡す', async () => {
    const root = newTemporaryDirectory();
    acceptNativeShare(root);
    const controller = createPilotMeasurementController(
      fileBackedNativeSharePort(root)
    );
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(controller, {
        outcome: count === 4 ? 'no-signal' : 'bridge',
      });
    }

    expect(nativeShareAttemptCount(root)).toBe(0);
    controller.refreshPreview();
    const preview = controller.view().preview;
    expect(preview).not.toBeNull();
    if (!preview) throw new Error('Preview が必要です。');
    expect(preview.aggregate).toMatchSnapshot();
    expect(preview.items.map((item) => item.key)).toEqual([
      'startReady.started',
      'startReady.ready',
      'readyToBridgeDurationBuckets.under30Seconds',
      'readyToBridgeDurationBuckets.from30To89Seconds',
      'readyToBridgeDurationBuckets.from90To179Seconds',
      'readyToBridgeDurationBuckets.atLeast180Seconds',
      'outcomes.bridge',
      'outcomes.noSignal',
      'providerRuns.rules',
      'providerRuns.localLlm',
      'providerRuns.fallback',
      'conversationStartSelfReport.eligible',
      'conversationStartSelfReport.startedConversation',
      'conversationStartSelfReport.notYet',
      'conversationStartSelfReport.preferNotToAnswer',
    ]);
    expect(parsePilotEventAggregate(preview.json)).toEqual(preview.aggregate);

    await controller.share();
    expect(nativeShareAttemptCount(root)).toBe(1);
    expect(nativeShareContent(root)).toBe(preview.json);
    expect(controller.view().notice).toBe('shared');
    expect(controller.view().preview).toBeNull();
    await controller.share();
    expect(nativeShareAttemptCount(root)).toBe(1);
  });

  it('Preview 後の新 Event は Preview を無効化し、再 Preview まで古い JSON を共有しない', async () => {
    const root = newTemporaryDirectory();
    const controller = createPilotMeasurementController(
      fileBackedNativeSharePort(root)
    );
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(controller);
    }
    controller.refreshPreview();
    expect(controller.view().preview).not.toBeNull();

    controller.start();
    expect(controller.view().preview).toBeNull();
    await controller.share();
    expect(nativeShareAttemptCount(root)).toBe(0);
  });

  it('共有中の二重操作は Port を 1 回だけ呼び、dismissed / saved を区別する', async () => {
    const root = newTemporaryDirectory();
    const controller = createPilotMeasurementController(
      fileBackedNativeSharePort(root, { waitForRelease: true })
    );
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(controller);
    }
    controller.refreshPreview();

    const first = controller.share();
    const second = controller.share();
    expect(controller.view().sharing).toBe(true);
    expect(nativeShareAttemptCount(root)).toBe(1);
    releaseNativeShare(root);
    await Promise.all([first, second]);
    expect(controller.view().notice).toBe('dismissed');
    expect(controller.view().preview).not.toBeNull();

    const savedRoot = newTemporaryDirectory();
    const saved = createPilotMeasurementController(
      fileDownloadSharePort(savedRoot)
    );
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(saved);
    }
    saved.refreshPreview();
    const savedPreview = saved.view().preview;
    if (!savedPreview) throw new Error('保存対象の Preview が必要です。');
    await saved.share();
    expect(saved.view().notice).toBe('saved');
    expect(saved.view().preview).toBeNull();
    expect(
      readFileSync(
        path.join(savedRoot, 'tenkacloud-passport-pilot-aggregate.json'),
        'utf8'
      )
    ).toBe(savedPreview.json);
  });

  it('Share 失敗は本文を保持せず固定 Error 状態にし、Reset は Aggregate と Preview を消す', async () => {
    const root = newTemporaryDirectory();
    const controller = createPilotMeasurementController(
      fileDownloadSharePort(path.join(root, '存在しない保存先'))
    );
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(controller);
    }
    controller.refreshPreview();

    await controller.share();
    expect(controller.view().error).toBe(true);
    expect(controller.view().preview).not.toBeNull();
    expect(JSON.stringify(controller.view())).not.toContain(root);
    controller.reset();
    expect(controller.view().aggregate.startReady.started).toBe(0);
    expect(controller.view().preview).toBeNull();
    expect(controller.view().notice).toBeNull();
    expect(controller.view().error).toBe(false);
    expect(controller.view().researchEnabled).toBe(false);
  });

  it('未知 field、不整合 count、5 件未満を固定 Error で拒否する', () => {
    const valid = exportableAggregate();
    const invalid: unknown[] = [
      { ...valid, deviceId: 'stable-device' },
      { ...valid, aggregateSchemaVersion: 2 },
      { ...valid, minimumAggregationUnit: 4 },
      { ...valid, startReady: { ...valid.startReady, started: -1 } },
      { ...valid, startReady: { ...valid.startReady, ready: 99 } },
      { ...valid, providerRuns: { ...valid.providerRuns, rules: 0 } },
      {
        ...valid,
        outcomes: { bridge: 4, noSignal: 0 },
        providerRuns: { rules: 4, localLlm: 0, fallback: 0 },
        conversationStartSelfReport: {
          ...valid.conversationStartSelfReport,
          eligible: 4,
        },
        readyToBridgeDurationBuckets: {
          under30Seconds: 4,
          from30To89Seconds: 0,
          from90To179Seconds: 0,
          atLeast180Seconds: 0,
        },
      },
      null,
      [],
    ];

    for (const value of invalid) {
      expect(() => parsePilotEventAggregate(JSON.stringify(value))).toThrow(
        PilotMeasurementError
      );
    }
  });

  it('過大・壊れた JSON を入力本文なしの固定 Error で拒否する', () => {
    for (const raw of ['{', JSON.stringify({ padding: 'x'.repeat(70_000) })]) {
      try {
        parsePilotEventAggregate(raw);
        throw new Error('PilotMeasurementError が必要です。');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PilotMeasurementError);
        if (error instanceof PilotMeasurementError) {
          expect(error.message).toBe(
            'Pilot Aggregate を読み取れませんでした。'
          );
          expect(error.message).not.toContain(raw.slice(0, 16));
        }
      }
    }
  });

  it('Export JSON は正確な時刻、ID、場所、内容、Network metadata を含まない', () => {
    const controller = newController();
    for (let count = 0; count < PILOT_MINIMUM_AGGREGATION_UNIT; count += 1) {
      completeSession(controller);
    }
    controller.refreshPreview();
    const json = controller.view().preview?.json ?? '';

    for (const forbidden of [
      'timestamp',
      'createdAt',
      'deviceId',
      'participantId',
      'loungeId',
      'ownerAlias',
      'petName',
      'passport',
      'bridgeContent',
      'conversationContent',
      'prompt',
      'output',
      'location',
      'ipAddress',
      'ssid',
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
