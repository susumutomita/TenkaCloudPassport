import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';

function measurementSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'pilot-measurement.ts');
}

function flowSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'use-pilot-measurement-flow.ts');
}

function appSource(): Promise<string> {
  return readSourceFile(import.meta.url, 'PassportApp.tsx');
}

function selfReportScreenSource(): Promise<string> {
  return readSourceFile(
    import.meta.url,
    '../screens/ConversationSelfReportScreen.tsx'
  );
}

describe('Pilot Measurement の自動収集禁止境界', () => {
  it('Repository の Event Aggregate JSON Schema も Runtime と同じ固定 field と最低単位を持つ', async () => {
    const raw = await Bun.file(
      new URL(
        '../../docs/research/event-aggregate.schema.json',
        import.meta.url
      )
    ).text();
    const schema = JSON.parse(raw) as {
      readonly additionalProperties: boolean;
      readonly required: readonly string[];
      readonly properties: Readonly<
        Record<string, { readonly const?: number }>
      >;
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([
      'aggregateSchemaVersion',
      'minimumAggregationUnit',
      'startReady',
      'readyToBridgeDurationBuckets',
      'outcomes',
      'providerRuns',
      'conversationStartSelfReport',
    ]);
    const { aggregateSchemaVersion, minimumAggregationUnit } =
      schema.properties;
    expect(aggregateSchemaVersion?.const).toBe(1);
    expect(minimumAggregationUnit?.const).toBe(5);
  });

  it('Aggregate と UI Flow は Network / 永続 Storage API を import または実行しない', async () => {
    const sources = [
      await measurementSource(),
      await flowSource(),
      await selfReportScreenSource(),
    ];
    for (const source of sources) {
      for (const forbidden of [
        'fetch(',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'sendBeacon',
        'AsyncStorage',
        'localStorage',
        'sessionStorage',
        'LocalProfileStorage',
        'http://',
        'https://',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it('依存 manifest と lockfile に Analytics / Crash / Advertising SDK がない', async () => {
    const packageManifest = await Bun.file(
      new URL('../../package.json', import.meta.url)
    ).text();
    const lockfile = await Bun.file(
      new URL('../../bun.lock', import.meta.url)
    ).text();
    const combined = `${packageManifest}\n${lockfile}`.toLowerCase();

    for (const forbidden of [
      '@sentry/',
      'firebase-analytics',
      '@firebase/analytics',
      '@amplitude/analytics',
      'mixpanel',
      '@segment/analytics',
      'crashlytics',
      'appcenter-analytics',
      'bugsnag',
      'posthog',
      'appsflyer',
      'logrocket',
      '@vercel/analytics',
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it('Share Port は Preview 後の明示 share() だけに現れる', async () => {
    const source = await measurementSource();
    const shareStart = source.indexOf('async function share()');
    const shareEnd = source.indexOf('return {', shareStart);
    const shareBody = source.slice(shareStart, shareEnd);

    expect(shareStart).toBeGreaterThan(-1);
    expect(source.match(/sharePort\.share\(/g)).toHaveLength(1);
    expect(shareBody).toContain('preview');
    expect(shareBody).toContain('sharePort.share({');
  });

  it('Composition Root は Start / Ready / Outcome / Self-report と全削除 Reset を明示配線する', async () => {
    const source = await appSource();

    expect(source).toContain('pilotMeasurementFlow.start()');
    expect(source).toContain('pilotMeasurementFlow.selfReportPending');
    expect(source).toContain('pilotMeasurementFlow.ready(');
    expect(source).toContain('pilotMeasurementFlow.outcome({');
    expect(source).toContain('pilotMeasurementFlow.selfReport(');
    expect(source).toContain('pilotMeasurementFlow.skipSelfReport()');
    expect(source).toContain('pilotMeasurementFlow.reset()');
  });
});
