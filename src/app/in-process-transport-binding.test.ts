import { describe, expect, it } from 'bun:test';
import { inProcessTransportFingerprint } from './in-process-transport-binding';

describe('単一端末 Transport Binding', () => {
  it('Lounge-scoped identity の SHA-256 Known-answer を返す', () => {
    expect(
      inProcessTransportFingerprint('lng_00000000000000000000000000000001')
    ).toBe(
      'sha256_2c488452c2fa9c87673bbf56ff05e7b83d11ec9a8f0e95500238d1669ca4e22c'
    );
  });

  it('別 Lounge では相関可能な Fingerprint を再利用しない', () => {
    expect(
      inProcessTransportFingerprint('lng_00000000000000000000000000000001')
    ).not.toBe(
      inProcessTransportFingerprint('lng_00000000000000000000000000000002')
    );
  });
});
