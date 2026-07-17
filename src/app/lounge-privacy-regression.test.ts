import { afterEach, describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import {
  type ActiveLounge,
  completeLounge,
  evaluateLounge,
} from '../domain/lounge';
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
  beginPetInteraction,
  submitOwnerQuestionAnswer,
} from './pet-interaction-flow';
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
  // Issue 11: Owner Question / Pet Interaction 由来の語彙。clarifying を経由した
  // Bridge 確定でもこれらが Storage へ漏れないことを固定する。`"candidateClue":`
  // （単数形 + コロン）は Local Private Profile の `candidateClues`（複数形）フィールドと
  // 前方一致で衝突しないよう区別する。
  'confirm-shared-clue',
  'clarifying',
  '"candidateClue":',
  'questionId',
  'sharingConsent',
  'purpose',
  'canOffer',
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
 * Room の forming から双方 Ready（Active Lounge 開始直前）までの手順は、Bridge 確定
 * シナリオでも Owner Question の `clarifying` シナリオでも同一である。この共通手順を
 * 1 箇所へ集約し、2 つの Lifecycle 関数（`runFullLoungeLifecycleWithBridge` /
 * `runFullLoungeLifecycleWithClarifyingQuestion`）の重複を避ける。
 */
function startActiveLounge(): ActiveLounge {
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
  if (active.status !== 'active') throw new Error('active が必要です。');
  return active;
}

/**
 * Room の forming から Bridge が確定して完全破棄されるまでのフル行程を、実際に
 * PassportApp が呼ぶのと同じ Use Case 関数の並びで実行する。この行程のどの関数も
 * `LocalProfileStoragePort` を一切呼ばないため、Storage には Owner の Local Profile 以外
 * 何も増えないはずである、という Privacy 契約を Regression Test として固定する。
 */
function runFullLoungeLifecycleWithBridge(): void {
  const active = startActiveLounge();
  const retired = evaluateLounge(active, RULES_PROVIDER, {
    wallClockMs: CLOCK.wallClockMs + 1_000,
    monotonicMs: CLOCK.monotonicMs + 1_000,
  });
  if (retired.status !== 'retired' || retired.outcome.kind !== 'bridge') {
    throw new Error('Bridge が確定した retired が必要です。');
  }
  completeLounge(retired);
}

/**
 * Issue 11: Owner Question の `clarifying` を経由して Owner が「答える」（yes）を最終
 * Consent まで確定した場合も、実際に `PassportApp` が呼ぶのと同じ `pet-interaction-flow.ts`
 * の関数列だけで Bridge が確定し、`LocalProfileStoragePort` を一切呼ばないことを固定する。
 * Owner Question への回答（Owner Answer）と任意メモは Lounge 終了後の Storage / Backup の
 * どちらにも存在しないという受け入れ条件を、この経路でも検証する。
 */
function runFullLoungeLifecycleWithClarifyingQuestion(): void {
  const active = startActiveLounge();
  const evaluationClock = {
    wallClockMs: CLOCK.wallClockMs + 1_000,
    monotonicMs: CLOCK.monotonicMs + 1_000,
  };
  const begun = beginPetInteraction(
    active,
    RULES_INTERACTION_PROVIDER,
    evaluationClock
  );
  if (begun.interaction?.phase !== 'clarifying') {
    throw new Error('clarifying の候補が必要です。');
  }
  // Owner が「答える」を選び、最終確認を経て 'yes' を確定した状態を模す
  // （メモは常に任意であり、選択肢だけでも回答が完結することの一環として省略する）。
  const answered = submitOwnerQuestionAnswer(
    begun.interaction,
    active,
    'yes',
    evaluationClock
  );
  if (
    answered.lounge.status !== 'retired' ||
    answered.lounge.outcome.kind !== 'bridge'
  ) {
    throw new Error('Bridge が確定した retired が必要です。');
  }
  completeLounge(answered.lounge);
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

  it('Owner Question の clarifying を経由した Bridge 確定でも、Web 相当の Storage は Local Profile 以外のキーを持たない', async () => {
    const root = newTemporaryDirectory();
    const webStorage = new FileBackedWebStorage(root);
    const storagePort = new WebLocalProfileStorageAdapter(webStorage);

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithClarifyingQuestion();

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

  it('Owner Question の clarifying を経由した Bridge 確定でも、Native 相当の Storage は Local Profile 用の 1 ファイルしか持たない', async () => {
    const root = newTemporaryDirectory();
    const filePath = path.join(root, 'local-profile.json');
    const storagePort = new ExpoFileSystemLocalProfileStorageAdapter(
      new BunProfileDocument(filePath)
    );

    await storagePort.save(ownerProfile());
    runFullLoungeLifecycleWithClarifyingQuestion();

    expect(readdirSync(root)).toEqual(['local-profile.json']);

    const restored = await storagePort.load();
    expect(restored).not.toBeNull();
    for (const key of Object.keys(restored ?? {})) {
      expect(ALLOWED_PROFILE_KEYS).toContain(key);
    }
  });

  it('Backup 型は Local Profile 由来の情報だけを持ち、Lounge / Pet Interaction 由来の語彙を含まない', async () => {
    const text = await Bun.file(
      new URL('../domain/backup.ts', import.meta.url)
    ).text();

    for (const forbidden of [
      ...FORBIDDEN_SUBSTRINGS,
      'PetInteraction',
      'OwnerQuestion',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('Owner Question の回答画面・段階は Storage Port を一切 import しない（メモも含めて端末へ保存しない）', async () => {
    for (const fileName of [
      '../screens/OwnerQuestionScreen.tsx',
      './owner-question-answer-flow.ts',
      './owner-question-disclosure.ts',
      './pet-interaction-flow.ts',
    ]) {
      const text = await Bun.file(new URL(fileName, import.meta.url)).text();
      expect(text).not.toContain('local-profile-storage');
      expect(text).not.toContain('LocalProfileStoragePort');
    }
  });
});
