import { afterEach, describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { completeLounge, evaluateLounge } from '../domain/lounge';
import {
  createLoungeRoom,
  joinLoungeRoom,
  markParticipantReady,
  startLoungeFromRoom,
} from '../domain/lounge-room';
import {
  createLocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import { RULES_PROVIDER } from '../domain/rules-provider';
import { createSessionIdentifiers } from '../domain/session-identifiers';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import { ExpoFileSystemLocalProfileStorageAdapter } from './expo-file-system-local-profile-storage';
import {
  BunProfileDocument,
  FileBackedWebStorage,
  removeTemporaryDirectory,
  temporaryDirectory,
} from './storage-test-kit';
import {
  LOCAL_PROFILE_STORAGE_KEY,
  WebLocalProfileStorageAdapter,
} from './web-local-profile-storage';

const CLOCK = { wallClockMs: 1_700_000_000_000, monotonicMs: 10_000 };

/**
 * `LocalPrivateProfile`（`src/domain/passport.ts`）が持つ最上位 key の allowlist。
 * Storage へ書き込まれた JSON がこれ以外の key を持つ場合、Lounge / Bridge / Peer 由来の
 * データが紛れ込んでいる可能性がある。
 */
const ALLOWED_PROFILE_KEYS = [
  'schemaVersion',
  'catalogVersion',
  'petName',
  'petEmoji',
  'ownerAlias',
  'candidateClues',
  'excludedTopics',
  'languages',
].sort();

const FORBIDDEN_SUBSTRINGS = [
  'loungeId',
  'expiresAtWallClockMs',
  'startedAtMonotonicMs',
  'ownerPassport',
  'encounteredPassport',
  'outcome',
  'messageKey',
  'evidence',
  'no-signal',
  'participantId',
  'ROOM_CAPACITY',
  'Bridge',
];

function ownerProfile() {
  return createLocalPrivateProfile({
    petName: 'こむぎ',
    petEmoji: '🐾',
    ownerAlias: 'つちのこ',
    candidateClueIds: ['open-source'],
    selectedForPassportClueIds: ['open-source'],
    languageCodes: ['ja'],
  });
}

/**
 * Room の forming から Bridge が確定して完全破棄されるまでのフル行程を、実際に
 * PassportApp が呼ぶのと同じ Use Case 関数の並びで実行する。この行程のどの関数も
 * `LocalProfileStoragePort` を一切呼ばないため、Storage には Owner の Local Profile 以外
 * 何も増えないはずである、という Privacy 契約を Regression Test として固定する。
 */
function runFullLoungeLifecycleWithBridge(): void {
  const hostIdentifiers = createSessionIdentifiers(webCryptoRandomBytes);
  const guestIdentifiers = createSessionIdentifiers(webCryptoRandomBytes);
  const sharedClueIds = ['open-source'];
  const hostProfile = createLocalPrivateProfile({
    petName: 'ホスト',
    petEmoji: '🐾',
    ownerAlias: '',
    candidateClueIds: sharedClueIds,
    selectedForPassportClueIds: sharedClueIds,
    languageCodes: [],
  });
  const guestProfile = createLocalPrivateProfile({
    petName: 'ゲスト',
    petEmoji: '🐶',
    ownerAlias: '',
    candidateClueIds: sharedClueIds,
    selectedForPassportClueIds: sharedClueIds,
    languageCodes: [],
  });
  const hostPassport = projectPublicPassport(hostProfile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: sharedClueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });
  const guestPassport = projectPublicPassport(guestProfile, {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: false,
    clueIds: sharedClueIds,
    languageCodes: [],
    ownerConfirmed: true,
  });

  const room = createLoungeRoom({
    loungeId: hostIdentifiers.loungeId,
    clock: CLOCK,
  });
  const joinedHost = joinLoungeRoom(room, {
    participantId: hostIdentifiers.participantId,
    publicPassport: hostPassport,
    clock: CLOCK,
  });
  const joinedGuest = joinLoungeRoom(joinedHost, {
    participantId: guestIdentifiers.participantId,
    publicPassport: guestPassport,
    clock: CLOCK,
  });
  const hostReady = markParticipantReady(joinedGuest, {
    participantId: hostIdentifiers.participantId,
    clock: CLOCK,
  });
  const bothReady = markParticipantReady(hostReady, {
    participantId: guestIdentifiers.participantId,
    clock: CLOCK,
  });
  if (bothReady.status !== 'ready') throw new Error('ready が必要です。');

  const active = startLoungeFromRoom(bothReady);
  const retired = evaluateLounge(active, RULES_PROVIDER, {
    wallClockMs: CLOCK.wallClockMs + 1_000,
    monotonicMs: CLOCK.monotonicMs + 1_000,
  });
  if (retired.status !== 'retired' || retired.outcome.kind !== 'bridge') {
    throw new Error('Bridge が確定した retired が必要です。');
  }
  completeLounge(retired);
}

const temporaryRoots: string[] = [];

function newTemporaryDirectory(): string {
  const directory = temporaryDirectory();
  temporaryRoots.push(directory);
  return directory;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    removeTemporaryDirectory(root);
  }
});

describe('Lounge 由来データの Storage 不揮発化を保証する Privacy Regression Test', () => {
  it('Web 相当の Storage は、Bridge 確定から完全破棄までの全行程を経ても Local Profile 以外のキーを持たない', async () => {
    const root = newTemporaryDirectory();
    const webStorage = new FileBackedWebStorage(root);
    const storagePort = new WebLocalProfileStorageAdapter(webStorage);

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithBridge();

    expect(webStorage.listKeys()).toEqual([LOCAL_PROFILE_STORAGE_KEY]);

    const raw = webStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(raw ?? '').not.toContain(forbidden);
    }
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect(ALLOWED_PROFILE_KEYS).toContain(key);
    }
  });

  it('Native（実ファイル I/O）相当の Storage も、同じ行程を経て保存先ディレクトリに Local Profile 用の 1 ファイルしか作らない', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const storagePort = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithBridge();

    expect(readdirSync(root)).toEqual(['local-profile.json']);

    const restored = await storagePort.load();
    expect(restored).not.toBeNull();
    for (const key of Object.keys(restored ?? {})) {
      expect(ALLOWED_PROFILE_KEYS).toContain(key);
    }
  });
});
