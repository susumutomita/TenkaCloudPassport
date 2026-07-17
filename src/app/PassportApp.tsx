import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import type { ClockSnapshot, LoungeState } from '../domain/lounge';
import {
  advanceLoungeRoom,
  createLoungeRoom,
  destroyLoungeRoom,
  inviteForRoom,
  joinLoungeRoom,
  type LoungeRoomState,
  type LoungeRoomTerminationReason,
  markParticipantReady,
  startLoungeFromRoom,
} from '../domain/lounge-room';
import type { OwnerAnswerValue } from '../domain/match-evidence';
import {
  createLocalPrivateProfile,
  type LocalPrivateProfile,
  type PetEmoji,
  PROFILE_MAX_CLUES,
  PROFILE_MAX_LANGUAGES,
  PUBLIC_PASSPORT_MAX_CLUES,
} from '../domain/passport';
import type { PetInteractionState } from '../domain/pet-interaction';
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
import OwnerQuestionScreen from '../screens/OwnerQuestionScreen';
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
  applyPetInteractionTick,
  beginPetInteraction,
  submitOwnerQuestionAnswer,
} from './pet-interaction-flow';
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
  // Issue 11: Pet Interaction の bounded protocol（`clarifying` の Owner Question）を
  // 保持する。`discovering` / `bridging` / `no-signal` は `pet-interaction-flow.ts` が
  // 呼び出しの中だけで一瞬経由し、確定した瞬間に Lounge 本体（`RetiredLounge`）へ収束させる
  // ため、この state に現れるのは `clarifying` か `null`（未着手・確定済み）だけである。
  const [interaction, setInteraction] = useState<PetInteractionState | null>(
    null
  );
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

  /**
   * Room（Lounge 由来データ）を、退出・Host 終了・20 分満了と同じ「最も早い時点で破棄する」
   * 対象として扱う。Host のキャンセル操作だけでなく、Guest / Owner が Scan・Encounter
   * 画面から Profile 編集へ戻るなど、フローを離脱するあらゆる経路で呼ぶ。20 分満了を検出する
   * useEffect からも参照するため、`qrScannerPort` だけに依存する安定した参照として保つ。
   *
   * `encounteredPetName` / `encounteredPetEmoji` / `encounteredSelection` /
   * `encounteredConfirmed` は「対面の相手が今回の Lounge で declare した内容」であり、
   * Guest 役の共有内容（`guestProfile`）の元データでもある Lounge 由来データそのものだ。
   * ここで一緒に破棄しないと、Lounge を離脱・破棄した後も EncounterSetupScreen に
   * 前回の相手の入力が残り続け、新しい Encounter へ古い Peer 情報が紛れ込む
   * （`'lounge-discarded'` Notice が「参加者、共有内容、Invite QR は残っていません」と
   * 案内する内容と矛盾する）。
   */
  const discardInviteFlow = useCallback((): void => {
    qrScannerPort.publish(null);
    setLoungeRoom(null);
    setGuestProfile(null);
    setGuestShareSelection(null);
    setSeenRawPayloads(new Set());
    setEncounteredPetName('');
    setEncounteredPetEmoji('🐶');
    setEncounteredSelection([]);
    setEncounteredConfirmed(false);
  }, [qrScannerPort]);

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

  /**
   * Issue 11: Active Lounge の 1 秒 tick / Background 復帰の両方が、Lounge 本体の期限
   * （`reduceLounge`）と Pet Interaction の 45 秒締切（`applyPetInteractionTick`）を
   * 同じ関数呼び出しの中でまとめて評価する。`applyRoomAdvance`（Issue 9）と同じ理由で、
   * 2 つの state（`interaction` と `lounge`）を別の render にまたがず同期的に更新することで、
   * 中間 render を作らない。Pet Interaction が締切超過で `no-signal` へ収束した場合は、
   * その場で `RetiredLounge` へ収束させ、Lounge 本体の `'clock-tick'` 判定は行わない
   * （Pet Interaction 側の確定が Lounge 自体の 20 分満了より早いため）。
   */
  const applyLoungeAdvance = useCallback(
    (
      current: LoungeState,
      clock: ClockSnapshot,
      actionType: 'clock-tick' | 'app-resumed'
    ): void => {
      if (current.status === 'active' && interaction) {
        // `applyPetInteractionTick` は締切超過のときだけ `interaction` を書き換えて
        // 別参照を返す（変化がなければ同じ参照をそのまま返す契約）ため、締切内の
        // 「変化なし」を検出する分岐は不要である。締切超過（`step.lounge.status !==
        // 'active'`）だけを見て Pet Interaction 側の確定を Lounge 本体の期限確認より
        // 優先する。
        const step = applyPetInteractionTick(interaction, current, clock);
        if (step.lounge.status !== 'active') {
          setInteraction(step.interaction);
          setLounge(step.lounge);
          return;
        }
      }
      const advanced = reduceLounge(current, { type: actionType, clock });
      // Active Lounge 自体の 20 分満了（`clarifying` 中に Lounge 本体の期限が先に
      // 尽きた場合）でも、`interaction` を確実に破棄する。破棄済み Lounge の画面
      // （`DestroyedLoungeScreen`）は `interaction` を参照しないため実害はないが、
      // 「Lounge が終われば Pet Interaction も終わる」契約を状態としても保つ。
      if (current.status === 'active' && advanced.status !== 'active') {
        setInteraction(null);
      }
      setLounge(advanced);
    },
    [interaction]
  );

  useEffect(() => {
    if (!lounge || lounge.status === 'destroyed') return undefined;
    const timer = setInterval(() => {
      const clock = currentClock();
      setNowMs(clock.wallClockMs);
      applyLoungeAdvance(lounge, clock, 'clock-tick');
    }, 1_000);
    return () => clearInterval(timer);
  }, [lounge, applyLoungeAdvance]);

  /**
   * Room の 20 分満了を、Active Lounge の満了（`reduceLounge` の `'clock-tick'` /
   * `'app-resumed'` が `DestroyedLounge` を直接返す経路）と同じ「この Lounge のデータを
   * 端末から破棄した」画面へ収束させる。`advanceLoungeRoom` が返した `'expired'` を
   * 一度 `loungeRoom` state へ保持してから、別の useEffect で検出して `lounge` を
   * 設定する 2 段構えにすると、その間の 1 render だけ `invite` / `hostParticipantId` が
   * `null` になって画面条件が崩れ、`PassportCreationScreen`（Step 1）へ一瞬
   * フォールバックしてしまう。tick / resume ハンドラ自身がこの関数の中で
   * `discardInviteFlow()` と `setLounge(...)` を同期的に呼ぶことで、React 19 の
   * automatic batching により `loungeRoom` と `lounge` の更新が同じ commit にまとまり、
   * 満了を検出した瞬間に `DestroyedLoungeScreen` へ直接遷移する（中間 render を作らない）。
   */
  const applyRoomAdvance = useCallback(
    (current: LoungeRoomState, clock: ClockSnapshot): void => {
      const advanced = advanceLoungeRoom(current, clock);
      if (advanced.status === 'expired') {
        discardInviteFlow();
        setLounge({ status: 'destroyed', reason: 'expired' });
        return;
      }
      setLoungeRoom(advanced);
    },
    [discardInviteFlow]
  );

  useEffect(() => {
    if (!loungeRoom || loungeRoom.status === 'expired') return undefined;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      applyRoomAdvance(loungeRoom, currentClock());
    }, 1_000);
    return () => clearInterval(timer);
  }, [loungeRoom, applyRoomAdvance]);

  // Background から Foreground へ復帰した瞬間に、壁時計基準で Room / Lounge の期限を
  // 再評価する。Suspend 中に単調増加時計がほぼ進まなくても、壁時計は現実の経過時間を
  // 反映しているため、この専用イベントが「停止していた時間」を期限延長として扱わない
  // ことを保証する（Background 復帰時の Wall Clock 再評価、Issue 9 の要件）。
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const clock = currentClock();
      setNowMs(clock.wallClockMs);
      if (lounge) applyLoungeAdvance(lounge, clock, 'app-resumed');
      if (loungeRoom && loungeRoom.status !== 'expired') {
        applyRoomAdvance(loungeRoom, clock);
      }
    });
    return () => subscription.remove();
  }, [lounge, loungeRoom, applyRoomAdvance, applyLoungeAdvance]);

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
        setInteraction(null);
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
        setInteraction(null);
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
   * Room（waiting / ready）段階に割り込む個人退出・Host 終了の Terminal Event。20 分満了
   * （Room の tick effect）と同じ `DestroyedLounge` へ収束させることで、Active Lounge
   * 以降の終了と同じ DestroyedLoungeScreen で「この Lounge のデータを端末から破棄した」
   * ことを表示する（同じ Domain State Machine で扱う、Issue 9 の要件）。
   */
  function endInvite(reason: LoungeRoomTerminationReason): void {
    if (!loungeRoom) return;
    const destroyed = destroyLoungeRoom(loungeRoom, reason);
    discardInviteFlow();
    setLounge(destroyed);
    setErrorMessage(null);
  }

  function cancelInvite(): void {
    endInvite('host-ended');
  }

  /**
   * Issue 11: 「会話の糸を探す」操作 1 回で、Pet Interaction の bounded protocol を
   * discovering → clarifying（Owner Question 表示）/ no-signal（即 retired）まで進める。
   * Rules Provider は同期関数のため discovering は観測可能な状態として現れない。
   */
  function startPetInteraction(): void {
    if (lounge?.status !== 'active') return;
    const step = beginPetInteraction(
      lounge,
      RULES_INTERACTION_PROVIDER,
      currentClock()
    );
    setInteraction(step.interaction);
    setLounge(step.lounge);
    setErrorMessage(null);
  }

  /**
   * Owner Question への回答（答える(yes) / 分からない(no) / パス(decline)）を適用する。
   * `submitOwnerQuestionAnswer` が `clarifying` 以外では no-op を返すため、二重送信や
   * 締切超過後の遅延送信は安全に無視される（Question Budget を超えない）。
   */
  function submitOwnerAnswer(value: OwnerAnswerValue): void {
    if (lounge?.status !== 'active') return;
    const step = submitOwnerQuestionAnswer(
      interaction,
      lounge,
      value,
      currentClock()
    );
    setInteraction(step.interaction);
    setLounge(step.lounge);
    setErrorMessage(null);
  }

  function leave(): void {
    setInteraction(null);
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'owner-exit' }) : current
    );
    setErrorMessage(null);
  }

  function endAsHost(): void {
    setInteraction(null);
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
    // discardInviteFlow() が相手の宣言内容（encounteredPetName 等）も含めて
    // Lounge 由来の一時データを一括破棄する。
    discardInviteFlow();
    setInteraction(null);
    setLounge(null);
    setErrorMessage(null);
    setStage('encounter');
  }

  /**
   * QR Scan 画面から Passport 編集へ戻る操作は、Lounge をキャンセルする操作ほど重い
   * 確認画面を挟まず 1 タップで編集画面へ戻す（既存の UX を保つ）。一方、Room に
   * すでに参加者データがあった場合はそれを破棄しているため、Profile 画面へ着地した
   * 直後に「この Lounge のデータを端末から破棄した」ことを Notice で明示する。
   */
  function editLocalProfile(): void {
    const hadInviteInProgress = loungeRoom !== null;
    discardInviteFlow();
    setErrorMessage(null);
    setStage('profile');
    if (hadInviteInProgress) {
      setNotice({
        kind: 'lounge-discarded',
        message:
          'この Lounge のデータを端末から破棄しました。参加者、共有内容、Invite QR は残っていません。',
      });
    }
  }

  if (lounge?.status === 'active' && interaction?.phase === 'clarifying') {
    return (
      <OwnerQuestionScreen
        errorMessage={errorMessage}
        onAnswer={submitOwnerAnswer}
        onExit={leave}
        onHostEnd={endAsHost}
        question={interaction.question}
        remainingMs={interaction.deadlineAtWallClockMs - nowMs}
      />
    );
  }
  if (lounge?.status === 'active') {
    return (
      <ActiveLoungeScreen
        errorMessage={errorMessage}
        lounge={lounge}
        onBeginInteraction={startPetInteraction}
        onExit={leave}
        onHostEnd={endAsHost}
        remainingMs={lounge.expiresAtWallClockMs - nowMs}
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
        remainingMs={lounge.expiresAtWallClockMs - nowMs}
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
