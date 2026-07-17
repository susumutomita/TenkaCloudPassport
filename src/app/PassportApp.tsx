import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import type { ClockSnapshot, LoungeState } from '../domain/lounge';
import {
  advanceLoungeRoom,
  createLoungeRoom,
  inviteForRoom,
  joinLoungeRoom,
  type LoungeRoomState,
  markParticipantReady,
  startLoungeFromRoom,
} from '../domain/lounge-room';
import {
  createLocalPrivateProfile,
  type LocalPrivateProfile,
  type PetEmoji,
  PROFILE_MAX_CLUES,
  PROFILE_MAX_LANGUAGES,
  PUBLIC_PASSPORT_MAX_CLUES,
} from '../domain/passport';
import {
  createSessionIdentifiers,
  type ParticipantId,
} from '../domain/session-identifiers';
import { encodeQrPayload } from '../protocol/qr-payload';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import ActiveLoungeScreen from '../screens/ActiveLoungeScreen';
import DestroyedLoungeScreen from '../screens/DestroyedLoungeScreen';
import EncounterSetupScreen from '../screens/EncounterSetupScreen';
import HostInviteScreen from '../screens/HostInviteScreen';
import OutcomeScreen from '../screens/OutcomeScreen';
import PassportCreationScreen from '../screens/PassportCreationScreen';
import PassportSharePreviewScreen from '../screens/PassportSharePreviewScreen';
import ProfileLoadingScreen from '../screens/ProfileLoadingScreen';
import QrScanScreen from '../screens/QrScanScreen';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
} from './local-profile-storage';
import { reduceLounge } from './lounge-reducer';
import {
  createDefaultPassportShareSelection,
  createPassportShare,
  type PassportShareSelection,
  reducePassportShareSelection,
  toggleClueId,
  toggleLanguageCode,
} from './passport-share';
import {
  type ProfileNotice,
  profileNoticeFromStorageError,
} from './profile-notice';
import { qrFlowErrorMessage } from './qr-error-notice';
import { scanQrPayload } from './qr-scan-flow';
import {
  type CameraPermissionState,
  createInProcessQrScannerPort,
} from './qr-scanner-port';

interface PassportAppProps {
  readonly localProfileStorage: LocalProfileStoragePort;
}

type SetupStage =
  | 'profile'
  | 'encounter'
  | 'share-preview'
  | 'host-invite'
  | 'guest-scan'
  | 'guest-share-preview';

function currentClock(): ClockSnapshot {
  return {
    wallClockMs: Date.now(),
    monotonicMs: performance.now(),
  };
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '入力を確認して、もう一度実行してください。';
}

function resolveGuestProfile(
  buildGuestProfile: () => LocalPrivateProfile
): LocalPrivateProfile | null {
  try {
    return buildGuestProfile();
  } catch {
    return null;
  }
}

interface SharePreviewGateProps {
  readonly profile: LocalPrivateProfile;
  readonly selection: PassportShareSelection;
  readonly errorMessage: string | null;
  readonly onSelectionChange: Dispatch<
    SetStateAction<PassportShareSelection | null>
  >;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

/**
 * Owner（Host）の共有 Preview と Guest の共有 Preview は、対象の Profile / Selection /
 * 主操作が違うだけで同じ確認 UI を使う。ここへ集約することで PassportApp 本体の
 * 分岐数を抑える。
 */
function SharePreviewGate({
  profile,
  selection,
  errorMessage,
  onSelectionChange,
  onStart,
  onBack,
}: SharePreviewGateProps) {
  let previewItems = null;
  let validationMessage = errorMessage;
  try {
    previewItems = createPassportShare(profile, selection).preview.items;
  } catch (error: unknown) {
    validationMessage = readableError(error);
  }
  function dispatch(
    action: Parameters<typeof reducePassportShareSelection>[1]
  ): void {
    onSelectionChange((current) =>
      current ? reducePassportShareSelection(current, action) : current
    );
  }
  return (
    <PassportSharePreviewScreen
      onBack={onBack}
      onStart={onStart}
      onToggleClue={(id) => dispatch({ type: 'toggle-clue', id })}
      onToggleLanguage={(code) => dispatch({ type: 'toggle-language', code })}
      onToggleOwnerAlias={() => dispatch({ type: 'toggle-owner-alias' })}
      onTogglePetEmoji={() => dispatch({ type: 'toggle-pet-emoji' })}
      onTogglePetName={() => dispatch({ type: 'toggle-pet-name' })}
      previewItems={previewItems}
      profile={profile}
      selection={selection}
      validationMessage={validationMessage}
    />
  );
}

export default function PassportApp({ localProfileStorage }: PassportAppProps) {
  // M1 にはカメラ実機がないため、既定値は 'granted' にして単一端末デモをその場で
  // 完走させる（docs/design/qr-invite-and-ready-flow.md）。5 状態すべての UI 分岐は
  // src/app/qr-scanner-port.test.ts と src/app/camera-permission-notice.test.ts が
  // Port を個別の初期状態で構成して検証する。
  const [qrScannerPort] = useState(() =>
    createInProcessQrScannerPort('granted')
  );
  const [restoring, setRestoring] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<SetupStage>('profile');
  const [notice, setNotice] = useState<ProfileNotice>({
    kind: 'empty',
    message: 'Pet と会話の材料を入力し、端末内保存を明示してください。',
  });
  const [petName, setPetName] = useState('');
  const [petEmoji, setPetEmoji] = useState<PetEmoji>('🐾');
  const [ownerAlias, setOwnerAlias] = useState('');
  const [ownerSelection, setOwnerSelection] = useState<ClueId[]>([]);
  const [languageSelection, setLanguageSelection] = useState<LanguageCode[]>(
    []
  );
  const [privateProfile, setPrivateProfile] =
    useState<LocalPrivateProfile | null>(null);
  const [shareSelection, setShareSelection] =
    useState<PassportShareSelection | null>(null);
  const [encounteredPetName, setEncounteredPetName] = useState('');
  const [encounteredPetEmoji, setEncounteredPetEmoji] =
    useState<PetEmoji>('🐶');
  const [encounteredSelection, setEncounteredSelection] = useState<ClueId[]>(
    []
  );
  const [encounteredConfirmed, setEncounteredConfirmed] = useState(false);
  const [guestShareSelection, setGuestShareSelection] =
    useState<PassportShareSelection | null>(null);
  const [lounge, setLounge] = useState<LoungeState | null>(null);
  const [loungeRoom, setLoungeRoom] = useState<LoungeRoomState | null>(null);
  const [guestProfile, setGuestProfile] = useState<LocalPrivateProfile | null>(
    null
  );
  const [seenRawPayloads, setSeenRawPayloads] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionState>('not-determined');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // invite は loungeRoom（forming / ready）から一意に導出できるため、独立した state に
  // せず同期の取り忘れを構造的に防ぐ。expired / null では QR に表示するものがない。
  const invite = useMemo(
    () =>
      loungeRoom && loungeRoom.status !== 'expired'
        ? inviteForRoom(loungeRoom)
        : null,
    [loungeRoom]
  );
  const inviteQrPayload = useMemo(
    () =>
      invite ? encodeQrPayload({ kind: 'lounge-invite', value: invite }) : null,
    [invite]
  );
  // Host は hostLounge() で常に Room 作成直後の最初の参加者として join するため、
  // 独立した state を持たず loungeRoom から導出する（invite と同じ理由）。
  const hostParticipantId: ParticipantId | null = useMemo(() => {
    if (!loungeRoom || loungeRoom.status === 'expired') return null;
    return loungeRoom.participants[0]?.participantId ?? null;
  }, [loungeRoom]);

  useEffect(() => {
    let active = true;
    void localProfileStorage
      .load()
      .then((profile) => {
        if (!active) return;
        if (!profile) {
          setNotice({
            kind: 'empty',
            message:
              '保存済み Profile はありません。入力は明示保存するまで復元されません。',
          });
          return;
        }
        setPetName(profile.petName);
        setPetEmoji(profile.petEmoji);
        setOwnerAlias(profile.ownerAlias ?? '');
        setOwnerSelection(profile.candidateClues.map((clue) => clue.value));
        setLanguageSelection([...profile.languages]);
        setPrivateProfile(profile);
        setShareSelection(createDefaultPassportShareSelection(profile));
        setStage('encounter');
        setNotice({
          kind: 'restored',
          message: '明示保存済みの Local Profile だけを復元しました。',
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice(profileNoticeFromStorageError(error, 'load'));
        }
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [localProfileStorage]);

  useEffect(() => {
    if (!lounge || lounge.status === 'destroyed') return undefined;
    const timer = setInterval(() => {
      setLounge((current) =>
        current
          ? reduceLounge(current, {
              type: 'clock-tick',
              clock: currentClock(),
            })
          : current
      );
    }, 1_000);
    return () => clearInterval(timer);
  }, [lounge]);

  useEffect(() => {
    if (!loungeRoom || loungeRoom.status === 'expired') return undefined;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      setLoungeRoom((current) =>
        current ? advanceLoungeRoom(current, currentClock()) : current
      );
    }, 1_000);
    return () => clearInterval(timer);
  }, [loungeRoom]);

  async function saveLocalProfile(): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      const profile = createLocalPrivateProfile({
        petName,
        petEmoji,
        ownerAlias,
        candidateClueIds: ownerSelection,
        selectedForPassportClueIds: ownerSelection,
        languageCodes: languageSelection,
      });
      await localProfileStorage.save(profile);
      setPrivateProfile(profile);
      setShareSelection(createDefaultPassportShareSelection(profile));
      setNotice({
        kind: 'restored',
        message: 'この Local Profile を端末内へ明示保存しました。',
      });
      setErrorMessage(null);
      setStage('encounter');
    } catch (error: unknown) {
      setNotice(
        error instanceof LocalProfileStorageError
          ? profileNoticeFromStorageError(error, 'save')
          : { kind: 'validation-error', message: readableError(error) }
      );
    } finally {
      setSaving(false);
    }
  }

  function encounteredProfile(): LocalPrivateProfile {
    return createLocalPrivateProfile({
      petName: encounteredPetName,
      petEmoji: encounteredPetEmoji,
      ownerAlias: '',
      candidateClueIds: encounteredSelection,
      selectedForPassportClueIds: encounteredSelection,
      languageCodes: [],
    });
  }

  function continueToPreview(): void {
    try {
      encounteredProfile();
      setErrorMessage(null);
      setStage('share-preview');
    } catch (error: unknown) {
      setErrorMessage(readableError(error));
    }
  }

  function hostLounge(): void {
    if (!privateProfile || !shareSelection) return;
    try {
      const ownerShare = createPassportShare(privateProfile, shareSelection);
      const identifiers = createSessionIdentifiers(webCryptoRandomBytes);
      const clock = currentClock();
      const room = joinLoungeRoom(
        createLoungeRoom({ loungeId: identifiers.loungeId, clock }),
        {
          participantId: identifiers.participantId,
          publicPassport: ownerShare.qrProjection,
          clock,
        }
      );
      qrScannerPort.publish(
        encodeQrPayload({ kind: 'lounge-invite', value: inviteForRoom(room) })
      );
      setLoungeRoom(room);
      setSeenRawPayloads(new Set());
      setNowMs(Date.now());
      setErrorMessage(null);
      setStage('host-invite');
    } catch (error: unknown) {
      setErrorMessage(qrFlowErrorMessage(error));
    }
  }

  function markHostReady(): void {
    if (!loungeRoom || !hostParticipantId) return;
    try {
      const updated = markParticipantReady(loungeRoom, {
        participantId: hostParticipantId,
        clock: currentClock(),
      });
      setErrorMessage(null);
      if (updated.status === 'ready') {
        // Agent State Machine（既存 Lounge）を開始したら、Room の 1 秒 tick はもう
        // 不要なので破棄し、20 分の TTL が尽きるまで無駄に動き続けさせない。
        qrScannerPort.publish(null);
        setLoungeRoom(null);
        setLounge(startLoungeFromRoom(updated));
      } else {
        setLoungeRoom(updated);
      }
    } catch (error: unknown) {
      setErrorMessage(qrFlowErrorMessage(error));
    }
  }

  function beginGuestScan(): void {
    setErrorMessage(null);
    setStage('guest-scan');
    void qrScannerPort.getPermissionState().then(setCameraPermission);
  }

  function requestCameraPermission(): void {
    void qrScannerPort.requestPermission().then(setCameraPermission);
  }

  function recheckCameraPermission(): void {
    void qrScannerPort.getPermissionState().then(setCameraPermission);
  }

  function performScan(): void {
    void scanQrPayload(qrScannerPort, seenRawPayloads)
      .then((result) => {
        setSeenRawPayloads(result.seenRawPayloads);
        if (result.payload.kind !== 'lounge-invite') {
          setErrorMessage(
            'この QR は Lounge Invite ではありません。Host の Invite QR を読み取ってください。'
          );
          return;
        }
        // Guest が公開する内容は、対面で相手が declare した内容として既に Encounter
        // 画面で入力済みである（Issue 4 由来）。ここでは新たに入力を求めず、
        // その内容から今回の共有 Preview を組み立てて Ready 操作へ進む。Render 時に
        // 再導出せず、確定できた瞬間の値をそのまま state へ保持する。
        const resolvedGuestProfile = resolveGuestProfile(encounteredProfile);
        if (!resolvedGuestProfile) {
          setErrorMessage(
            '相手の公開内容を確認できません。Encounter の入力を見直してください。'
          );
          return;
        }
        setGuestProfile(resolvedGuestProfile);
        setGuestShareSelection(
          createDefaultPassportShareSelection(resolvedGuestProfile)
        );
        setErrorMessage(null);
        setStage('guest-share-preview');
      })
      .catch((error: unknown) => {
        setErrorMessage(qrFlowErrorMessage(error));
      });
  }

  function guestReady(): void {
    if (!loungeRoom || !guestShareSelection || !guestProfile) return;
    try {
      const guestShare = createPassportShare(guestProfile, guestShareSelection);
      const identifiers = createSessionIdentifiers(webCryptoRandomBytes);
      const clock = currentClock();
      const joined = joinLoungeRoom(loungeRoom, {
        participantId: identifiers.participantId,
        publicPassport: guestShare.qrProjection,
        clock,
      });
      const readied = markParticipantReady(joined, {
        participantId: identifiers.participantId,
        clock,
      });
      setErrorMessage(null);
      if (readied.status === 'ready') {
        qrScannerPort.publish(null);
        setLoungeRoom(null);
        setLounge(startLoungeFromRoom(readied));
      } else {
        setLoungeRoom(readied);
        setStage('host-invite');
      }
    } catch (error: unknown) {
      setErrorMessage(qrFlowErrorMessage(error));
    }
  }

  /**
   * Room（Lounge 由来データ）を、退出・Host 終了・20 分満了と同じ「最も早い時点で破棄する」
   * 対象として扱う。Host のキャンセル操作だけでなく、Guest / Owner が Scan・Encounter
   * 画面から Profile 編集へ戻るなど、フローを離脱するあらゆる経路で呼ぶ。
   */
  function discardInviteFlow(): void {
    qrScannerPort.publish(null);
    setLoungeRoom(null);
    setGuestProfile(null);
    setGuestShareSelection(null);
    setSeenRawPayloads(new Set());
  }

  function cancelInvite(): void {
    discardInviteFlow();
    setErrorMessage(null);
    setStage('share-preview');
  }

  function evaluate(): void {
    setLounge((current) =>
      current
        ? reduceLounge(current, { type: 'evaluate', clock: currentClock() })
        : current
    );
    setErrorMessage(null);
  }

  function leave(): void {
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'owner-exit' }) : current
    );
    setErrorMessage(null);
  }

  function endAsHost(): void {
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'host-ended' }) : current
    );
    setErrorMessage(null);
  }

  function complete(): void {
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'complete' }) : current
    );
    setErrorMessage(null);
  }

  function restartEncounter(): void {
    setEncounteredPetName('');
    setEncounteredPetEmoji('🐶');
    setEncounteredSelection([]);
    setEncounteredConfirmed(false);
    discardInviteFlow();
    setLounge(null);
    setErrorMessage(null);
    setStage('encounter');
  }

  function editLocalProfile(): void {
    discardInviteFlow();
    setErrorMessage(null);
    setStage('profile');
  }

  if (lounge?.status === 'active') {
    return (
      <ActiveLoungeScreen
        errorMessage={errorMessage}
        lounge={lounge}
        onEvaluate={evaluate}
        onExit={leave}
        onHostEnd={endAsHost}
      />
    );
  }
  if (lounge?.status === 'retired') {
    return (
      <OutcomeScreen
        lounge={lounge}
        onComplete={complete}
        onExit={leave}
        onHostEnd={endAsHost}
      />
    );
  }
  if (lounge?.status === 'destroyed') {
    return (
      <DestroyedLoungeScreen lounge={lounge} onRestart={restartEncounter} />
    );
  }
  if (restoring) return <ProfileLoadingScreen />;

  if (
    stage === 'host-invite' &&
    loungeRoom &&
    hostParticipantId &&
    invite &&
    inviteQrPayload
  ) {
    return (
      <HostInviteScreen
        errorMessage={errorMessage}
        hostParticipantId={hostParticipantId}
        inviteQrPayload={inviteQrPayload}
        onCancel={cancelInvite}
        onMarkHostReady={markHostReady}
        onProceedToGuestScan={beginGuestScan}
        remainingMs={invite.expiresAtEpochMs - nowMs}
        room={loungeRoom}
      />
    );
  }

  if (stage === 'guest-scan') {
    return (
      <QrScanScreen
        errorMessage={errorMessage}
        onBackToHostInvite={() => {
          setErrorMessage(null);
          setStage('host-invite');
        }}
        onBackToProfile={editLocalProfile}
        onRecheckPermission={recheckCameraPermission}
        onRequestPermission={requestCameraPermission}
        onScan={performScan}
        permissionState={cameraPermission}
      />
    );
  }

  if (stage === 'guest-share-preview' && guestProfile && guestShareSelection) {
    return (
      <SharePreviewGate
        errorMessage={errorMessage}
        onBack={() => {
          // 'guest-scan' へ戻すと、同じ Invite の再読取が重複読取として拒否される
          // ため、再走査を強制しない 'host-invite' へ戻す。
          setErrorMessage(null);
          setStage('host-invite');
        }}
        onSelectionChange={setGuestShareSelection}
        onStart={guestReady}
        profile={guestProfile}
        selection={guestShareSelection}
      />
    );
  }

  if (stage === 'share-preview' && privateProfile && shareSelection) {
    return (
      <SharePreviewGate
        errorMessage={errorMessage}
        onBack={() => {
          setErrorMessage(null);
          setStage('encounter');
        }}
        onSelectionChange={setShareSelection}
        onStart={hostLounge}
        profile={privateProfile}
        selection={shareSelection}
      />
    );
  }

  if (stage === 'encounter' && privateProfile) {
    return (
      <EncounterSetupScreen
        confirmed={encounteredConfirmed}
        encounteredPetEmoji={encounteredPetEmoji}
        encounteredPetName={encounteredPetName}
        errorMessage={errorMessage}
        onBack={editLocalProfile}
        onChangePetName={setEncounteredPetName}
        onContinue={continueToPreview}
        onSelectPetEmoji={setEncounteredPetEmoji}
        onToggle={(id) =>
          setEncounteredSelection((current) =>
            toggleClueId(current, id, PUBLIC_PASSPORT_MAX_CLUES)
          )
        }
        onToggleConfirmed={() => setEncounteredConfirmed((current) => !current)}
        privateClueCount={privateProfile.candidateClues.length}
        privatePetName={privateProfile.petName}
        selectedIds={encounteredSelection}
      />
    );
  }

  return (
    <PassportCreationScreen
      languageCodes={languageSelection}
      notice={notice}
      onChangeOwnerAlias={setOwnerAlias}
      onChangePetName={setPetName}
      onSave={() => void saveLocalProfile()}
      onSelectPetEmoji={setPetEmoji}
      onToggleClue={(id) =>
        setOwnerSelection((current) =>
          toggleClueId(current, id, PROFILE_MAX_CLUES)
        )
      }
      onToggleLanguage={(code) =>
        setLanguageSelection((current) =>
          toggleLanguageCode(current, code, PROFILE_MAX_LANGUAGES)
        )
      }
      ownerAlias={ownerAlias}
      petEmoji={petEmoji}
      petName={petName}
      saving={saving}
      selectedIds={ownerSelection}
    />
  );
}
