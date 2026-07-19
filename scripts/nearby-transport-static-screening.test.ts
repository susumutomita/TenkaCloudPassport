import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  deriveScreeningStatus,
  parseNearbyTransportStaticScreening,
  StaticScreeningConfigError,
  summarizeNearbyTransportStaticScreening,
  verifyNearbyTransportRepositoryBaseline,
} from './nearby-transport-static-screening';

const manifestPath = join(
  import.meta.dir,
  '..',
  'docs/evidence/nearby-transport-static-screening.json'
);

const readManifestSource = (): Promise<string> => Bun.file(manifestPath).text();
const readRepositorySource = (relativePath: string): Promise<string> =>
  Bun.file(join(import.meta.dir, '..', relativePath)).text();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} は object ではありません。`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value))
    throw new Error(`${label} は array ではありません。`);
  return value;
}

async function mutableManifest(): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readManifestSource());
  return requireRecord(value, 'manifest');
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

async function screeningForLockSource(lockSource: string) {
  const manifest = await mutableManifest();
  requireRecord(manifest['baseline'], 'baseline')['bunLockSha256'] =
    sha256(lockSource);
  return parseNearbyTransportStaticScreening(JSON.stringify(manifest));
}

function candidateAt(
  manifest: Readonly<Record<string, unknown>>,
  index: number
): Record<string, unknown> {
  const candidates = requireArray(manifest['candidates'], 'candidates');
  return requireRecord(candidates[index], `candidates[${index}]`);
}

function gate(
  candidate: Readonly<Record<string, unknown>>,
  gateId: string
): Record<string, unknown> {
  const gates = requireRecord(candidate['gates'], 'gates');
  return requireRecord(gates[gateId], `gates.${gateId}`);
}

function provenance(
  candidate: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return requireRecord(candidate['provenance'], 'provenance');
}

function sourceById(
  manifest: Readonly<Record<string, unknown>>,
  sourceId: string
): Record<string, unknown> {
  const sources = requireArray(manifest['sources'], 'sources');
  const source = sources.find(
    (value) => requireRecord(value, 'source')['id'] === sourceId
  );
  if (source === undefined) throw new Error(`${sourceId} がありません。`);
  return requireRecord(source, sourceId);
}

describe('Nearby Transport Phase A manifest 境界', () => {
  it('Repository の4候補から2件の未判定と2件の棄却を導出する', async () => {
    const screening = parseNearbyTransportStaticScreening(
      await readManifestSource()
    );

    expect(summarizeNearbyTransportStaticScreening(screening)).toEqual({
      candidateStatuses: {
        'mdns-tls': 'Not run',
        'webrtc-datachannel': 'Fail',
        'google-nearby': 'Fail',
        'ble-custom': 'Not run',
      },
      screeningStatus: 'Not run',
      passingCandidateIds: [],
      rejectedCandidateIds: ['webrtc-datachannel', 'google-nearby'],
    });
  });

  it('Root または Gate に unknown field があるとき拒否する', async () => {
    const rootUnknown = await mutableManifest();
    rootUnknown['unreviewed'] = true;
    const gateUnknown = await mutableManifest();
    gate(candidateAt(gateUnknown, 0), 'officialSourceAndVersion')['note'] =
      'schema 外';

    for (const value of [rootUnknown, gateUnknown]) {
      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(value))
      ).toThrow(StaticScreeningConfigError);
    }
  });

  it('Package の floating resolution を Official または License Pass にするとき拒否する', async () => {
    for (const gateId of [
      'officialSourceAndVersion',
      'licenseAndMaintenance',
    ]) {
      const manifest = await mutableManifest();
      gate(candidateAt(manifest, 1), gateId)['status'] = 'Pass';

      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(manifest))
      ).toThrow('floating resolution');
    }
  });

  it('Package version または source commit が未解決なのに Official source Pass のとき拒否する', async () => {
    const manifest = await mutableManifest();
    const candidate = candidateAt(manifest, 2);
    gate(candidate, 'officialSourceAndVersion')['status'] = 'Pass';

    expect(() =>
      parseNearbyTransportStaticScreening(JSON.stringify(manifest))
    ).toThrow('unresolved または floating resolution');
  });

  it('Candidate または Screening の導出 Status を Manifest へ手入力するとき拒否する', async () => {
    const candidateStatus = await mutableManifest();
    candidateAt(candidateStatus, 0)['expectedStatus'] = 'Fail';
    const screeningStatus = await mutableManifest();
    screeningStatus['expectedScreeningStatus'] = 'Complete';

    for (const manifest of [candidateStatus, screeningStatus]) {
      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(manifest))
      ).toThrow(StaticScreeningConfigError);
    }
  });

  it('未判定 Gate があるとき Fail より Not run を優先する', async () => {
    const manifest = await mutableManifest();
    const candidate = candidateAt(manifest, 1);
    const unresolvedGate = gate(candidate, 'crossPlatformRoute');
    unresolvedGate['status'] = 'Not run';
    unresolvedGate['reason'] = '未判定';
    unresolvedGate['sourceIds'] = [];

    const screening = parseNearbyTransportStaticScreening(
      JSON.stringify(manifest)
    );
    const summary = summarizeNearbyTransportStaticScreening(screening);

    expect(summary.candidateStatuses['webrtc-datachannel']).toBe('Not run');
    expect(summary.screeningStatus).toBe('Not run');
  });

  it('4候補の Status がすべて Fail のとき viable candidate なしを導出する', () => {
    expect(deriveScreeningStatus(['Fail', 'Fail', 'Fail', 'Fail'])).toBe(
      'No viable candidate'
    );
  });

  it('Candidate の重複、欠落 source、source ID と異なる URL を拒否する', async () => {
    const duplicated = await mutableManifest();
    candidateAt(duplicated, 1)['id'] = 'mdns-tls';
    const missingSource = await mutableManifest();
    gate(candidateAt(missingSource, 0), 'crossPlatformRoute')['sourceIds'] = [
      'missing-source',
    ];
    const untrustedSource = await mutableManifest();
    sourceById(untrustedSource, 'webrtc-release-124-0-7')['url'] =
      'https://github.com/attacker/fake-proof';

    for (const value of [duplicated, missingSource, untrustedSource]) {
      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(value))
      ).toThrow(StaticScreeningConfigError);
    }
  });

  it('Gate を意味の異なる source、不完全な role、既知の不足から Pass にできない', async () => {
    const unsupportedSecureRoute = await mutableManifest();
    const mdnsSecure = gate(
      candidateAt(unsupportedSecureRoute, 0),
      'standardSecureChannel'
    );
    mdnsSecure['status'] = 'Pass';
    mdnsSecure['reason'] = '全証明書を信頼して平文送信する。';
    mdnsSecure['sourceIds'] = ['apple-bonjour'];
    const knownFailure = await mutableManifest();
    gate(candidateAt(knownFailure, 3), 'standardSecureChannel')['status'] =
      'Pass';
    const unrelatedEvidence = await mutableManifest();
    gate(candidateAt(unrelatedEvidence, 0), 'topologyAndDiscovery')[
      'sourceIds'
    ] = ['apple-local-tls', 'android-ssl-socket'];
    const wrongCandidateEvidence = await mutableManifest();
    const mdnsTelemetry = gate(
      candidateAt(wrongCandidateEvidence, 0),
      'applicationControlledTelemetry'
    );
    mdnsTelemetry['status'] = 'Pass';
    mdnsTelemetry['reason'] = '別 Candidate の資料を使う。';
    mdnsTelemetry['sourceIds'] = ['google-nearby-overview'];
    const mdnsOfficialIncomplete = await mutableManifest();
    gate(candidateAt(mdnsOfficialIncomplete, 0), 'officialSourceAndVersion')[
      'sourceIds'
    ] = ['expo-platform-baseline'];
    const mdnsCrossIncomplete = await mutableManifest();
    gate(candidateAt(mdnsCrossIncomplete, 0), 'crossPlatformRoute')[
      'sourceIds'
    ] = ['apple-bonjour'];
    const googleCrossIncomplete = await mutableManifest();
    gate(candidateAt(googleCrossIncomplete, 2), 'crossPlatformRoute')[
      'sourceIds'
    ] = ['google-nearby-overview'];
    const bleCrossIncomplete = await mutableManifest();
    gate(candidateAt(bleCrossIncomplete, 3), 'crossPlatformRoute')[
      'sourceIds'
    ] = ['apple-core-bluetooth'];

    for (const manifest of [
      unsupportedSecureRoute,
      knownFailure,
      unrelatedEvidence,
      wrongCandidateEvidence,
      mdnsOfficialIncomplete,
      mdnsCrossIncomplete,
      googleCrossIncomplete,
      bleCrossIncomplete,
    ]) {
      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(manifest))
      ).toThrow(StaticScreeningConfigError);
    }
  });

  it('Repository と異なる Expo、React Native、Platform SDK baseline を拒否する', async () => {
    for (const [field, value] of [
      ['expoSdk', '999.0.0'],
      ['reactNative', '0.0.1'],
      ['androidCompileSdk', -1],
      ['androidTargetSdk', 999],
      ['iosMinimum', '1.0'],
      ['xcodeMinimum', '1.0'],
    ] as const) {
      const manifest = await mutableManifest();
      requireRecord(manifest['baseline'], 'baseline')[field] = value;

      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(manifest))
      ).toThrow('repository baseline');
    }
  });

  it('System Framework provenance が baseline から drift するとき拒否する', async () => {
    const iosDrift = await mutableManifest();
    const ios = requireRecord(
      provenance(candidateAt(iosDrift, 0))['ios'],
      'provenance.ios'
    );
    ios['buildToolVersion'] = '1.0';
    const androidDrift = await mutableManifest();
    const android = requireRecord(
      provenance(candidateAt(androidDrift, 0))['android'],
      'provenance.android'
    );
    android['compileSdk'] = 1;

    for (const manifest of [iosDrift, androidDrift]) {
      expect(() =>
        parseNearbyTransportStaticScreening(JSON.stringify(manifest))
      ).toThrow('baseline');
    }
  });

  it('package.json と bun.lock の version と SHA-256 を manifest baseline に結合する', async () => {
    const screening = parseNearbyTransportStaticScreening(
      await readManifestSource()
    );
    const [packageSource, lockSource] = await Promise.all([
      readRepositorySource('package.json'),
      readRepositorySource('bun.lock'),
    ]);

    expect(() =>
      verifyNearbyTransportRepositoryBaseline(
        screening,
        packageSource,
        lockSource
      )
    ).not.toThrow();
    expect(() =>
      verifyNearbyTransportRepositoryBaseline(
        screening,
        packageSource.replace('~57.0.7', '~58.0.0'),
        lockSource
      )
    ).toThrow('package.json');
    expect(() =>
      verifyNearbyTransportRepositoryBaseline(
        screening,
        packageSource,
        lockSource.replace('expo@57.0.7', 'expo@58.0.0')
      )
    ).toThrow('bun.lock');
  });

  it('無効 JSON、comment 内の見せかけ、escape した重複 package record の bun.lock を拒否する', async () => {
    const packageSource = await readRepositorySource('package.json');
    const invalidLock =
      '{"workspaces":{},"packages":{}}\n// "expo": ["expo@57.0.7"]';
    const duplicateLock =
      '{"workspaces":{"":{"dependencies":{"expo":"~57.0.7","react-native":"0.86.0"}}},"packages":{"ex\\u0070o":["expo@0.0.0"],"expo":["expo@57.0.7"],"react-native":["react-native@0.86.0"]}}';

    const invalidScreening = await screeningForLockSource(invalidLock);
    const duplicateScreening = await screeningForLockSource(duplicateLock);

    expect(() =>
      verifyNearbyTransportRepositoryBaseline(
        invalidScreening,
        packageSource,
        invalidLock
      )
    ).toThrow(StaticScreeningConfigError);
    expect(() =>
      verifyNearbyTransportRepositoryBaseline(
        duplicateScreening,
        packageSource,
        duplicateLock
      )
    ).toThrow('重複 key');
  });

  it('128 KiB 超過または16階層超過の JSON を parse 前後で拒否する', async () => {
    const manifest = await mutableManifest();
    const oversized = `${JSON.stringify(manifest)}${' '.repeat(128 * 1024)}`;
    let nested: unknown = 'leaf';
    for (let depth = 0; depth < 17; depth += 1) nested = [nested];

    expect(() => parseNearbyTransportStaticScreening(oversized)).toThrow(
      StaticScreeningConfigError
    );
    expect(() =>
      parseNearbyTransportStaticScreening(JSON.stringify(nested))
    ).toThrow(StaticScreeningConfigError);
  });
});
