import { useEffect, useState } from 'react';
import type { ClueId } from '../domain/clue-catalog';
import {
  type ClockSnapshot,
  type LoungeState,
  startLounge,
} from '../domain/lounge';
import {
  createLocalPrivateProfile,
  type LocalPrivateProfile,
  projectPublicPassport,
} from '../domain/passport';
import ActiveLoungeScreen from '../screens/ActiveLoungeScreen';
import DestroyedLoungeScreen from '../screens/DestroyedLoungeScreen';
import EncounterSetupScreen from '../screens/EncounterSetupScreen';
import OutcomeScreen from '../screens/OutcomeScreen';
import PassportCreationScreen from '../screens/PassportCreationScreen';
import { reduceLounge } from './lounge-reducer';

function currentClock(): ClockSnapshot {
  return {
    wallClockMs: Date.now(),
    monotonicMs: performance.now(),
  };
}

function toggleSelection(selectedIds: readonly ClueId[], id: ClueId): ClueId[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }
  if (selectedIds.length >= 3) return [...selectedIds];
  return [...selectedIds, id];
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '入力を確認して、もう一度実行してください。';
}

export default function PassportApp() {
  const [ownerSelection, setOwnerSelection] = useState<ClueId[]>([]);
  const [encounteredSelection, setEncounteredSelection] = useState<ClueId[]>(
    []
  );
  const [encounteredConfirmed, setEncounteredConfirmed] = useState(false);
  const [privateProfile, setPrivateProfile] =
    useState<LocalPrivateProfile | null>(null);
  const [lounge, setLounge] = useState<LoungeState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  function createPassport(): void {
    try {
      const profile = createLocalPrivateProfile({
        candidateClueIds: ownerSelection,
        selectedForPassportClueIds: ownerSelection,
      });
      setPrivateProfile(profile);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(readableError(error));
    }
  }

  function startEncounter(): void {
    if (!privateProfile) return;
    try {
      const ownerPassport = projectPublicPassport(privateProfile, {
        clueIds: ownerSelection,
        ownerConfirmed: true,
      });
      const encounteredProfile = createLocalPrivateProfile({
        candidateClueIds: encounteredSelection,
        selectedForPassportClueIds: encounteredSelection,
      });
      const encounteredPassport = projectPublicPassport(encounteredProfile, {
        clueIds: encounteredSelection,
        ownerConfirmed: encounteredConfirmed,
      });
      setLounge(
        startLounge({
          ownerPassport,
          encounteredPassport,
          clock: currentClock(),
        })
      );
      setEncounteredSelection([]);
      setEncounteredConfirmed(false);
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

  function resetAll(): void {
    setOwnerSelection([]);
    setEncounteredSelection([]);
    setEncounteredConfirmed(false);
    setPrivateProfile(null);
    setLounge(null);
    setErrorMessage(null);
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
    return <DestroyedLoungeScreen lounge={lounge} onRestart={resetAll} />;
  }
  if (privateProfile) {
    return (
      <EncounterSetupScreen
        confirmed={encounteredConfirmed}
        errorMessage={errorMessage}
        onBack={resetAll}
        onStart={startEncounter}
        onToggle={(id) =>
          setEncounteredSelection((current) => toggleSelection(current, id))
        }
        onToggleConfirmed={() => setEncounteredConfirmed((current) => !current)}
        privateClueCount={privateProfile.candidateClues.length}
        selectedIds={encounteredSelection}
      />
    );
  }
  return (
    <PassportCreationScreen
      errorMessage={errorMessage}
      onCreate={createPassport}
      onToggle={(id) =>
        setOwnerSelection((current) => toggleSelection(current, id))
      }
      selectedIds={ownerSelection}
    />
  );
}
