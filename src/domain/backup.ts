import type { CATALOG_VERSION } from './clue-catalog';
import type { LocalPrivateProfile } from './passport';

export interface DeviceSettings {
  readonly language: 'ja' | 'en';
  readonly reduceMotion: boolean;
  readonly selectedModelDigest: string | null;
  readonly catalogVersion: typeof CATALOG_VERSION;
}

export interface ModelVerification {
  readonly digest: string;
  readonly sizeBytes: number;
  readonly result: 'verified' | 'rejected';
  readonly appVersion: string;
}

export interface Backup {
  readonly backupSchemaVersion: 1;
  readonly exportedAt: string;
  readonly localPrivateProfile: LocalPrivateProfile;
  readonly deviceSettings: DeviceSettings;
  readonly modelVerification: ModelVerification | null;
}
