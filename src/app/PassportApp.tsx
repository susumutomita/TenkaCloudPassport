import { useEffect, useState } from 'react';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import {
  type ClockSnapshot,
  type LoungeState,
  startLounge,
} from '../domain/lounge';
import {
  createLocalPrivateProfile,
  type LocalPrivateProfile,
  type PetEmoji,
  PROFILE_MAX_CLUES,
  PROFILE_MAX_LANGUAGES,
  PUBLIC_PASSPORT_MAX_CLUES,
  projectPublicPassport,
} from '../domain/passport';
import ActiveLoungeScreen from '../screens/ActiveLoungeScreen';
import DestroyedLoungeScreen from '../screens/DestroyedLoungeScreen';
import EncounterSetupScreen from '../screens/EncounterSetupScreen';
import OutcomeScreen from '../screens/OutcomeScreen';
import PassportCreationScreen from '../screens/PassportCreationScreen';
import PassportSharePreviewScreen from '../screens/PassportSharePreviewScreen';
import ProfileLoadingScreen from '../screens/ProfileLoadingScreen';
import {
  LocalProfileStorageError,
  type LocalProfileStoragePort,
} from './local-profile-storage';
import { reduceLounge } from './lounge-reducer';
import {
  createDefaultPassportShareSelection,
  createPassportShare,
  type PassportShareSelection,
} from './passport-share';
import {
  type ProfileNotice,
  profileNoticeFromStorageError,
} from './profile-notice';

interface PassportAppProps {
  readonly localProfileStorage: LocalProfileStoragePort;
}

type SetupStage = 'profile' | 'encounter' | 'share-preview';

function currentClock(): ClockSnapshot {
  return {
    wallClockMs: Date.now(),
    monotonicMs: performance.now(),
  };
}

function toggleClue(
  selectedIds: readonly ClueId[],
  id: ClueId,
  maximum: number
): ClueId[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }
  if (selectedIds.length >= maximum) return [...selectedIds];
  return [...selectedIds, id];
}

function toggleLanguage(
  selectedCodes: readonly LanguageCode[],
  code: LanguageCode
): LanguageCode[] {
  if (selectedCodes.includes(code)) {
    return selectedCodes.filter((selectedCode) => selectedCode !== code);
  }
  if (selectedCodes.length >= PROFILE_MAX_LANGUAGES) {
    return [...selectedCodes];
  }
  return [...selectedCodes, code];
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '入力を確認して、もう一度実行してください。';
}

export default function PassportApp({ localProfileStorage }: PassportAppProps) {
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
  const [lounge, setLounge] = useState<LoungeState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  function startEncounter(): void {
    if (!privateProfile || !shareSelection) return;
    try {
      const ownerShare = createPassportShare(privateProfile, shareSelection);
      const peerProfile = encounteredProfile();
      const peerPassport = projectPublicPassport(peerProfile, {
        includePetName: true,
        includePetEmoji: true,
        includeOwnerAlias: false,
        clueIds: encounteredSelection,
        languageCodes: [],
        ownerConfirmed: encounteredConfirmed,
      });
      setLounge(
        startLounge({
          ownerPassport: ownerShare.qrProjection,
          encounteredPassport: peerPassport,
          clock: currentClock(),
        })
      );
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(readableError(error));
    }
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
    setLounge(null);
    setErrorMessage(null);
    setStage('encounter');
  }

  function editLocalProfile(): void {
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

  if (stage === 'share-preview' && privateProfile && shareSelection) {
    let previewItems = null;
    let validationMessage = errorMessage;
    try {
      previewItems = createPassportShare(privateProfile, shareSelection).preview
        .items;
    } catch (error: unknown) {
      validationMessage = readableError(error);
    }
    return (
      <PassportSharePreviewScreen
        onBack={() => {
          setErrorMessage(null);
          setStage('encounter');
        }}
        onStart={startEncounter}
        onToggleClue={(id) =>
          setShareSelection((current) =>
            current
              ? {
                  ...current,
                  clueIds: toggleClue(
                    current.clueIds,
                    id,
                    PUBLIC_PASSPORT_MAX_CLUES
                  ),
                }
              : current
          )
        }
        onToggleLanguage={(code) =>
          setShareSelection((current) =>
            current
              ? {
                  ...current,
                  languageCodes: toggleLanguage(current.languageCodes, code),
                }
              : current
          )
        }
        onToggleOwnerAlias={() =>
          setShareSelection((current) =>
            current
              ? { ...current, includeOwnerAlias: !current.includeOwnerAlias }
              : current
          )
        }
        onTogglePetEmoji={() =>
          setShareSelection((current) =>
            current
              ? { ...current, includePetEmoji: !current.includePetEmoji }
              : current
          )
        }
        onTogglePetName={() =>
          setShareSelection((current) =>
            current
              ? { ...current, includePetName: !current.includePetName }
              : current
          )
        }
        previewItems={previewItems}
        profile={privateProfile}
        selection={shareSelection}
        validationMessage={validationMessage}
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
            toggleClue(current, id, PUBLIC_PASSPORT_MAX_CLUES)
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
          toggleClue(current, id, PROFILE_MAX_CLUES)
        )
      }
      onToggleLanguage={(code) =>
        setLanguageSelection((current) => toggleLanguage(current, code))
      }
      ownerAlias={ownerAlias}
      petEmoji={petEmoji}
      petName={petName}
      saving={saving}
      selectedIds={ownerSelection}
    />
  );
}
