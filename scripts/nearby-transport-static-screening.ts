import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertOneOf,
  parseBoundedJson,
  SchemaValidationError,
  strictRecord,
  arrayValue as validatedArrayValue,
  integerValue as validatedIntegerValue,
  stringValue as validatedStringValue,
} from '../src/protocol/validation';
import { firstDecodedDuplicateJsoncKey } from './jsonc-duplicate-key';

const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_JSON_DEPTH = 16;

export const STATIC_CANDIDATE_IDS = [
  'mdns-tls',
  'webrtc-datachannel',
  'google-nearby',
  'ble-custom',
] as const;

export const STATIC_GATE_IDS = [
  'officialSourceAndVersion',
  'crossPlatformRoute',
  'expoAndNewArchitecture',
  'standardSecureChannel',
  'licenseAndMaintenance',
  'applicationControlledTelemetry',
  'topologyAndDiscovery',
] as const;

type StaticCandidateId = (typeof STATIC_CANDIDATE_IDS)[number];
type StaticGateId = (typeof STATIC_GATE_IDS)[number];
type StaticGatePolicyKey = `${StaticCandidateId}:${StaticGateId}`;

const CANDIDATE_NAMES = {
  'mdns-tls': 'mDNS + Local WebSocket / Secure Channel',
  'webrtc-datachannel': 'WebRTC DataChannel + QR Signaling',
  'google-nearby': 'Platform Adapter (Multipeer / Nearby)',
  'ble-custom': 'BLE Custom Protocol (comparison only)',
} as const;

const REPOSITORY_BASELINE = {
  expoSdk: '57.0.8',
  reactNative: '0.86.0',
  androidCompileSdk: 36,
  androidTargetSdk: 36,
  iosMinimum: '16.4',
  xcodeMinimum: '26.4',
} as const;

type StaticEvidenceRole =
  | 'baseline'
  | 'ios-api'
  | 'android-api'
  | 'package-source'
  | 'ios-resolution'
  | 'android-resolution'
  | 'package-license'
  | 'shared-route'
  | 'ios-route'
  | 'android-route'
  | 'native-module'
  | 'new-architecture'
  | 'development-build'
  | 'shared-security'
  | 'ios-security'
  | 'android-security'
  | 'android-tls13'
  | 'android-identity-generation'
  | 'android-certificate-access'
  | 'android-certificate-der'
  | 'android-fingerprint-digest'
  | 'android-key-material-loading'
  | 'android-server-alias-selection'
  | 'android-tls-context-installation'
  | 'android-peer-fingerprint-verification'
  | 'android-key-deletion'
  | 'telemetry-control'
  | 'shared-topology'
  | 'ios-topology'
  | 'android-topology';

interface OfficialSourcePolicy {
  readonly url: string;
  readonly gateIds: readonly StaticGateId[];
  readonly roles: readonly StaticEvidenceRole[];
}

const OFFICIAL_SOURCE_CATALOG: Readonly<Record<string, OfficialSourcePolicy>> =
  {
    'expo-platform-baseline': {
      url: 'https://docs.expo.dev/versions/v57.0.0/',
      gateIds: ['officialSourceAndVersion', 'licenseAndMaintenance'],
      roles: ['baseline'],
    },
    'expo-modules-api': {
      url: 'https://docs.expo.dev/modules/module-api/',
      gateIds: ['expoAndNewArchitecture'],
      roles: ['native-module'],
    },
    'expo-new-architecture': {
      url: 'https://docs.expo.dev/guides/new-architecture/',
      gateIds: ['expoAndNewArchitecture'],
      roles: ['new-architecture'],
    },
    'expo-development-builds': {
      url: 'https://docs.expo.dev/develop/development-builds/introduction/',
      gateIds: ['expoAndNewArchitecture'],
      roles: ['development-build'],
    },
    'apple-network-listener': {
      url: 'https://developer.apple.com/documentation/network/nwlistener',
      gateIds: [
        'officialSourceAndVersion',
        'licenseAndMaintenance',
        'topologyAndDiscovery',
      ],
      roles: ['ios-api', 'ios-route', 'ios-topology'],
    },
    'apple-local-tls': {
      url: 'https://developer.apple.com/documentation/network/creating-an-identity-for-local-network-tls',
      gateIds: ['crossPlatformRoute', 'standardSecureChannel'],
      roles: ['ios-route', 'ios-security'],
    },
    'apple-bonjour': {
      url: 'https://developer.apple.com/documentation/network/bonjour',
      gateIds: ['crossPlatformRoute', 'topologyAndDiscovery'],
      roles: ['ios-route', 'ios-topology'],
    },
    'android-nsd-guide': {
      url: 'https://developer.android.com/develop/connectivity/wifi/use-nsd',
      gateIds: ['crossPlatformRoute', 'topologyAndDiscovery'],
      roles: ['android-route', 'android-topology'],
    },
    'android-nsd-manager': {
      url: 'https://developer.android.com/reference/android/net/nsd/NsdManager',
      gateIds: ['officialSourceAndVersion', 'licenseAndMaintenance'],
      roles: ['android-api'],
    },
    'android-ssl-socket': {
      url: 'https://developer.android.com/reference/javax/net/ssl/SSLSocket',
      gateIds: [
        'officialSourceAndVersion',
        'crossPlatformRoute',
        'standardSecureChannel',
      ],
      roles: [
        'android-api',
        'android-route',
        'android-security',
        'android-tls13',
      ],
    },
    'android-keygen-parameter-spec': {
      url: 'https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder.html',
      gateIds: ['standardSecureChannel'],
      roles: ['android-identity-generation'],
    },
    'android-key-store': {
      url: 'https://developer.android.com/reference/java/security/KeyStore.html',
      gateIds: ['standardSecureChannel'],
      roles: ['android-certificate-access', 'android-key-deletion'],
    },
    'android-key-manager-factory': {
      url: 'https://developer.android.com/reference/javax/net/ssl/KeyManagerFactory',
      gateIds: ['standardSecureChannel'],
      roles: ['android-key-material-loading'],
    },
    'android-x509-key-manager': {
      url: 'https://developer.android.com/reference/javax/net/ssl/X509KeyManager',
      gateIds: ['standardSecureChannel'],
      roles: ['android-server-alias-selection'],
    },
    'android-ssl-context': {
      url: 'https://developer.android.com/reference/javax/net/ssl/SSLContext',
      gateIds: ['standardSecureChannel'],
      roles: ['android-tls-context-installation'],
    },
    'android-certificate': {
      url: 'https://developer.android.com/reference/java/security/cert/Certificate',
      gateIds: ['standardSecureChannel'],
      roles: ['android-certificate-der'],
    },
    'android-message-digest': {
      url: 'https://developer.android.com/reference/java/security/MessageDigest',
      gateIds: ['standardSecureChannel'],
      roles: ['android-fingerprint-digest'],
    },
    'android-x509-trust-manager-api': {
      url: 'https://developer.android.com/reference/javax/net/ssl/X509TrustManager',
      gateIds: ['standardSecureChannel'],
      roles: ['android-peer-fingerprint-verification'],
    },
    'webrtc-release-124-0-7': {
      url: 'https://github.com/react-native-webrtc/react-native-webrtc/commit/5ecc86111c2f8e0d152d719f8b7b357a601150b6',
      gateIds: ['officialSourceAndVersion', 'licenseAndMaintenance'],
      roles: ['package-source'],
    },
    'webrtc-android-build': {
      url: 'https://github.com/react-native-webrtc/react-native-webrtc/blob/5ecc86111c2f8e0d152d719f8b7b357a601150b6/android/build.gradle',
      gateIds: [
        'officialSourceAndVersion',
        'licenseAndMaintenance',
        'applicationControlledTelemetry',
      ],
      roles: ['android-resolution'],
    },
    'webrtc-ios-podspec': {
      url: 'https://github.com/react-native-webrtc/react-native-webrtc/blob/5ecc86111c2f8e0d152d719f8b7b357a601150b6/react-native-webrtc.podspec',
      gateIds: [
        'officialSourceAndVersion',
        'licenseAndMaintenance',
        'applicationControlledTelemetry',
      ],
      roles: ['ios-resolution'],
    },
    'webrtc-basic-usage': {
      url: 'https://react-native-webrtc.github.io/handbook/guides/basic-usage.html',
      gateIds: [
        'crossPlatformRoute',
        'standardSecureChannel',
        'topologyAndDiscovery',
      ],
      roles: ['shared-route', 'shared-security', 'shared-topology'],
    },
    'webrtc-expo': {
      url: 'https://react-native-webrtc.github.io/handbook/guides/extra-steps/expo.html',
      gateIds: ['expoAndNewArchitecture'],
      roles: ['native-module', 'development-build'],
    },
    'google-nearby-overview': {
      url: 'https://developers.google.com/nearby/connections/overview',
      gateIds: [
        'officialSourceAndVersion',
        'crossPlatformRoute',
        'standardSecureChannel',
        'licenseAndMaintenance',
        'applicationControlledTelemetry',
        'topologyAndDiscovery',
      ],
      roles: [
        'package-source',
        'android-route',
        'shared-security',
        'android-topology',
      ],
    },
    'google-nearby-strategies': {
      url: 'https://developers.google.com/nearby/connections/strategies',
      gateIds: ['topologyAndDiscovery'],
      roles: ['shared-topology'],
    },
    'google-nearby-swift': {
      url: 'https://developers.google.com/nearby/connections/swift/get-started',
      gateIds: [
        'officialSourceAndVersion',
        'crossPlatformRoute',
        'expoAndNewArchitecture',
        'licenseAndMaintenance',
      ],
      roles: ['package-source', 'ios-route'],
    },
    'apple-core-bluetooth': {
      url: 'https://developer.apple.com/documentation/corebluetooth',
      gateIds: [
        'officialSourceAndVersion',
        'crossPlatformRoute',
        'standardSecureChannel',
        'licenseAndMaintenance',
        'topologyAndDiscovery',
      ],
      roles: ['ios-api', 'ios-route', 'ios-security', 'ios-topology'],
    },
    'android-ble': {
      url: 'https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview',
      gateIds: [
        'officialSourceAndVersion',
        'crossPlatformRoute',
        'standardSecureChannel',
        'licenseAndMaintenance',
        'topologyAndDiscovery',
      ],
      roles: [
        'android-api',
        'android-route',
        'android-security',
        'android-topology',
      ],
    },
  };

const KNOWN_PASS_BLOCKERS: ReadonlySet<StaticGatePolicyKey> = new Set([
  'webrtc-datachannel:expoAndNewArchitecture',
  'webrtc-datachannel:standardSecureChannel',
  'webrtc-datachannel:applicationControlledTelemetry',
  'google-nearby:expoAndNewArchitecture',
  'google-nearby:standardSecureChannel',
  'google-nearby:applicationControlledTelemetry',
  'google-nearby:topologyAndDiscovery',
  'ble-custom:standardSecureChannel',
  'ble-custom:topologyAndDiscovery',
]);

const CANDIDATE_SOURCE_ID_PREFIXES: Readonly<
  Record<StaticCandidateId, readonly string[]>
> = {
  'mdns-tls': [
    'expo-',
    'apple-network-',
    'apple-local-',
    'apple-bonjour',
    'android-nsd-',
    'android-ssl-',
    'android-x509-',
    'android-key',
    'android-certificate',
    'android-message-',
  ],
  'webrtc-datachannel': ['expo-', 'webrtc-'],
  'google-nearby': ['expo-', 'google-nearby-'],
  'ble-custom': ['expo-', 'apple-core-bluetooth', 'android-ble'],
};

export type StaticGateStatus = 'Pass' | 'Fail' | 'Not run';
export type StaticCandidateStatus = StaticGateStatus;
export type StaticScreeningStatus =
  | 'Complete'
  | 'No viable candidate'
  | 'Not run';

interface StaticSource {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly locator: string;
}

interface PackageResolution {
  readonly platform: 'shared' | 'ios' | 'android';
  readonly artifact: string;
  readonly declaredVersion: string | null;
  readonly resolution: 'exact' | 'floating' | 'unresolved';
}

interface PackageProvenance {
  readonly kind: 'package';
  readonly version: string | null;
  readonly tag: string | null;
  readonly sourceCommit: string | null;
  readonly resolutions: readonly PackageResolution[];
}

interface IosSystemProvenance {
  readonly buildTool: 'Xcode';
  readonly buildToolVersion: string;
  readonly minimumOs: string;
  readonly framework: string;
  readonly apiRoute: string;
}

interface AndroidSystemProvenance {
  readonly buildTool: 'Expo SDK Android toolchain';
  readonly minimumApi: number;
  readonly compileSdk: number;
  readonly targetSdk: number;
  readonly framework: string;
  readonly apiRoute: string;
}

interface SystemFrameworkProvenance {
  readonly kind: 'system-framework';
  readonly ios: IosSystemProvenance;
  readonly android: AndroidSystemProvenance;
}

type CandidateProvenance = PackageProvenance | SystemFrameworkProvenance;

interface StaticGateResult {
  readonly status: StaticGateStatus;
  readonly reason: string;
  readonly sourceIds: readonly string[];
}

interface StaticCandidate {
  readonly id: StaticCandidateId;
  readonly name: string;
  readonly exactRoute: string;
  readonly rationale: string;
  readonly provenance: CandidateProvenance;
  readonly gates: Readonly<Record<StaticGateId, StaticGateResult>>;
}

interface StaticBaseline {
  readonly expoSdk: string;
  readonly reactNative: string;
  readonly androidCompileSdk: number;
  readonly androidTargetSdk: number;
  readonly iosMinimum: string;
  readonly xcodeMinimum: string;
  readonly packageJsonSha256: string;
  readonly bunLockSha256: string;
}

export interface NearbyTransportStaticScreening {
  readonly schemaVersion: 1;
  readonly reviewedMonth: string;
  readonly baseline: StaticBaseline;
  readonly sources: readonly StaticSource[];
  readonly candidates: readonly StaticCandidate[];
}

export interface NearbyTransportStaticScreeningSummary {
  readonly candidateStatuses: Readonly<
    Record<StaticCandidateId, StaticCandidateStatus>
  >;
  readonly screeningStatus: StaticScreeningStatus;
  readonly passingCandidateIds: readonly StaticCandidateId[];
  readonly rejectedCandidateIds: readonly StaticCandidateId[];
}

export class StaticScreeningConfigError extends Error {
  readonly code = 'INVALID_STATIC_SCREENING';

  constructor(message: string) {
    super(message);
    this.name = 'StaticScreeningConfigError';
  }
}

function invalid(message: string): never {
  throw new StaticScreeningConfigError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${label} は object である必要があります。`);
  return value;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string
): void {
  strictRecord(value, label, allowed);
}

function stringValue(
  value: Readonly<Record<string, unknown>>,
  key: string,
  label: string
): string {
  const candidate = validatedStringValue(value[key], `${label}.${key}`, 4096);
  if (candidate.trim().length === 0) {
    invalid(`${label}.${key} は空でない文字列である必要があります。`);
  }
  return candidate;
}

function nullableStringValue(
  value: Readonly<Record<string, unknown>>,
  key: string,
  label: string
): string | null {
  const candidate = value[key];
  if (candidate === null) return null;
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    invalid(
      `${label}.${key} は空でない文字列または null である必要があります。`
    );
  }
  return candidate;
}

function integerValue(
  value: Readonly<Record<string, unknown>>,
  key: string,
  label: string
): number {
  return validatedIntegerValue(value[key], `${label}.${key}`, -1000, 1000);
}

function arrayValue(
  value: Readonly<Record<string, unknown>>,
  key: string,
  label: string
): unknown[] {
  return [...validatedArrayValue(value[key], `${label}.${key}`, 0, 1000)];
}

function literal<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  return assertOneOf(value, allowed, label);
}

function parseSource(value: unknown, index: number): StaticSource {
  const label = `sources[${index}]`;
  const source = record(value, label);
  exactKeys(source, ['id', 'label', 'url', 'locator'], label);
  const id = stringValue(source, 'id', label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    invalid(`${label}.id は lowercase kebab-case である必要があります。`);
  }
  const url = stringValue(source, 'url', label);
  const officialSource = OFFICIAL_SOURCE_CATALOG[id];
  if (officialSource === undefined || url !== officialSource.url) {
    invalid(
      `${label}.url は source ID に固定した公式 URL である必要があります。`
    );
  }
  return {
    id,
    label: stringValue(source, 'label', label),
    url,
    locator: stringValue(source, 'locator', label),
  };
}

function parseBaseline(value: unknown): StaticBaseline {
  const baseline = record(value, 'baseline');
  exactKeys(
    baseline,
    [
      'expoSdk',
      'reactNative',
      'androidCompileSdk',
      'androidTargetSdk',
      'iosMinimum',
      'xcodeMinimum',
      'packageJsonSha256',
      'bunLockSha256',
    ],
    'baseline'
  );
  const expoSdk = stringValue(baseline, 'expoSdk', 'baseline');
  const reactNative = stringValue(baseline, 'reactNative', 'baseline');
  for (const [label, version] of [
    ['baseline.expoSdk', expoSdk],
    ['baseline.reactNative', reactNative],
  ] as const) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      invalid(`${label} は exact semver である必要があります。`);
    }
  }
  const parsed: StaticBaseline = {
    expoSdk,
    reactNative,
    androidCompileSdk: integerValue(baseline, 'androidCompileSdk', 'baseline'),
    androidTargetSdk: integerValue(baseline, 'androidTargetSdk', 'baseline'),
    iosMinimum: stringValue(baseline, 'iosMinimum', 'baseline'),
    xcodeMinimum: stringValue(baseline, 'xcodeMinimum', 'baseline'),
    packageJsonSha256: stringValue(baseline, 'packageJsonSha256', 'baseline'),
    bunLockSha256: stringValue(baseline, 'bunLockSha256', 'baseline'),
  };
  for (const [field, expected] of Object.entries(REPOSITORY_BASELINE)) {
    if (parsed[field as keyof StaticBaseline] !== expected) {
      invalid(
        `baseline.${field} は repository baseline ${expected} と一致する必要があります。`
      );
    }
  }
  for (const field of ['packageJsonSha256', 'bunLockSha256'] as const) {
    if (!/^[0-9a-f]{64}$/.test(parsed[field])) {
      invalid(
        `baseline.${field} は 64 桁の lowercase SHA-256 である必要があります。`
      );
    }
  }
  return parsed;
}

function parsePackageResolution(
  value: unknown,
  candidateId: StaticCandidateId,
  index: number
): PackageResolution {
  const label = `candidates.${candidateId}.provenance.resolutions[${index}]`;
  const resolution = record(value, label);
  exactKeys(
    resolution,
    ['platform', 'artifact', 'declaredVersion', 'resolution'],
    label
  );
  const declaredVersion = nullableStringValue(
    resolution,
    'declaredVersion',
    label
  );
  const classification = literal(
    resolution['resolution'],
    ['exact', 'floating', 'unresolved'] as const,
    `${label}.resolution`
  );
  const isExactSemver =
    declaredVersion !== null &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(declaredVersion);
  if (classification === 'exact' && !isExactSemver) {
    invalid(`${label} の exact resolution は exact semver が必要です。`);
  }
  if (classification === 'unresolved' && declaredVersion !== null) {
    invalid(
      `${label} の unresolved resolution は declaredVersion を null にします。`
    );
  }
  if (
    classification === 'floating' &&
    (declaredVersion === null || isExactSemver)
  ) {
    invalid(
      `${label} の floating resolution と declaredVersion が一致しません。`
    );
  }
  return {
    platform: literal(
      resolution['platform'],
      ['shared', 'ios', 'android'] as const,
      `${label}.platform`
    ),
    artifact: stringValue(resolution, 'artifact', label),
    declaredVersion,
    resolution: classification,
  };
}

function parsePackageProvenance(
  value: Readonly<Record<string, unknown>>,
  candidateId: StaticCandidateId
): PackageProvenance {
  const label = `candidates.${candidateId}.provenance`;
  exactKeys(
    value,
    ['kind', 'version', 'tag', 'sourceCommit', 'resolutions'],
    label
  );
  const version = nullableStringValue(value, 'version', label);
  if (
    version !== null &&
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    invalid(
      `${label}.version は exact semver または null である必要があります。`
    );
  }
  const sourceCommit = nullableStringValue(value, 'sourceCommit', label);
  if (sourceCommit !== null && !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    invalid(
      `${label}.sourceCommit は 40 桁の lowercase Git commit である必要があります。`
    );
  }
  const resolutions = arrayValue(value, 'resolutions', label).map(
    (resolution, index) =>
      parsePackageResolution(resolution, candidateId, index)
  );
  if (resolutions.length === 0)
    invalid(`${label}.resolutions は 1 件以上必要です。`);
  return {
    kind: 'package',
    version,
    tag: nullableStringValue(value, 'tag', label),
    sourceCommit,
    resolutions,
  };
}

function parseIosSystemProvenance(
  value: unknown,
  label: string,
  baseline: StaticBaseline
): IosSystemProvenance {
  const platform = record(value, label);
  exactKeys(
    platform,
    ['buildTool', 'buildToolVersion', 'minimumOs', 'framework', 'apiRoute'],
    label
  );
  const parsed: IosSystemProvenance = {
    buildTool: literal(
      platform['buildTool'],
      ['Xcode'] as const,
      `${label}.buildTool`
    ),
    buildToolVersion: stringValue(platform, 'buildToolVersion', label),
    minimumOs: stringValue(platform, 'minimumOs', label),
    framework: stringValue(platform, 'framework', label),
    apiRoute: stringValue(platform, 'apiRoute', label),
  };
  if (
    parsed.buildToolVersion !== baseline.xcodeMinimum ||
    parsed.minimumOs !== baseline.iosMinimum
  ) {
    invalid(`${label} は iOS / Xcode baseline と一致する必要があります。`);
  }
  return parsed;
}

function parseAndroidSystemProvenance(
  value: unknown,
  label: string,
  baseline: StaticBaseline
): AndroidSystemProvenance {
  const platform = record(value, label);
  exactKeys(
    platform,
    [
      'buildTool',
      'minimumApi',
      'compileSdk',
      'targetSdk',
      'framework',
      'apiRoute',
    ],
    label
  );
  const parsed: AndroidSystemProvenance = {
    buildTool: literal(
      platform['buildTool'],
      ['Expo SDK Android toolchain'] as const,
      `${label}.buildTool`
    ),
    minimumApi: integerValue(platform, 'minimumApi', label),
    compileSdk: integerValue(platform, 'compileSdk', label),
    targetSdk: integerValue(platform, 'targetSdk', label),
    framework: stringValue(platform, 'framework', label),
    apiRoute: stringValue(platform, 'apiRoute', label),
  };
  if (
    parsed.minimumApi < 1 ||
    parsed.minimumApi > baseline.androidCompileSdk ||
    parsed.compileSdk !== baseline.androidCompileSdk ||
    parsed.targetSdk !== baseline.androidTargetSdk
  ) {
    invalid(`${label} は Android SDK baseline と一致する必要があります。`);
  }
  return parsed;
}

function parseProvenance(
  value: unknown,
  candidateId: StaticCandidateId,
  baseline: StaticBaseline
): CandidateProvenance {
  const provenance = record(value, `candidates.${candidateId}.provenance`);
  const kind = literal(
    provenance['kind'],
    ['package', 'system-framework'] as const,
    `candidates.${candidateId}.provenance.kind`
  );
  if (kind === 'package')
    return parsePackageProvenance(provenance, candidateId);
  const label = `candidates.${candidateId}.provenance`;
  exactKeys(provenance, ['kind', 'ios', 'android'], label);
  return {
    kind: 'system-framework',
    ios: parseIosSystemProvenance(provenance['ios'], `${label}.ios`, baseline),
    android: parseAndroidSystemProvenance(
      provenance['android'],
      `${label}.android`,
      baseline
    ),
  };
}

function parseGate(
  value: unknown,
  candidateId: StaticCandidateId,
  gateId: StaticGateId,
  sourceIds: ReadonlySet<string>
): StaticGateResult {
  const label = `candidates.${candidateId}.gates.${gateId}`;
  const gate = record(value, label);
  exactKeys(gate, ['status', 'reason', 'sourceIds'], label);
  const status = literal(
    gate['status'],
    ['Pass', 'Fail', 'Not run'] as const,
    `${label}.status`
  );
  const referencedSources = arrayValue(gate, 'sourceIds', label).map(
    (sourceId, index) => {
      if (typeof sourceId !== 'string' || sourceId.length === 0) {
        invalid(
          `${label}.sourceIds[${index}] は空でない文字列である必要があります。`
        );
      }
      if (!sourceIds.has(sourceId)) {
        invalid(`${label}.sourceIds[${index}] が存在しません: ${sourceId}`);
      }
      return sourceId;
    }
  );
  if (new Set(referencedSources).size !== referencedSources.length) {
    invalid(`${label}.sourceIds に重複があります。`);
  }
  if (status === 'Not run' && referencedSources.length !== 0) {
    invalid(`${label} が Not run のとき sourceIds は空にします。`);
  }
  if (status !== 'Not run' && referencedSources.length === 0) {
    invalid(`${label} が ${status} のとき sourceIds が必要です。`);
  }
  return {
    status,
    reason: stringValue(gate, 'reason', label),
    sourceIds: referencedSources,
  };
}

function deriveCandidateStatus(
  gates: Readonly<Record<StaticGateId, StaticGateResult>>
): StaticCandidateStatus {
  const statuses = STATIC_GATE_IDS.map((gateId) => gates[gateId].status);
  if (statuses.includes('Not run')) return 'Not run';
  return statuses.every((status) => status === 'Pass') ? 'Pass' : 'Fail';
}

function requiredPassEvidenceRoleAlternatives(
  candidate: StaticCandidate,
  gateId: StaticGateId
): readonly (readonly StaticEvidenceRole[])[] {
  switch (gateId) {
    case 'officialSourceAndVersion':
      return candidate.provenance.kind === 'system-framework'
        ? [['baseline', 'ios-api', 'android-api']]
        : [['package-source', 'ios-resolution', 'android-resolution']];
    case 'crossPlatformRoute':
      return [['shared-route'], ['ios-route', 'android-route']];
    case 'expoAndNewArchitecture':
      return [['native-module', 'new-architecture', 'development-build']];
    case 'standardSecureChannel':
      if (candidate.id === 'mdns-tls') {
        return [
          [
            'ios-security',
            'android-tls13',
            'android-identity-generation',
            'android-certificate-access',
            'android-certificate-der',
            'android-fingerprint-digest',
            'android-key-material-loading',
            'android-server-alias-selection',
            'android-tls-context-installation',
            'android-peer-fingerprint-verification',
            'android-key-deletion',
          ],
        ];
      }
      return [['shared-security'], ['ios-security', 'android-security']];
    case 'licenseAndMaintenance':
      return candidate.provenance.kind === 'system-framework'
        ? [['ios-api', 'android-api']]
        : [['package-license', 'ios-resolution', 'android-resolution']];
    case 'applicationControlledTelemetry':
      return [['telemetry-control']];
    case 'topologyAndDiscovery':
      return [['shared-topology'], ['ios-topology', 'android-topology']];
  }
}

function evidenceRolesForGate(
  candidateId: StaticCandidateId,
  gateId: StaticGateId,
  sourceIds: readonly string[]
): ReadonlySet<StaticEvidenceRole> {
  const evidenceRoles = new Set<StaticEvidenceRole>();
  for (const sourceId of sourceIds) {
    const sourcePolicy = OFFICIAL_SOURCE_CATALOG[sourceId];
    const belongsToCandidate = CANDIDATE_SOURCE_ID_PREFIXES[candidateId].some(
      (prefix) => sourceId.startsWith(prefix)
    );
    if (
      sourcePolicy === undefined ||
      !sourcePolicy.gateIds.includes(gateId) ||
      !belongsToCandidate
    ) {
      invalid(
        `candidates.${candidateId}.gates.${gateId} に意味の異なる source ${sourceId} は使えません。`
      );
    }
    for (const role of sourcePolicy.roles) evidenceRoles.add(role);
  }
  return evidenceRoles;
}

function hasRequiredPassEvidence(
  candidate: StaticCandidate,
  gateId: StaticGateId,
  evidenceRoles: ReadonlySet<StaticEvidenceRole>
): boolean {
  return requiredPassEvidenceRoleAlternatives(candidate, gateId).some(
    (alternative) => alternative.every((role) => evidenceRoles.has(role))
  );
}

function assertGateEvidencePolicy(candidate: StaticCandidate): void {
  for (const gateId of STATIC_GATE_IDS) {
    const gate = candidate.gates[gateId];
    if (gate.status === 'Not run') continue;
    if (
      gate.status === 'Pass' &&
      KNOWN_PASS_BLOCKERS.has(`${candidate.id}:${gateId}`)
    ) {
      invalid(
        `candidates.${candidate.id}.gates.${gateId} は既知の不足があるため Pass にできません。`
      );
    }
    const evidenceRoles = evidenceRolesForGate(
      candidate.id,
      gateId,
      gate.sourceIds
    );
    if (
      gate.status === 'Pass' &&
      !hasRequiredPassEvidence(candidate, gateId, evidenceRoles)
    ) {
      invalid(
        `candidates.${candidate.id}.gates.${gateId} は Pass に必要な evidence role が不足しています。`
      );
    }
  }
}

function assertPackageGateConsistency(candidate: StaticCandidate): void {
  if (candidate.provenance.kind !== 'package') return;
  const provenance = candidate.provenance;
  const unresolved =
    provenance.version === null ||
    provenance.tag === null ||
    provenance.sourceCommit === null ||
    provenance.resolutions.some(
      (resolution) => resolution.resolution === 'unresolved'
    );
  const floating = provenance.resolutions.some(
    (resolution) => resolution.resolution === 'floating'
  );
  if (
    (unresolved || floating) &&
    candidate.gates.officialSourceAndVersion.status === 'Pass'
  ) {
    invalid(
      `candidates.${candidate.id} は unresolved または floating resolution のまま Official source を Pass にできません。`
    );
  }
  if (
    (unresolved || floating) &&
    candidate.gates.licenseAndMaintenance.status === 'Pass'
  ) {
    invalid(
      `candidates.${candidate.id} は unresolved または floating resolution のまま License Gate を Pass にできません。`
    );
  }
}

function parseCandidate(
  value: unknown,
  index: number,
  sourceIds: ReadonlySet<string>,
  baseline: StaticBaseline
): StaticCandidate {
  const label = `candidates[${index}]`;
  const candidate = record(value, label);
  exactKeys(
    candidate,
    ['id', 'name', 'exactRoute', 'rationale', 'provenance', 'gates'],
    label
  );
  const id = literal(candidate['id'], STATIC_CANDIDATE_IDS, `${label}.id`);
  if (id !== STATIC_CANDIDATE_IDS[index]) {
    invalid(
      `${label}.id は ${STATIC_CANDIDATE_IDS[index]} である必要があります。`
    );
  }
  const name = stringValue(candidate, 'name', label);
  if (name !== CANDIDATE_NAMES[id]) {
    invalid(
      `${label}.name は Protocol の Candidate 名と一致する必要があります。`
    );
  }
  const rawGates = record(candidate['gates'], `${label}.gates`);
  exactKeys(rawGates, STATIC_GATE_IDS, `${label}.gates`);
  const gates = Object.fromEntries(
    STATIC_GATE_IDS.map((gateId) => [
      gateId,
      parseGate(rawGates[gateId], id, gateId, sourceIds),
    ])
  ) as Record<StaticGateId, StaticGateResult>;
  const parsed: StaticCandidate = {
    id,
    name,
    exactRoute: stringValue(candidate, 'exactRoute', label),
    rationale: stringValue(candidate, 'rationale', label),
    provenance: parseProvenance(candidate['provenance'], id, baseline),
    gates,
  };
  assertPackageGateConsistency(parsed);
  assertGateEvidencePolicy(parsed);
  return parsed;
}

export function deriveScreeningStatus(
  statuses: readonly StaticCandidateStatus[]
): StaticScreeningStatus {
  if (statuses.includes('Not run')) return 'Not run';
  if (statuses.every((status) => status === 'Fail'))
    return 'No viable candidate';
  return 'Complete';
}

function parseNearbyTransportStaticScreeningUnchecked(
  source: string
): NearbyTransportStaticScreening {
  const value = parseBoundedJson(source, MAX_MANIFEST_BYTES, MAX_JSON_DEPTH);
  const manifest = record(value, 'manifest');
  exactKeys(
    manifest,
    ['schemaVersion', 'reviewedMonth', 'baseline', 'sources', 'candidates'],
    'manifest'
  );
  if (manifest['schemaVersion'] !== 1) {
    invalid('manifest.schemaVersion は 1 である必要があります。');
  }
  const reviewedMonth = stringValue(manifest, 'reviewedMonth', 'manifest');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(reviewedMonth)) {
    invalid('manifest.reviewedMonth は YYYY-MM である必要があります。');
  }
  const sources = arrayValue(manifest, 'sources', 'manifest').map(parseSource);
  if (sources.length === 0) invalid('manifest.sources は 1 件以上必要です。');
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length)
    invalid('manifest.sources.id に重複があります。');
  const baseline = parseBaseline(manifest['baseline']);
  const rawCandidates = arrayValue(manifest, 'candidates', 'manifest');
  if (rawCandidates.length !== STATIC_CANDIDATE_IDS.length) {
    invalid(
      `manifest.candidates は ${STATIC_CANDIDATE_IDS.length} 件必要です。`
    );
  }
  const candidates = rawCandidates.map((candidate, index) =>
    parseCandidate(candidate, index, sourceIds, baseline)
  );
  return {
    schemaVersion: 1,
    reviewedMonth,
    baseline,
    sources,
    candidates,
  };
}

export function parseNearbyTransportStaticScreening(
  source: string
): NearbyTransportStaticScreening {
  try {
    return parseNearbyTransportStaticScreeningUnchecked(source);
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) return invalid(error.message);
    throw error;
  }
}

export function summarizeNearbyTransportStaticScreening(
  screening: NearbyTransportStaticScreening
): NearbyTransportStaticScreeningSummary {
  const candidateStatuses = Object.fromEntries(
    screening.candidates.map((candidate) => [
      candidate.id,
      deriveCandidateStatus(candidate.gates),
    ])
  ) as Record<StaticCandidateId, StaticCandidateStatus>;
  const passingCandidateIds = STATIC_CANDIDATE_IDS.filter(
    (candidateId) => candidateStatuses[candidateId] === 'Pass'
  );
  const rejectedCandidateIds = STATIC_CANDIDATE_IDS.filter(
    (candidateId) => candidateStatuses[candidateId] === 'Fail'
  );
  return {
    candidateStatuses,
    screeningStatus: deriveScreeningStatus(Object.values(candidateStatuses)),
    passingCandidateIds,
    rejectedCandidateIds,
  };
}

export function nearbyTransportStaticScreeningRecordRows(
  screening: NearbyTransportStaticScreening
): readonly (readonly string[])[] {
  const summary = summarizeNearbyTransportStaticScreening(screening);
  return screening.candidates.map((candidate) => [
    candidate.name,
    candidate.exactRoute,
    ...STATIC_GATE_IDS.map((gateId) => {
      const gate = candidate.gates[gateId];
      return `${gate.status} — ${gate.reason}`;
    }),
    `\`${summary.candidateStatuses[candidate.id]}\``,
    candidate.rationale,
  ]);
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function parseJsonRecord(
  source: string,
  label: string
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    invalid(`${label} は有効な JSON である必要があります。`);
  }
  return record(value, label);
}

function parseJsoncRecord(
  source: string,
  label: string
): Record<string, unknown> {
  const duplicate = firstDecodedDuplicateJsoncKey(source, label);
  if (duplicate !== null) {
    invalid(`${label} に重複 key があります: ${duplicate}`);
  }
  let value: unknown;
  try {
    value = Bun.JSONC.parse(source);
  } catch {
    invalid(`${label} は有効な JSONC である必要があります。`);
  }
  return record(value, label);
}

export function verifyNearbyTransportRepositoryBaseline(
  screening: NearbyTransportStaticScreening,
  packageSource: string,
  lockSource: string
): void {
  if (sha256(packageSource) !== screening.baseline.packageJsonSha256) {
    invalid(
      'package.json SHA-256 が Static Screening baseline と一致しません。'
    );
  }
  if (sha256(lockSource) !== screening.baseline.bunLockSha256) {
    invalid('bun.lock SHA-256 が Static Screening baseline と一致しません。');
  }
  const packageRecord = parseJsonRecord(packageSource, 'package.json');
  const dependencies = record(
    packageRecord['dependencies'],
    'package.json.dependencies'
  );
  if (dependencies['expo'] !== `~${screening.baseline.expoSdk}`) {
    invalid(
      'package.json の expo が Static Screening baseline と一致しません。'
    );
  }
  if (dependencies['react-native'] !== screening.baseline.reactNative) {
    invalid(
      'package.json の react-native が Static Screening baseline と一致しません。'
    );
  }
  const lockRecord = parseJsoncRecord(lockSource, 'bun.lock');
  const rootWorkspace = record(
    record(lockRecord['workspaces'], 'bun.lock.workspaces')[''],
    'bun.lock.workspaces[""]'
  );
  const rootLockDependencies = record(
    rootWorkspace['dependencies'],
    'bun.lock.workspaces[""].dependencies'
  );
  const lockPackages = record(lockRecord['packages'], 'bun.lock.packages');
  for (const [packageName, declaration, resolution] of [
    ['expo', `~${screening.baseline.expoSdk}`, screening.baseline.expoSdk],
    [
      'react-native',
      screening.baseline.reactNative,
      screening.baseline.reactNative,
    ],
  ] as const) {
    if (rootLockDependencies[packageName] !== declaration) {
      invalid(
        `bun.lock workspace の ${packageName} declaration が baseline と一致しません。`
      );
    }
    const packageEntry = validatedArrayValue(
      lockPackages[packageName],
      `bun.lock.packages.${packageName}`,
      1,
      10
    );
    if (packageEntry[0] !== `${packageName}@${resolution}`) {
      invalid(
        `bun.lock の ${packageName} resolution は一意な baseline と一致する必要があります。`
      );
    }
  }
}

async function main(): Promise<void> {
  const manifestArgument = Bun.argv[2];
  if (manifestArgument === undefined) {
    invalid('Static Screening manifest path を指定してください。');
  }
  const manifestPath = path.resolve(manifestArgument);
  const repositoryRoot = path.resolve('.');
  const [manifestSource, packageSource, lockSource] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
    readFile(path.join(repositoryRoot, 'bun.lock'), 'utf8'),
  ]);
  const screening = parseNearbyTransportStaticScreening(manifestSource);
  verifyNearbyTransportRepositoryBaseline(screening, packageSource, lockSource);
  const summary = summarizeNearbyTransportStaticScreening(screening);
  for (const candidateId of STATIC_CANDIDATE_IDS) {
    console.log(`${candidateId}: ${summary.candidateStatuses[candidateId]}`);
  }
  console.log(`Static Screening Status: ${summary.screeningStatus}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof StaticScreeningConfigError) {
      console.error(`[${error.code}] ${error.message}`);
    } else {
      console.error(
        'Nearby Transport Static Screening に失敗しました。',
        error
      );
    }
    process.exitCode = 1;
  });
}
