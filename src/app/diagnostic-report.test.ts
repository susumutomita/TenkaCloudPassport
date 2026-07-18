import { describe, expect, it } from 'bun:test';
import {
  createDiagnosticReportPreview,
  DIAGNOSTIC_REPORT_SCHEMA_VERSION,
  DiagnosticReportError,
  parseDiagnosticReport,
} from './diagnostic-report';

function reportInput() {
  return {
    appVersion: '1.0.0',
    providerStatus: 'falling-back' as const,
    model: {
      architecture: 'llama' as const,
      sizeBytes: 4_294_967_296,
      digest: 'abcdef0123456789'.repeat(4),
    },
    transport: {
      state: 'connected' as const,
      peerCount: 2,
      permission: 'granted' as const,
    },
    lastError: {
      code: 'SCHEMA_ERROR' as const,
      phase: 'model-output' as const,
    },
    storage: {
      profileCount: 1,
      settingsCount: 0,
      backupCacheCount: 0,
      modelCount: 1,
      totalBytes: 4_294_967_512,
    },
  };
}

describe('Sanitized Diagnostic Report の strict allowlist', () => {
  it('許可した現在状態だけを固定 Schema の JSON と Preview にする', () => {
    const preview = createDiagnosticReportPreview(reportInput());

    expect(preview.report).toMatchSnapshot();
    expect(preview.report.reportSchema).toBe(DIAGNOSTIC_REPORT_SCHEMA_VERSION);
    expect(preview.report.model?.digestPrefix).toBe('abcdef01');
    expect(preview.items.map((item) => item.key)).toEqual([
      'version.app',
      'version.protocol',
      'version.profileSchema',
      'provider.status',
      'model.architecture',
      'model.sizeBytes',
      'model.digestPrefix',
      'transport.state',
      'transport.peerCount',
      'transport.permission',
      'error.code',
      'error.phase',
      'storage.profileCount',
      'storage.settingsCount',
      'storage.backupCacheCount',
      'storage.modelCount',
      'storage.totalBytes',
    ]);
    expect(parseDiagnosticReport(preview.json)).toEqual(preview.report);
  });

  it('Report JSON に本文、識別子、時刻、Path、Network metadata、完全 digest を含めない', () => {
    const json = createDiagnosticReportPreview(reportInput()).json;

    for (const forbidden of [
      'passport',
      'answer',
      'bridge',
      'prompt',
      'raw model output',
      'loungeId',
      'participantId',
      'deviceId',
      'generatedAt',
      'fileName',
      'path',
      'ipAddress',
      'ssid',
      'token',
      'secret',
      'abcdef0123456789abcdef',
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('Model 未導入、Error なし、Storage 空を正確に null / 0 で表す', () => {
    const preview = createDiagnosticReportPreview({
      ...reportInput(),
      providerStatus: 'rules',
      model: null,
      lastError: null,
      storage: {
        profileCount: 0,
        settingsCount: 0,
        backupCacheCount: 0,
        modelCount: 0,
        totalBytes: 0,
      },
    });

    expect(preview.report.model).toBeNull();
    expect(preview.report.error).toBeNull();
    expect(preview.report.storage).toEqual({
      profileCount: 0,
      settingsCount: 0,
      backupCacheCount: 0,
      modelCount: 0,
      totalBytes: 0,
    });
  });

  it('未知 field、範囲外 count、不正 digest prefix、不正 enum を入力全体として拒否する', () => {
    const valid = createDiagnosticReportPreview(reportInput()).report;
    const invalidValues: unknown[] = [
      { ...valid, ownerAlias: 'secret owner' },
      {
        ...valid,
        storage: { ...valid.storage, profileCount: -1 },
      },
      {
        ...valid,
        model: valid.model
          ? { ...valid.model, digestPrefix: 'not-hash' }
          : null,
      },
      {
        ...valid,
        transport: { ...valid.transport, state: 'remote-relay' },
      },
      { ...valid, version: { ...valid.version, protocol: '999.0' } },
      null,
      [],
    ];

    for (const value of invalidValues) {
      expect(() => parseDiagnosticReport(JSON.stringify(value))).toThrow(
        DiagnosticReportError
      );
    }
  });

  it('過大 JSON と壊れた JSON を固定 Error で拒否し、入力本文を反射しない', () => {
    for (const raw of ['{', JSON.stringify({ padding: 'x'.repeat(70_000) })]) {
      try {
        parseDiagnosticReport(raw);
        throw new Error('DiagnosticReportError が必要です。');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(DiagnosticReportError);
        if (error instanceof DiagnosticReportError) {
          expect(error.message).toBe('診断 Report を読み取れませんでした。');
          expect(error.message).not.toContain(raw.slice(0, 16));
        }
      }
    }
  });
});
