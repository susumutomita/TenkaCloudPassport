import type {
  DiagnosticErrorCode,
  DiagnosticErrorPhase,
} from './diagnostic-report';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import { LocalDataControlError } from './local-data-control';

export interface DiagnosticRecovery {
  readonly title: string;
  readonly steps: readonly string[];
}

export interface DiagnosticErrorSignal {
  readonly code: DiagnosticErrorCode;
  readonly phase: DiagnosticErrorPhase;
}

export function diagnosticRecovery(
  code: DiagnosticErrorCode,
  locale: Locale = DEFAULT_LOCALE
): DiagnosticRecovery {
  return MESSAGES[locale].diagnostics.recovery[code];
}

export function localDataErrorSignal(error: unknown): DiagnosticErrorSignal {
  if (error instanceof LocalDataControlError) {
    return { code: error.code, phase: 'local-data-delete' };
  }
  return { code: 'UNEXPECTED_FAILURE', phase: 'local-data-delete' };
}
