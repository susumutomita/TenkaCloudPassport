import { expect, it } from 'bun:test';
import { downloadFailureMessage } from './download-failure-message';

it('shows phase-specific recovery without treating storage or integrity errors as network outages', () => {
  expect(downloadFailureMessage(true, false, new Error('abort'))).toContain(
    'Download cancelled'
  );
  expect(
    downloadFailureMessage(false, true, new Error('QuotaExceeded'))
  ).toContain('Save failed; check device storage. QuotaExceeded');
  expect(
    downloadFailureMessage(false, false, new Error('checksum mismatch'))
  ).toContain('Download or validation failed. checksum mismatch');
  expect(downloadFailureMessage(false, false, 'unknown')).not.toContain(
    'retry when connected'
  );
});
