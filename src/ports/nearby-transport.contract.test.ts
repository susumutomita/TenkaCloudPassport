import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoopbackNearbyNetwork } from '../adapters/loopback-nearby-transport';
import { NearbyTransportError } from './nearby-transport';
import {
  type CreateNearbyTransportDiagnosticsHarness,
  runNearbyTransportContract,
  runNearbyTransportDiagnosticsContract,
} from './nearby-transport-contract-test-kit';
import {
  validateNearbyHostAuthorization,
  validateNearbyHostBinding,
} from './nearby-transport-validation';

const createLoopbackHarness: CreateNearbyTransportDiagnosticsHarness = () => {
  const network = createLoopbackNearbyNetwork();
  return {
    createTransport: () => network.createTransport(),
    interrupt: (transport, condition) =>
      network.reportCondition(transport, condition),
    activeEndpointCount: () => network.activeEndpointCount,
    activeListenerCount: (transport) => network.activeListenerCount(transport),
    queuedEnvelopeCount: (transport) => network.queuedEnvelopeCount(transport),
  };
};

runNearbyTransportContract('Loopback Reference Adapter', createLoopbackHarness);
runNearbyTransportDiagnosticsContract(
  'Loopback Reference Adapter',
  createLoopbackHarness
);

async function productionSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await productionSources(path)));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.test\.(?:ts|tsx)$/.test(entry.name) &&
      !path.endsWith('src/adapters/loopback-nearby-transport.ts') &&
      !path.endsWith('src/ports/nearby-transport-contract-test-kit.ts')
    ) {
      sources.push(path);
    }
  }
  return sources;
}

describe('Loopback Reference Adapter の Production 境界', () => {
  it('App、Domain、Protocol、UIのProduction SourceからReference Adapterをimportしない', async () => {
    const paths = ['App.tsx', 'index.ts', ...(await productionSources('src'))];
    const importingPaths: string[] = [];
    for (const path of paths) {
      if (
        (await readFile(path, 'utf8')).includes('loopback-nearby-transport')
      ) {
        importingPaths.push(path);
      }
    }
    expect(importingPaths).toEqual([]);
  });
});

describe('Nearby Transport 共有 Binding Validator', () => {
  it('既知data fieldだけを凍結して再構築する', () => {
    const binding = validateNearbyHostBinding({
      hostDiscoveryHint: 'nearby://host-1',
      transportFingerprint: `sha256_${'01'.repeat(32)}`,
    });
    expect(binding).toEqual({
      hostDiscoveryHint: 'nearby://host-1',
      transportFingerprint: `sha256_${'01'.repeat(32)}`,
    });
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it('未知fieldと不正値を固定Errorで拒否する', () => {
    const candidates = [
      JSON.parse('null'),
      JSON.parse(
        JSON.stringify({
          hostDiscoveryHint: 'nearby://host-1',
          transportFingerprint: `sha256_${'01'.repeat(32)}`,
          unexpectedField: true,
        })
      ),
      JSON.parse(
        JSON.stringify({
          hostDiscoveryHint: 'invalid hint with spaces',
          transportFingerprint: 'native-error-detail',
        })
      ),
    ];
    for (const candidate of candidates) {
      expect(() => validateNearbyHostBinding(candidate)).toThrow(
        NearbyTransportError
      );
    }
  });

  it('不正BindingではAuthorizationのdata disposeだけを実行する', () => {
    let disposeCount = 0;
    const authorization = {
      invite: null,
      async authorizeJoin() {
        throw new Error('must-not-run');
      },
      async waitUntilReady() {
        throw new Error('must-not-run');
      },
      dispose() {
        disposeCount += 1;
      },
    };
    expect(() =>
      validateNearbyHostAuthorization(
        authorization,
        JSON.parse(
          JSON.stringify({
            hostDiscoveryHint: 'invalid hint',
            transportFingerprint: 'invalid fingerprint',
          })
        )
      )
    ).toThrow(NearbyTransportError);
    expect(disposeCount).toBe(1);
  });
});
