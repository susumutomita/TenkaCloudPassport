import { describe, expect, it } from 'bun:test';
import {
  diagnosticRecovery,
  localDataErrorSignal,
} from './diagnostic-recovery';
import type { DiagnosticErrorCode } from './diagnostic-report';
import { LocalDataControlError } from './local-data-control';

const CODES: readonly DiagnosticErrorCode[] = [
  'TIMEOUT',
  'CANCELLED',
  'SCHEMA_ERROR',
  'LOAD_ERROR',
  'STORAGE_FAILURE',
  'DELETE_INTERRUPTED',
  'MODEL_IN_USE',
  'PERMISSION_DENIED',
  'TRANSPORT_UNAVAILABLE',
  'UNEXPECTED_FAILURE',
];

describe('Diagnostic Error Code の JA / EN Recovery', () => {
  it('全 Error Code が JA / EN の空でない固定手順へ到達する', () => {
    for (const code of CODES) {
      const ja = diagnosticRecovery(code, 'ja');
      const en = diagnosticRecovery(code, 'en');
      expect(ja.title.length).toBeGreaterThan(0);
      expect(ja.steps.length).toBeGreaterThan(0);
      expect(en.title.length).toBeGreaterThan(0);
      expect(en.steps.length).toBeGreaterThan(0);
      expect(ja).not.toEqual(en);
    }
  });

  it('削除中断は再起動または再試行、Model 使用中は Context 終了を案内する', () => {
    expect(
      diagnosticRecovery('DELETE_INTERRUPTED', 'ja').steps.join('')
    ).toContain('再');
    expect(diagnosticRecovery('MODEL_IN_USE', 'en').steps.join(' ')).toContain(
      'Model'
    );
  });

  it('Local Data の型付き失敗だけを Code へ写し、未知の失敗本文は反射しない', () => {
    expect(
      localDataErrorSignal(
        new LocalDataControlError('DELETE_INTERRUPTED', true)
      )
    ).toEqual({ code: 'DELETE_INTERRUPTED', phase: 'local-data-delete' });
    expect(localDataErrorSignal(new Error('private file path'))).toEqual({
      code: 'UNEXPECTED_FAILURE',
      phase: 'local-data-delete',
    });
  });
});
