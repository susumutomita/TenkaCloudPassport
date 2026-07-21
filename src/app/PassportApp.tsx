import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import {
  type AgentModelInput,
  type AgentModelProvider,
  RULES_MODEL_PROVIDER,
} from '../domain/agent-model-provider';
import type { ClueId, LanguageCode } from '../domain/clue-catalog';
import { RULES_INTERACTION_PROVIDER } from '../domain/interaction-discovery-provider';
import { createIntroCard, type IntroCard } from '../domain/intro-card';
import type { ClockSnapshot, LoungeState } from '../domain/lounge';
import type { LoungeInvite } from '../domain/lounge-invite';
import {
  advanceLoungeRoom,
  createLoungeRoom,
  destroyLoungeRoom,
  joinLoungeRoom,
  type LoungeRoomState,
  type LoungeRoomTerminationReason,
  markParticipantReady,
  type ReadyLoungeRoom,
  ROOM_CAPACITY,
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
import { INTERACTION_DEADLINE_MS } from '../domain/pet-interaction';
import {
  createParticipantId,
  createSessionIdentifiers,
  type ParticipantId,
} from '../domain/session-identifiers';
import {
  encodeIntroCardUrl,
  introCardUrlByteLength,
} from '../protocol/intro-card-url';
import {
  createLoungeJoinRequest,
  encodeLoungeJoinRequest,
  type IssuedLoungeHandshake,
  issueLoungeHandshake,
} from '../protocol/lounge-handshake';
import { encodeQrPayload } from '../protocol/qr-payload';
import { webCryptoRandomBytes } from '../protocol/web-crypto-random';
import ActiveLoungeScreen from '../screens/ActiveLoungeScreen';
import BackupExportScreen from '../screens/BackupExportScreen';
import BackupImportScreen, {
  type BackupImportValidationView,
} from '../screens/BackupImportScreen';
import ConversationSelfReportScreen from '../screens/ConversationSelfReportScreen';
import DestroyedLoungeScreen from '../screens/DestroyedLoungeScreen';
import EncounterSetupScreen from '../screens/EncounterSetupScreen';
import HostInviteScreen from '../screens/HostInviteScreen';
import IntroCardEditScreen, {
  type IntroCardEditFieldKey,
  type IntroCardEditScreenProps,
} from '../screens/IntroCardEditScreen';
import IntroCardScreen from '../screens/IntroCardScreen';
import {
  addOtherLink,
  buildIntroCardLinks,
  classifyIntroCardLinks,
  firstInvalidNamedLinkField,
  type IntroCardLinksDraft,
  removeOtherLink,
  updateOtherLink,
} from '../screens/intro-card-links';
import LocalDiagnosticsScreen from '../screens/LocalDiagnosticsScreen';
import OutcomeScreen from '../screens/OutcomeScreen';
import OwnerQuestionScreen from '../screens/OwnerQuestionScreen';
import PassportCreationScreen from '../screens/PassportCreationScreen';
import PassportSharePreviewScreen from '../screens/PassportSharePreviewScreen';
import PilotMeasurementScreen from '../screens/PilotMeasurementScreen';
import ProfileLoadingScreen from '../screens/ProfileLoadingScreen';
import QrScanScreen from '../screens/QrScanScreen';
import SettingsScreen from '../screens/SettingsScreen';
import {
  createAgentProviderSessionRunner,
  createProviderResultApplicationGate,
  INITIAL_PROVIDER_RUNTIME_STATE,
  type ProviderRuntimeState,
  pilotProviderRunFromOutcome,
} from './agent-provider-session';
import type { BackupImportParseResult } from './backup-import';
import type { BackupSharePort } from './backup-share-port';
import type { DiagnosticErrorSignal } from './diagnostic-recovery';
import type { DiagnosticTransportState } from './diagnostic-report';
import type { DistributionCapability } from './distribution-capability';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';
import { inProcessTransportFingerprint } from './in-process-transport-binding';
import {
  type IntroCardNotice,
  introCardNoticeFromError,
} from './intro-card-notice';
import type { IntroCardStoragePort } from './intro-card-storage';
import {
  LocalDataAccessBlockedError,
  type LocalDataControl,
  LocalDataControlError,
} from './local-data-control';
import type { LocalModelManagementPort } from './local-model-management-port';
import type { LocalModelMutationLeasePort } from './local-model-mutation-lease';
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
  applyAgentModelDecisionBeforeLoungeExpiry,
  applyPetInteractionTick,
  submitOwnerQuestionAnswer,
} from './pet-interaction-flow';
import type {
  ConversationSelfReport,
  PilotProviderRun,
} from './pilot-measurement';
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
import { readableError } from './readable-error';
import { createReducedMotionPort } from './reduced-motion-port';
import {
  recoverLocalStateAtStartup,
  type StartupLocalRecoveryResult,
} from './startup-local-recovery';
import { type BackupFlow, useBackupFlow } from './use-backup-flow';
import {
  type LocalDiagnosticsFlow,
  useLocalDiagnosticsFlow,
} from './use-local-diagnostics-flow';
import {
  type LocalModelManagementView,
  useLocalModelManagement,
} from './use-local-model-management';
import {
  type PilotMeasurementFlow,
  usePilotMeasurementFlow,
} from './use-pilot-measurement-flow';

interface PassportAppProps {
  readonly appVersion: string;
  readonly localProfileStorage: LocalProfileStoragePort;
  readonly introCardStorage: IntroCardStoragePort;
  readonly backupSharePort: BackupSharePort;
  readonly distributionCapability: DistributionCapability;
  /** Web / Expo Go / Model 未設定では Rules、Development Build では Local を注入する。 */
  readonly agentModelProvider?: AgentModelProvider;
  /** Development Build だけが app-private GGUF lifecycle を注入する。 */
  readonly localModelManagement?: LocalModelManagementPort | null;
  readonly localModelMutationLeases?: LocalModelMutationLeasePort | null;
  readonly localDataControl: LocalDataControl;
}

type SetupStage =
  | 'profile'
  | 'encounter'
  | 'share-preview'
  | 'host-invite'
  | 'guest-scan'
  | 'guest-share-preview'
  | 'backup-export'
  | 'backup-import'
  | 'settings'
  | 'diagnostics'
  | 'pilot-measurement'
  // Issue 79: 自己紹介カードピボット Step 1 のメインフロー。Pet / Lounge / Encounter 系
  // stage は導線から外れ、既定の着地点はこの 2 つになる。
  | 'intro-card'
  | 'intro-card-edit';

interface DiagnosticTransportSnapshot {
  readonly state: DiagnosticTransportState;
  readonly peerCount: number;
  readonly permission: CameraPermissionState;
}

function diagnosticTransportSnapshot(
  lounge: LoungeState | null,
  loungeRoom: LoungeRoomState | null,
  permission: CameraPermissionState
): DiagnosticTransportSnapshot {
  if (lounge?.status === 'active' || lounge?.status === 'retired') {
    return { state: 'connected', peerCount: ROOM_CAPACITY, permission };
  }
  if (lounge?.status === 'destroyed' || loungeRoom?.status === 'expired') {
    return { state: 'ended', peerCount: 0, permission };
  }
  if (loungeRoom) {
    return {
      state: 'hosting',
      peerCount: loungeRoom.participants.length,
      permission,
    };
  }
  return { state: 'idle', peerCount: 0, permission };
}

function startupDiagnosticError(error: unknown): DiagnosticErrorSignal {
  if (error instanceof LocalDataControlError) {
    return { code: error.code, phase: 'startup' };
  }
  return { code: 'STORAGE_FAILURE', phase: 'profile-read' };
}

function hasDisposableLounge(
  lounge: LoungeState | null,
  loungeRoom: LoungeRoomState | null
): boolean {
  if (loungeRoom) return true;
  return lounge !== null && lounge.status !== 'destroyed';
}

function currentClock(): ClockSnapshot {
  return {
    wallClockMs: Date.now(),
    monotonicMs: performance.now(),
  };
}

const VALIDATION_ERROR_FALLBACK = '入力を確認して、もう一度実行してください。';
const IN_PROCESS_DISCOVERY_HINT = 'in-process-v1:host';

/**
 * `BackupImportParseResult`（app 層、`backup` 本体まで持つ）を、`BackupImportScreen` が
 * 表示に必要な最小の形（`BackupImportValidationView`）へ変換する。ネストした三項演算子を
 * PassportApp 本体から追い出し、Cognitive Complexity を抑える。
 */
function backupImportValidationView(
  result: BackupImportParseResult | null
): BackupImportValidationView {
  if (result === null) return null;
  if (result.kind === 'rejected') {
    return { kind: 'rejected', message: result.message };
  }
  return { kind: 'parsed', items: result.items };
}

/**
 * Issue 92: 保存失敗時、どの入力欄へ focus し直下にエラーを出すかを 1 つ特定する。
 * `IntroCardNotice.field`（domain 由来、`links` は単一フィールドにまとまる）を、
 * `links` の場合だけ `firstInvalidNamedLinkField`（`intro-card-links.ts`）で
 * その時点の draft から実際に問題のある名前付き欄まで絞り込む。件数超過
 * （5 件超）等、どの 1 欄にも起因しない場合は絞り込めず `undefined` を返し、
 * 呼び出し側は既存の画面上部 Notice・`overLinkCount` の見た目に委ねる。
 */
function resolveIntroCardErrorFieldKey(
  notice: IntroCardNotice,
  linksDraft: IntroCardLinksDraft
): IntroCardEditFieldKey | undefined {
  if (notice.kind !== 'validation-error' || notice.field === undefined) {
    return undefined;
  }
  if (notice.field !== 'links') return notice.field;
  return firstInvalidNamedLinkField(linksDraft);
}

function isBackupStage(
  stage: SetupStage
): stage is 'backup-export' | 'backup-import' {
  return stage === 'backup-export' || stage === 'backup-import';
}

/**
 * `EncounterSetupScreen` が要求する Prop のうち、`privateProfile` から導出できる
 * `privateClueCount` / `privatePetName` 以外をまとめる。`PassportCreationScreenBranch`
 * と分けることで、`ProfileHomeGate` の呼び出し側は「相手の入力」と「自分の Profile」を
 * 混同せずに 1 つの object として渡せる（Reuse/Simplification レビュー指摘の反映）。
 */
interface EncounterBranchProps {
  readonly errorMessage: string | null;
  readonly encounteredPetName: string;
  readonly encounteredPetEmoji: PetEmoji;
  readonly encounteredSelection: readonly ClueId[];
  readonly encounteredConfirmed: boolean;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleConfirmed: () => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
}

/** `PassportCreationScreen`（Step 1）が要求する Prop のうち `onOpenBackup` 以外をまとめる。 */
interface PassportCreationBranchProps {
  readonly petName: string;
  readonly petEmoji: PetEmoji;
  readonly ownerAlias: string;
  readonly ownerSelection: readonly ClueId[];
  readonly languageSelection: readonly LanguageCode[];
  readonly notice: ProfileNotice;
  readonly saving: boolean;
  readonly onChangePetName: (value: string) => void;
  readonly onSelectPetEmoji: (emoji: PetEmoji) => void;
  readonly onChangeOwnerAlias: (value: string) => void;
  readonly onToggleClue: (id: ClueId) => void;
  readonly onToggleLanguage: (code: LanguageCode) => void;
  readonly onSave: () => void;
}

interface ProfileHomeGateProps {
  readonly stage: SetupStage;
  readonly privateProfile: LocalPrivateProfile | null;
  readonly locale: Locale;
  readonly backupFlow: BackupFlow;
  readonly onOpenSettings: () => void;
  readonly encounter: EncounterBranchProps;
  readonly creation: PassportCreationBranchProps;
  /** Issue 79: 自己紹介カードピボット Step 1。詳細は `IntroCardStageGate` を参照。 */
  readonly introCard: IntroCard | null;
  readonly introCardEdit: IntroCardEditBranchProps;
  readonly onEditIntroCard: () => void;
  readonly onDeleteIntroCard: () => void;
}

/**
 * Room 作成前（Lounge Data が存在しない）段階の 3 つの Stage（Backup Export・Import・
 * Encounter）と、その既定の着地点（Profile 作成）を 1 つの Component へ集約する。
 * `PassportApp` 本体に 3 つ目・4 つ目の `if` を追加すると Cognitive Complexity が
 * 上限を超えるため、`SharePreviewGate` と同じ「複数 Stage を子 Component へ集約する」
 * 方針をここにも適用する。呼び出し側の Prop は `EncounterSetupScreen` /
 * `PassportCreationScreen` それぞれの Prop 形をそのまま反映した `encounter` /
 * `creation` の 2 object にまとめ、無関係な 2 画面分の Prop を平坦に並べない。
 */
function ProfileHomeGate({
  stage,
  privateProfile,
  locale,
  backupFlow,
  onOpenSettings,
  encounter,
  creation,
  introCard,
  introCardEdit,
  onEditIntroCard,
  onDeleteIntroCard,
}: ProfileHomeGateProps) {
  // Issue 79: 自己紹介カードピボット Step 1 の既定フロー。Pet / Encounter より前に
  // 判定する。`PassportApp` 本体へ `if` を追加すると Cognitive Complexity が上限を
  // 超えるため（このファイル既存の設計判断、上記コメント参照）、既に子 Component へ
  // 判定を委譲している `ProfileHomeGate` 側へ同じ方針で 1 段追加する。
  if (INTRO_CARD_STAGES.has(stage)) {
    return (
      <IntroCardStageGate
        edit={introCardEdit}
        introCard={introCard}
        locale={locale}
        onDelete={onDeleteIntroCard}
        onEdit={onEditIntroCard}
        onOpenBackup={backupFlow.open}
        onOpenSettings={onOpenSettings}
        stage={stage}
      />
    );
  }
  if (isBackupStage(stage)) {
    return (
      <BackupStageGate
        backupFlow={backupFlow}
        hasExistingProfile={privateProfile !== null}
        locale={locale}
        stage={stage}
      />
    );
  }
  if (stage === 'encounter' && privateProfile) {
    return (
      <EncounterSetupScreen
        confirmed={encounter.encounteredConfirmed}
        encounteredPetEmoji={encounter.encounteredPetEmoji}
        encounteredPetName={encounter.encounteredPetName}
        errorMessage={encounter.errorMessage}
        locale={locale}
        onBack={encounter.onBack}
        onChangePetName={encounter.onChangePetName}
        onContinue={encounter.onContinue}
        onSelectPetEmoji={encounter.onSelectPetEmoji}
        onToggle={encounter.onToggleClue}
        onToggleConfirmed={encounter.onToggleConfirmed}
        privateClueCount={privateProfile.candidateClues.length}
        privatePetName={privateProfile.petName}
        selectedIds={encounter.encounteredSelection}
      />
    );
  }
  return (
    <PassportCreationScreen
      languageCodes={creation.languageSelection}
      locale={locale}
      notice={creation.notice}
      onChangeOwnerAlias={creation.onChangeOwnerAlias}
      onChangePetName={creation.onChangePetName}
      onOpenBackup={backupFlow.open}
      onOpenSettings={onOpenSettings}
      onSave={creation.onSave}
      onSelectPetEmoji={creation.onSelectPetEmoji}
      onToggleClue={creation.onToggleClue}
      onToggleLanguage={creation.onToggleLanguage}
      ownerAlias={creation.ownerAlias}
      petEmoji={creation.petEmoji}
      petName={creation.petName}
      saving={creation.saving}
      selectedIds={creation.ownerSelection}
    />
  );
}

interface BackupStageGateProps {
  readonly stage: 'backup-export' | 'backup-import';
  readonly backupFlow: BackupFlow;
  readonly hasExistingProfile: boolean;
  readonly locale: Locale;
}

/**
 * Export・Import は Lounge / Room のどの state とも独立した機能であり、
 * `PassportApp` 本体に 2 つの `if` として直接展開すると Cognitive Complexity が
 * 上限を超える。`SharePreviewGate` と同じ「複数 Stage を 1 つの子 Component へ
 * 集約する」方針で、判定自体をこの Component 側へ移す。
 */
function BackupStageGate({
  stage,
  backupFlow,
  hasExistingProfile,
  locale,
}: BackupStageGateProps) {
  if (stage === 'backup-export') {
    return (
      <BackupExportScreen
        locale={locale}
        notice={backupFlow.exportNotice}
        onBack={backupFlow.close}
        onOpenImport={backupFlow.openImport}
        onShare={() => void backupFlow.share()}
        preview={backupFlow.exportPreview}
        sharing={backupFlow.sharing}
      />
    );
  }
  return (
    <BackupImportScreen
      choice={backupFlow.importChoice}
      committing={backupFlow.committing}
      hasExistingProfile={hasExistingProfile}
      locale={locale}
      notice={backupFlow.importNotice}
      onBack={backupFlow.close}
      onChangeChoice={backupFlow.setImportChoice}
      onChangeRawInput={backupFlow.changeRawInput}
      onCommit={() => void backupFlow.commit()}
      onOpenExport={backupFlow.open}
      onValidate={backupFlow.validate}
      rawInput={backupFlow.rawInput}
      validation={backupImportValidationView(backupFlow.importResult)}
    />
  );
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
  readonly locale: Locale;
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
  locale,
  onSelectionChange,
  onStart,
  onBack,
}: SharePreviewGateProps) {
  let previewItems = null;
  let validationMessage = errorMessage;
  try {
    previewItems = createPassportShare(profile, selection).preview.items;
  } catch (error: unknown) {
    validationMessage = readableError(error, VALIDATION_ERROR_FALLBACK);
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
      locale={locale}
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

const UTILITY_STAGES: ReadonlySet<SetupStage> = new Set([
  'settings',
  'diagnostics',
  'pilot-measurement',
]);

interface UtilityStageGateProps {
  readonly stage: SetupStage;
  readonly diagnosticsFlow: LocalDiagnosticsFlow;
  readonly distributionCapability: DistributionCapability;
  readonly pilotMeasurementFlow: PilotMeasurementFlow;
  readonly hasLounge: boolean;
  readonly hasProfile: boolean;
  readonly locale: Locale;
  readonly modelManagement: LocalModelManagementView;
  readonly onChangeLocale: (locale: Locale) => void;
  readonly onCloseSettings: () => void;
}

function UtilityStageGate({
  stage,
  diagnosticsFlow,
  distributionCapability,
  pilotMeasurementFlow,
  hasLounge,
  hasProfile,
  locale,
  modelManagement,
  onChangeLocale,
  onCloseSettings,
}: UtilityStageGateProps) {
  if (stage === 'diagnostics') {
    return (
      <LocalDiagnosticsScreen
        flow={diagnosticsFlow}
        hasLounge={hasLounge}
        hasProfile={hasProfile}
        locale={locale}
      />
    );
  }
  if (stage === 'pilot-measurement') {
    return (
      <PilotMeasurementScreen flow={pilotMeasurementFlow} locale={locale} />
    );
  }
  if (stage === 'settings') {
    return (
      <SettingsScreen
        distributionCapability={distributionCapability}
        locale={locale}
        modelManagement={modelManagement}
        onBack={onCloseSettings}
        onChangeLocale={onChangeLocale}
        onOpenDiagnostics={diagnosticsFlow.open}
        onOpenPilotMeasurement={pilotMeasurementFlow.open}
      />
    );
  }
  return null;
}

const INTRO_CARD_STAGES: ReadonlySet<SetupStage> = new Set([
  'intro-card',
  'intro-card-edit',
]);

/**
 * Issue 79: 自己紹介カードピボット Step 1 の 2 Stage（表示・編集）を 1 つの
 * Component へ集約する。`UtilityStageGate` / `BackupStageGate` と同じ「複数 Stage を
 * 子 Component へ集約して Cognitive Complexity を抑える」方針。編集画面用の Prop は
 * `edit` に 1 つの object としてまとめ、`ProfileHomeGate` の `creation` / `encounter`
 * と同じ形にする。
 */
/**
 * Issue 90 の code-reviewer 指摘（重複解消）: `IntroCardEditScreenProps` と
 * ほぼ同じ形（`locale`・`onOpenBackup`・`onOpenSettings` の 3 つだけ
 * `IntroCardStageGate` 側の引数として別に渡す）を手で並べて重複させず、
 * `Omit` で screen 側の型から直接導出する（jscpd の重複検出・型の drift 両方を防ぐ）。
 */
type IntroCardEditBranchProps = Omit<
  IntroCardEditScreenProps,
  'locale' | 'onOpenBackup' | 'onOpenSettings'
>;

interface IntroCardStageGateProps {
  readonly stage: SetupStage;
  readonly introCard: IntroCard | null;
  readonly locale: Locale;
  readonly onOpenBackup: () => void;
  readonly onOpenSettings: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly edit: IntroCardEditBranchProps;
}

function IntroCardStageGate({
  stage,
  introCard,
  locale,
  onOpenBackup,
  onOpenSettings,
  onEdit,
  onDelete,
  edit,
}: IntroCardStageGateProps) {
  if (stage === 'intro-card' && introCard) {
    return (
      <IntroCardScreen
        card={introCard}
        deleteError={
          edit.notice.kind === 'delete-error' ? edit.notice.message : null
        }
        locale={locale}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpenBackup={onOpenBackup}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  return (
    <IntroCardEditScreen
      email={edit.email}
      errorFieldKey={edit.errorFieldKey}
      linkGithub={edit.linkGithub}
      linkLinkedin={edit.linkLinkedin}
      linkPortfolio={edit.linkPortfolio}
      linkX={edit.linkX}
      locale={locale}
      name={edit.name}
      notice={edit.notice}
      onAddOtherLink={edit.onAddOtherLink}
      onChangeEmail={edit.onChangeEmail}
      onChangeLinkGithub={edit.onChangeLinkGithub}
      onChangeLinkLinkedin={edit.onChangeLinkLinkedin}
      onChangeLinkPortfolio={edit.onChangeLinkPortfolio}
      onChangeLinkX={edit.onChangeLinkX}
      onChangeName={edit.onChangeName}
      onChangeOrganization={edit.onChangeOrganization}
      onChangeOtherLink={edit.onChangeOtherLink}
      onChangePhone={edit.onChangePhone}
      onChangeSelfIntro={edit.onChangeSelfIntro}
      onChangeTitle={edit.onChangeTitle}
      onOpenBackup={onOpenBackup}
      onOpenSettings={onOpenSettings}
      onRemoveOtherLink={edit.onRemoveOtherLink}
      onSave={edit.onSave}
      organization={edit.organization}
      otherLinks={edit.otherLinks}
      phone={edit.phone}
      saving={edit.saving}
      selfIntro={edit.selfIntro}
      title={edit.title}
      cardUrlByteUsage={edit.cardUrlByteUsage}
    />
  );
}

export default function PassportApp({
  appVersion,
  localProfileStorage,
  introCardStorage,
  backupSharePort,
  distributionCapability,
  agentModelProvider = RULES_MODEL_PROVIDER,
  localModelManagement = null,
  localModelMutationLeases = null,
  localDataControl,
}: PassportAppProps) {
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
  // Issue 15: 表示言語。Settings 画面（`onChangeLocale`）だけが更新し、Lounge / Room /
  // Pet Interaction / 保存済み Local Profile のいずれの state にも触れない。既に画面へ
  // 表示済みの Notice（例: 直前に確定した保存成功メッセージ）は locale 変更を遡って
  // 再翻訳しない（`docs/design/i18n-and-accessibility.md` の Known follow-up）。
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [notice, setNotice] = useState<ProfileNotice>({
    kind: 'empty',
    message: MESSAGES[DEFAULT_LOCALE].passportApp.initialNotice,
  });
  // Issue 79: 自己紹介カードピボット Step 1。`introCardRef` は起動時 Promise.all の
  // `.then()` や各種 handler から同期的に「保存済みカードがあるか」を読むための参照で、
  // React state（`introCard`）と異なり同一 tick 内の再 render を待たずに最新値を返す
  // （`applyStartupRecoveryResult` / `resetAllLocalMemory` の stage 決定がこれに依存する）。
  const [introCard, setIntroCard] = useState<IntroCard | null>(null);
  const introCardRef = useRef<IntroCard | null>(null);
  const [introCardDraftName, setIntroCardDraftName] = useState('');
  const [introCardDraftTitle, setIntroCardDraftTitle] = useState('');
  const [introCardDraftOrganization, setIntroCardDraftOrganization] =
    useState('');
  const [introCardDraftSelfIntro, setIntroCardDraftSelfIntro] = useState('');
  const [introCardDraftEmail, setIntroCardDraftEmail] = useState('');
  const [introCardDraftPhone, setIntroCardDraftPhone] = useState('');
  // Issue 90: リンク欄を「1 行 1 リンクの改行区切り textarea」から「X / GitHub /
  // LinkedIn / Portfolio の名前付き単一行入力 4 つ + 自由リンクの動的追加」へ
  // 変更した。組み立て・逆分類は `../screens/intro-card-links` の純粋関数へ
  // 切り出し、domain（`IntroCard.links: readonly string[]`）は変えない。
  const [introCardDraftLinkX, setIntroCardDraftLinkX] = useState('');
  const [introCardDraftLinkGithub, setIntroCardDraftLinkGithub] = useState('');
  const [introCardDraftLinkLinkedin, setIntroCardDraftLinkLinkedin] =
    useState('');
  const [introCardDraftLinkPortfolio, setIntroCardDraftLinkPortfolio] =
    useState('');
  const [introCardDraftOtherLinks, setIntroCardDraftOtherLinks] = useState<
    readonly string[]
  >([]);
  const [introCardSaving, setIntroCardSaving] = useState(false);
  const [introCardNotice, setIntroCardNotice] = useState<IntroCardNotice>({
    kind: 'empty',
    message: MESSAGES[DEFAULT_LOCALE].introCard.initialNotice,
  });
  // Issue 92: 保存失敗時にどの入力欄へ focus するか（`IntroCardEditScreen` の
  // `errorFieldKey` prop にそのまま渡す）。`introCardNotice` と同じタイミングで
  // 更新し、新しい失敗が起きるたびに `resolveIntroCardErrorFieldKey` で
  // 保存時点のスナップショットから 1 回だけ解決する（Plan.md 設計節）。
  const [introCardErrorFieldKey, setIntroCardErrorFieldKey] = useState<
    IntroCardEditFieldKey | undefined
  >(undefined);
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
  const [showConversationSelfReport, setShowConversationSelfReport] =
    useState(false);
  // Issue 11: Pet Interaction の bounded protocol（`clarifying` の Owner Question）を
  // 保持する。`discovering` / `bridging` / `no-signal` は `pet-interaction-flow.ts` が
  // 呼び出しの中だけで一瞬経由し、確定した瞬間に Lounge 本体（`RetiredLounge`）へ収束させる
  // ため、この state に現れるのは `clarifying` か `null`（未着手・確定済み）だけである。
  const [interaction, setInteraction] = useState<PetInteractionState | null>(
    null
  );
  const [providerRuntimeState, setProviderRuntimeState] =
    useState<ProviderRuntimeState>(INITIAL_PROVIDER_RUNTIME_STATE);
  const [providerRunPending, setProviderRunPending] = useState(false);
  const [providerRunner] = useState(() => createAgentProviderSessionRunner());
  const [providerResultApplicationGate] = useState(() =>
    createProviderResultApplicationGate()
  );
  const activeEncounterKeyRef = useRef<string | null>(null);
  const providerTeardownPendingRef = useRef<Promise<void> | null>(null);
  const [loungeRoom, setLoungeRoom] = useState<LoungeRoomState | null>(null);
  const [issuedHandshake, setIssuedHandshake] =
    useState<IssuedLoungeHandshake | null>(null);
  const [scannedInvite, setScannedInvite] = useState<LoungeInvite | null>(null);
  const inviteFlowGenerationRef = useRef(0);
  const guestJoinInFlightRef = useRef(false);
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
  const [lastDiagnosticError, setLastDiagnosticError] =
    useState<DiagnosticErrorSignal | null>(null);
  // Issue 15: OS の Reduce Motion 設定。Composition Root（このファイル）だけが
  // `AccessibilityInfo`（React Native 同梱）を直接扱い、Port 自体（`reduced-motion-port.ts`）
  // は環境依存の取得手段を注入されるだけの純粋な形を保つ。
  const [reducedMotionPort] = useState(() =>
    createReducedMotionPort({
      isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
    })
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const trackProviderTeardown = useCallback(
    (
      operation: () => Promise<void>,
      resetRuntimeOnSuccess: boolean
    ): Promise<void> => {
      const existing = providerTeardownPendingRef.current;
      if (existing) return existing;
      setProviderRunPending(true);
      let reusable = false;
      const pending = operation()
        .then(() => {
          reusable = true;
        })
        .finally(() => {
          if (providerTeardownPendingRef.current !== pending) return;
          providerTeardownPendingRef.current = null;
          if (reusable) {
            setProviderRunPending(false);
            if (resetRuntimeOnSuccess) {
              setProviderRuntimeState(INITIAL_PROVIDER_RUNTIME_STATE);
            }
            return;
          }
          setProviderRunPending(true);
          setProviderRuntimeState({ status: 'failed' });
        });
      providerTeardownPendingRef.current = pending;
      return pending;
    },
    []
  );
  const cancelActiveProvider = useCallback((): void => {
    const encounterKey = activeEncounterKeyRef.current;
    activeEncounterKeyRef.current = null;
    providerResultApplicationGate.clear();
    if (encounterKey) providerRunner.forget(encounterKey);
    setProviderRuntimeState(INITIAL_PROVIDER_RUNTIME_STATE);
    void trackProviderTeardown(
      () => providerRunner.waitForNativeTeardowns(),
      true
    ).catch(() => undefined);
  }, [providerResultApplicationGate, providerRunner, trackProviderTeardown]);
  const waitForActiveProviderTeardown = useCallback((): Promise<void> => {
    providerResultApplicationGate.clear();
    const cancelAfterDrain = (): Promise<void> =>
      trackProviderTeardown(
        () => providerRunner.cancelAllAndWait().then(() => undefined),
        true
      );
    const existing = providerTeardownPendingRef.current;
    return existing ? existing.then(cancelAfterDrain) : cancelAfterDrain();
  }, [providerResultApplicationGate, providerRunner, trackProviderTeardown]);
  const waitForSettledProviderTeardown = useCallback((): void => {
    void trackProviderTeardown(
      () => providerRunner.waitForNativeTeardowns(),
      false
    ).catch(() => undefined);
  }, [providerRunner, trackProviderTeardown]);
  const localModels = useLocalModelManagement({
    management: localModelManagement,
    mutationLeases: localModelMutationLeases,
    fallbackProvider: agentModelProvider,
    waitForNativeTeardown: waitForActiveProviderTeardown,
    hasActiveProviderRun: providerRunPending,
    ready: !restoring,
  });

  useEffect(() => {
    if (stage === 'settings' && !providerRunPending) {
      localModels.view.reload();
    }
  }, [localModels.view.reload, providerRunPending, stage]);

  useEffect(() => {
    return () => {
      const encounterKey = activeEncounterKeyRef.current;
      activeEncounterKeyRef.current = null;
      providerResultApplicationGate.clear();
      if (encounterKey) providerRunner.forget(encounterKey);
    };
  }, [providerResultApplicationGate, providerRunner]);
  const handleBackupImportCommitted = useCallback(
    (committed: LocalPrivateProfile): void => {
      setPrivateProfile(committed);
      setShareSelection(createDefaultPassportShareSelection(committed));
    },
    []
  );
  // Issue 79: `restoring` を false にした直後や Settings / Backup を閉じた後の着地先は、
  // 既定でこの Callback が決める。起動時（`applyStartupRecoveryResult` の 'recovered'
  // 分岐）と Diagnostics の「全データ削除」の両方から呼ばれるため、その場の React state
  // ではなく `introCardRef.current`（同期参照）で判定する。全データ削除は Intro Card
  // Storage を対象にしないため（Issue 79 の follow-up、JSON Backup 統合と同様に別
  // Issue）、削除前後で Intro Card の有無は変化しない。
  const introCardHomeStage = useCallback(
    (): SetupStage => (introCardRef.current ? 'intro-card' : 'intro-card-edit'),
    []
  );

  // Issue 79: Backup も Intro Card 側の画面から開くのが既定経路のため、閉じた後は
  // Pet 側の 'profile' ではなく Intro Card の着地先へ戻す。
  const closeBackupStage = useCallback(
    () => setStage(introCardHomeStage()),
    [introCardHomeStage]
  );
  const backupFlow = useBackupFlow({
    localProfileStorage,
    backupSharePort,
    privateProfile,
    locale,
    reduceMotion,
    onImportCommitted: handleBackupImportCommitted,
    onOpenStage: setStage,
    onCloseStage: closeBackupStage,
    onDiagnosticError: setLastDiagnosticError,
  });
  const pilotMeasurementFlow = usePilotMeasurementFlow({
    sharePort: backupSharePort,
    onOpen: () => setStage('pilot-measurement'),
    onClose: () => setStage('settings'),
  });
  const recordPilotOutcome = useCallback(
    (
      state: LoungeState,
      clock: ClockSnapshot,
      provider: PilotProviderRun = 'rules'
    ): void => {
      if (state.status !== 'retired') return;
      pilotMeasurementFlow.outcome({
        kind: state.outcome.kind,
        provider,
        monotonicMs: clock.monotonicMs,
      });
    },
    [pilotMeasurementFlow.outcome]
  );

  // Invite は 1 回限り Secret の非公開 Buffer を持つ Host Handshake と対で保持する。
  // Room だけから Secret を再導出できないため、期限切れ / 破棄時は両方を同時に解放する。
  const invite = useMemo(
    () =>
      loungeRoom && loungeRoom.status !== 'expired' && issuedHandshake
        ? issuedHandshake.invite
        : null,
    [issuedHandshake, loungeRoom]
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
    inviteFlowGenerationRef.current += 1;
    guestJoinInFlightRef.current = false;
    issuedHandshake?.host.dispose();
    qrScannerPort.publish(null);
    setLoungeRoom(null);
    setIssuedHandshake(null);
    setScannedInvite(null);
    setGuestProfile(null);
    setGuestShareSelection(null);
    setSeenRawPayloads(new Set());
    setEncounteredPetName('');
    setEncounteredPetEmoji('🐶');
    setEncounteredSelection([]);
    setEncounteredConfirmed(false);
  }, [issuedHandshake, qrScannerPort]);

  const forgetLoungeForDiagnostics = useCallback((): void => {
    cancelActiveProvider();
    discardInviteFlow();
    pilotMeasurementFlow.abandon();
    setShowConversationSelfReport(false);
    setInteraction(null);
    setLounge(null);
    setErrorMessage(null);
  }, [cancelActiveProvider, discardInviteFlow, pilotMeasurementFlow.abandon]);

  const resetPassportInMemory = useCallback((): void => {
    setPetName('');
    setPetEmoji('🐾');
    setOwnerAlias('');
    setOwnerSelection([]);
    setLanguageSelection([]);
    setPrivateProfile(null);
    setShareSelection(null);
    setNotice({
      kind: 'empty',
      message: MESSAGES[localeRef.current].passportApp.emptyOnLoad,
    });
  }, []);

  const resetAllLocalMemory = useCallback(
    (recoveryRequired: boolean): void => {
      forgetLoungeForDiagnostics();
      localModels.invalidateAfterExternalPurge();
      resetPassportInMemory();
      backupFlow.reset();
      pilotMeasurementFlow.reset();
      if (!recoveryRequired) {
        setRestoring(false);
        setStage(introCardHomeStage());
      }
    },
    [
      backupFlow,
      forgetLoungeForDiagnostics,
      introCardHomeStage,
      localModels.invalidateAfterExternalPurge,
      pilotMeasurementFlow.reset,
      resetPassportInMemory,
    ]
  );

  const applyStartupRecoveryResult = useCallback(
    (
      result: Exclude<
        StartupLocalRecoveryResult,
        { readonly kind: 'recovery-failed' }
      >
    ): void => {
      if (result.kind === 'loaded' && result.recovery === 'recovered') {
        resetAllLocalMemory(false);
        return;
      }
      if (result.kind === 'profile-load-failed') {
        setLastDiagnosticError(startupDiagnosticError(result.error));
        setNotice(
          profileNoticeFromStorageError(result.error, 'load', localeRef.current)
        );
        setRestoring(false);
        setStage(introCardHomeStage());
        return;
      }
      const { profile } = result;
      if (!profile) {
        setNotice({
          kind: 'empty',
          message: MESSAGES[localeRef.current].passportApp.emptyOnLoad,
        });
        setRestoring(false);
        setStage(introCardHomeStage());
        return;
      }
      // Issue 79: Pet Profile が既にあっても既定の着地先は Intro Card 側へ統一する
      // （Pet / Lounge / Encounter は導線から外す）。ここで Pet 側の state を復元
      // しておくのは、コードを削除せず Settings 経由等で将来再度たどり着けるようにする
      // ためであり、この分岐自体は 'encounter' へは遷移しない。
      setPetName(profile.petName);
      setPetEmoji(profile.petEmoji);
      setOwnerAlias(profile.ownerAlias ?? '');
      setOwnerSelection(profile.candidateClues.map((clue) => clue.value));
      setLanguageSelection([...profile.languages]);
      setPrivateProfile(profile);
      setShareSelection(createDefaultPassportShareSelection(profile));
      setStage(introCardHomeStage());
      setNotice({
        kind: 'restored',
        message: MESSAGES[localeRef.current].passportApp.restoredOnLoad,
      });
      setRestoring(false);
    },
    [introCardHomeStage, resetAllLocalMemory]
  );
  const applyStartupRecoveryResultRef = useRef(applyStartupRecoveryResult);
  applyStartupRecoveryResultRef.current = applyStartupRecoveryResult;

  const retryStartupRecovery = useCallback(async (): Promise<
    'not-pending' | 'recovered'
  > => {
    const result = await recoverLocalStateAtStartup(
      localDataControl,
      localProfileStorage
    );
    if (result.kind === 'recovery-failed') throw result.error;
    applyStartupRecoveryResultRef.current(result);
    return result.kind === 'loaded' ? result.recovery : 'not-pending';
  }, [localDataControl, localProfileStorage]);

  const diagnosticsRuntimeSnapshot = useMemo(() => {
    const providerError: DiagnosticErrorSignal | null =
      providerRuntimeState.status === 'failed'
        ? { code: 'LOAD_ERROR', phase: 'model-load' }
        : null;
    return {
      appVersion,
      providerStatus: providerRuntimeState.status,
      transport: diagnosticTransportSnapshot(
        lounge,
        loungeRoom,
        cameraPermission
      ),
      lastError: lastDiagnosticError ?? providerError,
    };
  }, [
    appVersion,
    cameraPermission,
    lastDiagnosticError,
    lounge,
    loungeRoom,
    providerRuntimeState.status,
  ]);
  const openDiagnostics = useCallback((): void => setStage('diagnostics'), []);
  const diagnosticsFlow = useLocalDiagnosticsFlow({
    localDataControl,
    backupSharePort,
    runtimeSnapshot: diagnosticsRuntimeSnapshot,
    onOpen: openDiagnostics,
    onClose: () => setStage('settings'),
    onEndAndForgetLounge: forgetLoungeForDiagnostics,
    onPassportReset: resetPassportInMemory,
    onModelRemoved: localModels.invalidateAfterExternalPurge,
    onAllDataDeleted: resetAllLocalMemory,
    onRetryStartupRecovery: retryStartupRecovery,
    onError: setLastDiagnosticError,
  });

  // 初回復元は起動時 1 回だけ実行する副作用であり、その後の locale 切替のたびに
  // 再実行（＝再読込）すると Settings の「Lounge State と Consent を失わない」契約に
  // 反する。localeRef は復元完了時点の表示言語だけを読み、effect 自体の再実行要因にしない。
  useEffect(() => {
    let active = true;
    // Issue 79: Intro Card の読込は Pet Profile Recovery（`recoverLocalStateAtStartup`）と
    // 完全に独立した Storage だが、既定の着地 stage は両方が揃ってから 1 回で決めたいため
    // `Promise.all` で束ねる。`introCardStorage.load()` 自体の失敗は Promise.all 全体を
    // reject させず、`null`（カードなし扱い）へ畳み込んだ上で Notice にだけ反映する。
    void Promise.all([
      recoverLocalStateAtStartup(localDataControl, localProfileStorage),
      introCardStorage.load().catch((error: unknown) => {
        if (active) {
          setIntroCardNotice(
            introCardNoticeFromError(error, 'load', localeRef.current)
          );
        }
        return null;
      }),
    ]).then(([result, loadedIntroCard]) => {
      if (!active) return;
      introCardRef.current = loadedIntroCard;
      setIntroCard(loadedIntroCard);
      if (result.kind === 'recovery-failed') {
        setLastDiagnosticError(startupDiagnosticError(result.error));
        diagnosticsFlow.enterRecovery(result.error);
        return;
      }
      applyStartupRecoveryResultRef.current(result);
    });
    return () => {
      active = false;
    };
  }, [
    diagnosticsFlow.enterRecovery,
    introCardStorage,
    localDataControl,
    localProfileStorage,
  ]);

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
          recordPilotOutcome(step.lounge, clock);
          cancelActiveProvider();
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
        cancelActiveProvider();
        pilotMeasurementFlow.abandon();
        setInteraction(null);
      }
      setLounge(advanced);
    },
    [
      cancelActiveProvider,
      interaction,
      pilotMeasurementFlow.abandon,
      recordPilotOutcome,
    ]
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
        pilotMeasurementFlow.abandon();
        setLounge({ status: 'destroyed', reason: 'expired' });
        return;
      }
      setLoungeRoom(advanced);
    },
    [discardInviteFlow, pilotMeasurementFlow.abandon]
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

  // Issue 15: 起動時に一度 Reduce Motion を判定し、以後は OS の変更を購読する。
  // `reducedMotionPort` は fail-safe（取得失敗時は Motion 有効）のため、この effect
  // 自体は例外を投げない。
  useEffect(() => {
    let active = true;
    void reducedMotionPort.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled: boolean) => setReduceMotion(enabled)
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, [reducedMotionPort]);

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
        message: MESSAGES[locale].passportApp.savedNotice,
      });
      setErrorMessage(null);
      setStage('encounter');
    } catch (error: unknown) {
      setLastDiagnosticError({
        code:
          error instanceof LocalProfileStorageError ||
          error instanceof LocalDataAccessBlockedError
            ? 'STORAGE_FAILURE'
            : 'SCHEMA_ERROR',
        phase: 'profile-write',
      });
      setNotice(
        error instanceof LocalProfileStorageError ||
          error instanceof LocalDataAccessBlockedError
          ? profileNoticeFromStorageError(error, 'save', locale)
          : {
              kind: 'validation-error',
              message: readableError(error, VALIDATION_ERROR_FALLBACK),
            }
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * リンク系 4 名前付き欄 + 自由リンクの現在の draft を `IntroCardLinksDraft`
   * 形へまとめる。`introCardDraftAsShape`（保存時の配列組み立て）と
   * `saveIntroCard` の catch 節（`resolveIntroCardErrorFieldKey` へ渡す、
   * Issue 92）の両方が同じ形を必要とするため、ここへ一本化する
   * （simplify レビュー指摘: 同じ 5 プロパティの object literal が
   * 2 箇所にコピペされていた）。
   */
  function introCardLinksDraftShape(): IntroCardLinksDraft {
    return {
      x: introCardDraftLinkX,
      github: introCardDraftLinkGithub,
      linkedin: introCardDraftLinkLinkedin,
      portfolio: introCardDraftLinkPortfolio,
      otherLinks: introCardDraftOtherLinks,
    };
  }

  /**
   * Issue 79: 空文字・空白のみは undefined 扱いにする正規化は `createIntroCard`
   * 自身が担う（`src/domain/intro-card.ts`）ため、ここでは draft の生文字列を
   * そのまま渡すだけでよい。`links` は Issue 90 で「X / GitHub / LinkedIn /
   * Portfolio の名前付き欄 + 自由リンク」の draft から `buildIntroCardLinks`
   * （ユーザー名だけの入力をサービス別 URL へ補完する）で組み立てる。
   */
  function introCardDraftAsShape(): IntroCard {
    return {
      name: introCardDraftName,
      title: introCardDraftTitle,
      organization: introCardDraftOrganization,
      selfIntro: introCardDraftSelfIntro,
      links: buildIntroCardLinks(introCardLinksDraftShape()),
      email: introCardDraftEmail,
      phone: introCardDraftPhone,
    };
  }

  function loadIntroCardDraftFrom(card: IntroCard): void {
    setIntroCardDraftName(card.name);
    setIntroCardDraftTitle(card.title ?? '');
    setIntroCardDraftOrganization(card.organization ?? '');
    setIntroCardDraftSelfIntro(card.selfIntro ?? '');
    setIntroCardDraftEmail(card.email ?? '');
    setIntroCardDraftPhone(card.phone ?? '');
    // Issue 90: 保存済みの `links`（フラット配列）を、hostname が既知サービス
    // （x.com/twitter.com・github.com・linkedin.com）に一致する最初の 1 件だけ
    // 対応欄へ割り当て、残りは自由リンクへ戻す（`classifyIntroCardLinks`）。
    const classifiedLinks = classifyIntroCardLinks(card.links ?? []);
    setIntroCardDraftLinkX(classifiedLinks.x);
    setIntroCardDraftLinkGithub(classifiedLinks.github);
    setIntroCardDraftLinkLinkedin(classifiedLinks.linkedin);
    setIntroCardDraftLinkPortfolio(classifiedLinks.portfolio);
    setIntroCardDraftOtherLinks(classifiedLinks.otherLinks);
  }

  function openIntroCardEdit(): void {
    if (introCard) loadIntroCardDraftFrom(introCard);
    setIntroCardNotice({
      kind: 'empty',
      message: MESSAGES[locale].introCard.initialNotice,
    });
    setIntroCardErrorFieldKey(undefined);
    setStage('intro-card-edit');
  }

  async function saveIntroCard(): Promise<void> {
    if (introCardSaving) return;
    setIntroCardSaving(true);
    try {
      const card = createIntroCard(introCardDraftAsShape());
      // 自己紹介ページ URL 化と 1,024 byte 上限の検証をここで通す（保存後の
      // 表示画面では再検証せずそのまま QR 化できる前提を保つ。Issue 84 で
      // QR の中身が vCard 直埋めから URL へ変わったため、検証対象も
      // encodeVCard から encodeIntroCardUrl へ揃える）。
      encodeIntroCardUrl(card);
      await introCardStorage.save(card);
      introCardRef.current = card;
      setIntroCard(card);
      setIntroCardNotice({
        kind: 'saved',
        message: MESSAGES[locale].introCard.noticeTitles.saved,
      });
      setIntroCardErrorFieldKey(undefined);
      setStage('intro-card');
    } catch (error: unknown) {
      const nextNotice = introCardNoticeFromError(error, 'save', locale);
      setIntroCardNotice(nextNotice);
      // Issue 92: 失敗時点の draft（現在の入力値）のスナップショットから
      // 1 回だけ「どの欄が原因か」を解決する。画面側で都度再計算しない理由は
      // Plan.md 設計節（入力中に focus が奪われる体験を避けるため）。
      setIntroCardErrorFieldKey(
        resolveIntroCardErrorFieldKey(nextNotice, introCardLinksDraftShape())
      );
    } finally {
      setIntroCardSaving(false);
    }
  }

  async function deleteIntroCard(): Promise<void> {
    try {
      await introCardStorage.remove();
      introCardRef.current = null;
      setIntroCard(null);
      setIntroCardDraftName('');
      setIntroCardDraftTitle('');
      setIntroCardDraftOrganization('');
      setIntroCardDraftSelfIntro('');
      setIntroCardDraftEmail('');
      setIntroCardDraftPhone('');
      setIntroCardDraftLinkX('');
      setIntroCardDraftLinkGithub('');
      setIntroCardDraftLinkLinkedin('');
      setIntroCardDraftLinkPortfolio('');
      setIntroCardDraftOtherLinks([]);
      setIntroCardNotice({
        kind: 'empty',
        message: MESSAGES[locale].introCard.initialNotice,
      });
      setIntroCardErrorFieldKey(undefined);
      setStage('intro-card-edit');
    } catch (error: unknown) {
      // stage は変えない（'intro-card' に留まる）。失敗時の Notice は
      // IntroCardScreen 側（deleteError prop）で表示する。delete 操作は
      // 編集画面の入力欄に紐づかないため errorFieldKey は対象外（undefined のまま）。
      setIntroCardNotice(introCardNoticeFromError(error, 'delete', locale));
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
      setErrorMessage(readableError(error, VALIDATION_ERROR_FALLBACK));
    }
  }

  function hostLounge(): void {
    if (!privateProfile || !shareSelection) return;
    const flowGeneration = inviteFlowGenerationRef.current + 1;
    inviteFlowGenerationRef.current = flowGeneration;
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
      const transportFingerprint = inProcessTransportFingerprint(
        identifiers.loungeId
      );
      void issueLoungeHandshake({
        loungeId: identifiers.loungeId,
        issuedAtEpochMs: clock.wallClockMs,
        startedAtMonotonicMs: clock.monotonicMs,
        expiresAtEpochMs: room.expiresAtWallClockMs,
        capacity: ROOM_CAPACITY,
        requiredCapabilities: ['rules-provider-v1'],
        hostDiscoveryHint: IN_PROCESS_DISCOVERY_HINT,
        transportFingerprint,
        randomBytes: webCryptoRandomBytes,
      })
        .then((handshake) => {
          if (inviteFlowGenerationRef.current !== flowGeneration) {
            handshake.host.dispose();
            return;
          }
          pilotMeasurementFlow.start();
          qrScannerPort.publish(
            encodeQrPayload({
              kind: 'lounge-invite',
              value: handshake.invite,
            })
          );
          setIssuedHandshake(handshake);
          setScannedInvite(null);
          setLoungeRoom(room);
          setSeenRawPayloads(new Set());
          setNowMs(Date.now());
          setErrorMessage(null);
          setStage('host-invite');
        })
        .catch((error: unknown) => {
          if (inviteFlowGenerationRef.current === flowGeneration) {
            setLastDiagnosticError({
              code: 'TRANSPORT_UNAVAILABLE',
              phase: 'transport',
            });
            setErrorMessage(qrFlowErrorMessage(error, locale));
          }
        });
    } catch (error: unknown) {
      setLastDiagnosticError({
        code: 'UNEXPECTED_FAILURE',
        phase: 'transport',
      });
      setErrorMessage(qrFlowErrorMessage(error, locale));
    }
  }

  function markHostReady(): void {
    if (!loungeRoom || !hostParticipantId) return;
    try {
      const clock = currentClock();
      const updated = markParticipantReady(loungeRoom, {
        participantId: hostParticipantId,
        clock,
      });
      setErrorMessage(null);
      if (updated.status === 'ready') {
        activateReadyLounge(updated, clock);
      } else {
        setLoungeRoom(updated);
      }
    } catch (error: unknown) {
      setLastDiagnosticError({
        code: 'TRANSPORT_UNAVAILABLE',
        phase: 'transport',
      });
      setErrorMessage(qrFlowErrorMessage(error, locale));
    }
  }

  function beginGuestScan(): void {
    setErrorMessage(null);
    setStage('guest-scan');
    void qrScannerPort
      .getPermissionState()
      .then(setCameraPermission)
      .catch(() => {
        setLastDiagnosticError({
          code: 'PERMISSION_DENIED',
          phase: 'permission',
        });
      });
  }

  function requestCameraPermission(): void {
    void qrScannerPort
      .requestPermission()
      .then(setCameraPermission)
      .catch(() => {
        setLastDiagnosticError({
          code: 'PERMISSION_DENIED',
          phase: 'permission',
        });
      });
  }

  function recheckCameraPermission(): void {
    void qrScannerPort
      .getPermissionState()
      .then(setCameraPermission)
      .catch(() => {
        setLastDiagnosticError({
          code: 'PERMISSION_DENIED',
          phase: 'permission',
        });
      });
  }

  function performScan(): void {
    const flowGeneration = inviteFlowGenerationRef.current;
    void scanQrPayload(qrScannerPort, seenRawPayloads)
      .then((result) => {
        if (inviteFlowGenerationRef.current !== flowGeneration) return;
        setSeenRawPayloads(result.seenRawPayloads);
        if (result.payload.kind !== 'lounge-invite') {
          setLastDiagnosticError({
            code: 'SCHEMA_ERROR',
            phase: 'transport',
          });
          setErrorMessage(MESSAGES[locale].qrErrorNotice.notLoungeInviteQr);
          return;
        }
        setScannedInvite(result.payload.value);
        // Guest が公開する内容は、対面で相手が declare した内容として既に Encounter
        // 画面で入力済みである（Issue 4 由来）。ここでは新たに入力を求めず、
        // その内容から今回の共有 Preview を組み立てて Ready 操作へ進む。Render 時に
        // 再導出せず、確定できた瞬間の値をそのまま state へ保持する。
        const resolvedGuestProfile = resolveGuestProfile(encounteredProfile);
        if (!resolvedGuestProfile) {
          setLastDiagnosticError({
            code: 'SCHEMA_ERROR',
            phase: 'transport',
          });
          setErrorMessage(
            MESSAGES[locale].qrErrorNotice.unresolvedGuestProfile
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
        if (inviteFlowGenerationRef.current === flowGeneration) {
          setLastDiagnosticError({
            code: 'SCHEMA_ERROR',
            phase: 'transport',
          });
          setErrorMessage(qrFlowErrorMessage(error, locale));
        }
      });
  }

  function guestReady(): void {
    if (
      !loungeRoom ||
      !guestShareSelection ||
      !guestProfile ||
      !issuedHandshake ||
      !scannedInvite ||
      guestJoinInFlightRef.current
    )
      return;
    const flowGeneration = inviteFlowGenerationRef.current;
    guestJoinInFlightRef.current = true;
    void (async () => {
      try {
        const guestParticipantId = createParticipantId(webCryptoRandomBytes);
        const request = await createLoungeJoinRequest(
          scannedInvite,
          guestParticipantId
        );
        await issuedHandshake.host.authorizeJoin(
          encodeLoungeJoinRequest(request),
          {
            clock: currentClock(),
            // QR の主張値ではなく Host が発行前から保持する Adapter identity を渡す。
            // Issue 20 / 22 では実 Transport が測定した証明書 Fingerprint に置き換える。
            transportFingerprint: issuedHandshake.invite.transportFingerprint,
          }
        );
        if (inviteFlowGenerationRef.current !== flowGeneration) return;
        const guestShare = createPassportShare(
          guestProfile,
          guestShareSelection
        );
        const clock = currentClock();
        const joined = joinLoungeRoom(loungeRoom, {
          participantId: guestParticipantId,
          publicPassport: guestShare.qrProjection,
          clock,
        });
        const readied = markParticipantReady(joined, {
          participantId: guestParticipantId,
          clock,
        });
        // 1 回限り Invite は Guest の認証成功時点で役目を終える。Host の Ready を
        // 待たず QR を取り下げ、Secret を含む React state の参照も解放する。
        issuedHandshake.host.dispose();
        qrScannerPort.publish(null);
        setIssuedHandshake(null);
        setScannedInvite(null);
        setSeenRawPayloads(new Set());
        setErrorMessage(null);
        if (readied.status === 'ready') {
          activateReadyLounge(readied, clock);
        } else {
          setLoungeRoom(readied);
          setStage('host-invite');
        }
      } catch (error: unknown) {
        if (inviteFlowGenerationRef.current === flowGeneration) {
          setLastDiagnosticError({
            code: 'TRANSPORT_UNAVAILABLE',
            phase: 'transport',
          });
          setErrorMessage(qrFlowErrorMessage(error, locale));
        }
      } finally {
        if (inviteFlowGenerationRef.current === flowGeneration) {
          guestJoinInFlightRef.current = false;
        }
      }
    })();
  }

  /** Ready Room の ID を Provider lifetime の Encounter Key として保持して Lounge を開始する。 */
  function activateReadyLounge(
    room: ReadyLoungeRoom,
    clock: ClockSnapshot
  ): void {
    cancelActiveProvider();
    activeEncounterKeyRef.current = room.loungeId;
    issuedHandshake?.host.dispose();
    qrScannerPort.publish(null);
    setLoungeRoom(null);
    setIssuedHandshake(null);
    setScannedInvite(null);
    setInteraction(null);
    pilotMeasurementFlow.ready(clock.monotonicMs);
    setLounge(startLoungeFromRoom(room));
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
    pilotMeasurementFlow.abandon();
    setLounge(destroyed);
    setErrorMessage(null);
  }

  function cancelInvite(): void {
    endInvite('host-ended');
  }

  /**
   * 「会話の糸を探す」操作 1 回で共通 Model Provider を実行する。検証済み Bridge は
   * そのまま Retired Lounge へ、保守的な no-signal は既存の bounded Rules Discovery と
   * Owner Question へ渡す。Runner が二重 Tap、Deadline、Fallback-once を所有する。
   */
  function startPetInteraction(): void {
    if (lounge?.status !== 'active') return;
    const encounterKey = activeEncounterKeyRef.current;
    if (!encounterKey) return;
    if (providerTeardownPendingRef.current) return;
    if (localModels.isMutationPending()) return;
    const applicationToken = providerResultApplicationGate.begin(encounterKey);
    if (!applicationToken) return;
    const active = lounge;
    const clock = currentClock();
    const input: AgentModelInput = {
      ownerPassport: active.ownerPassport,
      encounteredPassport: active.encounteredPassport,
      language: locale,
      deadlineAtWallClockMs: Math.min(
        clock.wallClockMs + INTERACTION_DEADLINE_MS,
        active.expiresAtWallClockMs
      ),
    };
    setProviderRuntimeState(INITIAL_PROVIDER_RUNTIME_STATE);
    setProviderRunPending(true);
    setErrorMessage(null);
    void providerRunner
      .run({
        state: INITIAL_PROVIDER_RUNTIME_STATE,
        encounterKey,
        provider: localModels.provider,
        input,
        onStateChange(state) {
          if (
            activeEncounterKeyRef.current === encounterKey &&
            providerResultApplicationGate.isPending(applicationToken)
          ) {
            setProviderRuntimeState(state);
          }
        },
      })
      .then(
        (result) => {
          waitForSettledProviderTeardown();
          if (
            activeEncounterKeyRef.current !== encounterKey ||
            !providerResultApplicationGate.settle(applicationToken)
          ) {
            return;
          }
          const outcomeClock = currentClock();
          const step = applyAgentModelDecisionBeforeLoungeExpiry(
            active,
            input,
            result.outcome.decision,
            RULES_INTERACTION_PROVIDER,
            clock,
            outcomeClock
          );
          if (step.lounge.status === 'destroyed') {
            cancelActiveProvider();
            pilotMeasurementFlow.abandon();
            setInteraction(null);
            setLounge(step.lounge);
            return;
          }
          setProviderRuntimeState(result.state);
          recordPilotOutcome(
            step.lounge,
            outcomeClock,
            pilotProviderRunFromOutcome(result.outcome)
          );
          if (step.lounge.status !== 'active') cancelActiveProvider();
          setInteraction(step.interaction);
          setLounge(step.lounge);
        },
        () => {
          waitForSettledProviderTeardown();
          if (
            activeEncounterKeyRef.current === encounterKey &&
            providerResultApplicationGate.settle(applicationToken)
          ) {
            setProviderRuntimeState({ status: 'failed' });
          }
        }
      );
  }

  /**
   * Owner Question への回答（答える(yes) / 分からない(no) / パス(decline)）を適用する。
   * `submitOwnerQuestionAnswer` が `clarifying` 以外では no-op を返すため、二重送信や
   * 締切超過後の遅延送信は安全に無視される（Question Budget を超えない）。`locale`
   * （UI 表示言語）は Bridge が確定する場合だけ `receiveOwnerAnswer` を経由して
   * Bridge 文言へ反映される（Issue 15）。
   */
  function submitOwnerAnswer(value: OwnerAnswerValue): void {
    if (lounge?.status !== 'active') return;
    const clock = currentClock();
    const step = submitOwnerQuestionAnswer(
      interaction,
      lounge,
      value,
      clock,
      locale
    );
    recordPilotOutcome(step.lounge, clock);
    if (step.lounge.status !== 'active') cancelActiveProvider();
    setInteraction(step.interaction);
    setLounge(step.lounge);
    setErrorMessage(null);
  }

  function leave(): void {
    cancelActiveProvider();
    pilotMeasurementFlow.abandon();
    setShowConversationSelfReport(false);
    setInteraction(null);
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'owner-exit' }) : current
    );
    setErrorMessage(null);
  }

  function endAsHost(): void {
    cancelActiveProvider();
    pilotMeasurementFlow.abandon();
    setShowConversationSelfReport(false);
    setInteraction(null);
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'host-ended' }) : current
    );
    setErrorMessage(null);
  }

  function complete(): void {
    cancelActiveProvider();
    const shouldShowSelfReport =
      lounge?.status === 'retired' && lounge.outcome.kind === 'bridge';
    const showSelfReport =
      pilotMeasurementFlow.selfReportPending && shouldShowSelfReport;
    discardInviteFlow();
    setInteraction(null);
    setLounge((current) =>
      current ? reduceLounge(current, { type: 'complete' }) : current
    );
    setShowConversationSelfReport(showSelfReport);
    setErrorMessage(null);
  }

  function submitConversationSelfReport(answer: ConversationSelfReport): void {
    pilotMeasurementFlow.selfReport(answer);
    setShowConversationSelfReport(false);
  }

  function skipConversationSelfReport(): void {
    pilotMeasurementFlow.skipSelfReport();
    setShowConversationSelfReport(false);
  }

  function restartEncounter(): void {
    // discardInviteFlow() が相手の宣言内容（encounteredPetName 等）も含めて
    // Lounge 由来の一時データを一括破棄する。
    discardInviteFlow();
    cancelActiveProvider();
    pilotMeasurementFlow.abandon();
    setShowConversationSelfReport(false);
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
    pilotMeasurementFlow.abandon();
    setErrorMessage(null);
    setStage('profile');
    if (hadInviteInProgress) {
      setNotice({
        kind: 'lounge-discarded',
        message: MESSAGES[locale].passportApp.loungeDiscardedNotice,
      });
    }
  }

  /**
   * Issue 15: Settings 画面への往復。`onChangeLocale` は `setLocale` だけを呼び、
   * Lounge / Room / Pet Interaction / 保存済み Local Profile のいずれの state にも
   * 触れない（`src/screens/settings-accessibility.test.ts` が Settings 画面側の
   * 契約を、`passport-app-stage-flow.test.ts` がこの配線を固定する）。
   */
  function openSettings(): void {
    if (saving) return;
    setStage('settings');
  }

  function closeSettings(): void {
    // Issue 79: Settings は今や Intro Card 側の画面から開くのが既定経路のため、
    // 閉じた後は Pet 側の 'profile' ではなく Intro Card の着地先へ戻す。
    setStage(introCardHomeStage());
  }

  // Settings と Diagnostics は Lounge の状態確認より先に判定する。これにより、Active
  // Lounge / Owner Question / Outcome / Destroyed のどの段階からでも設定と診断を開ける。
  // 戻る操作は `stage` だけを変えるため、Diagnostics の明示削除 Action を実行しない限り
  // Lounge state は変化せず、Settings を閉じた次の render で元の段階へ戻る。
  if (UTILITY_STAGES.has(stage)) {
    return (
      <UtilityStageGate
        diagnosticsFlow={diagnosticsFlow}
        distributionCapability={distributionCapability}
        hasLounge={hasDisposableLounge(lounge, loungeRoom)}
        hasProfile={privateProfile !== null}
        locale={locale}
        modelManagement={localModels.view}
        onChangeLocale={setLocale}
        onCloseSettings={closeSettings}
        pilotMeasurementFlow={pilotMeasurementFlow}
        stage={stage}
      />
    );
  }

  if (showConversationSelfReport) {
    return (
      <ConversationSelfReportScreen
        locale={locale}
        onAnswer={submitConversationSelfReport}
        onSkip={skipConversationSelfReport}
      />
    );
  }

  if (lounge?.status === 'active' && interaction?.phase === 'clarifying') {
    return (
      <OwnerQuestionScreen
        errorMessage={errorMessage}
        locale={locale}
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
        locale={locale}
        lounge={lounge}
        onBeginInteraction={startPetInteraction}
        onExit={leave}
        onHostEnd={endAsHost}
        onOpenSettings={openSettings}
        providerBusy={providerRunPending}
        providerStatus={providerRuntimeState.status}
        reduceMotion={reduceMotion}
        remainingMs={lounge.expiresAtWallClockMs - nowMs}
      />
    );
  }
  if (lounge?.status === 'retired') {
    return (
      <OutcomeScreen
        locale={locale}
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
      <DestroyedLoungeScreen
        locale={locale}
        lounge={lounge}
        onRestart={restartEncounter}
      />
    );
  }
  if (restoring) return <ProfileLoadingScreen locale={locale} />;

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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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
        locale={locale}
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

  return (
    <ProfileHomeGate
      backupFlow={backupFlow}
      creation={{
        languageSelection,
        notice,
        onChangeOwnerAlias: setOwnerAlias,
        onChangePetName: setPetName,
        onSave: () => void saveLocalProfile(),
        onSelectPetEmoji: setPetEmoji,
        onToggleClue: (id) =>
          setOwnerSelection((current) =>
            toggleClueId(current, id, PROFILE_MAX_CLUES)
          ),
        onToggleLanguage: (code) =>
          setLanguageSelection((current) =>
            toggleLanguageCode(current, code, PROFILE_MAX_LANGUAGES)
          ),
        ownerAlias,
        ownerSelection,
        petEmoji,
        petName,
        saving,
      }}
      encounter={{
        encounteredConfirmed,
        encounteredPetEmoji,
        encounteredPetName,
        encounteredSelection,
        errorMessage,
        onBack: editLocalProfile,
        onChangePetName: setEncounteredPetName,
        onContinue: continueToPreview,
        onSelectPetEmoji: setEncounteredPetEmoji,
        onToggleClue: (id) =>
          setEncounteredSelection((current) =>
            toggleClueId(current, id, PUBLIC_PASSPORT_MAX_CLUES)
          ),
        onToggleConfirmed: () => setEncounteredConfirmed((current) => !current),
      }}
      introCard={introCard}
      introCardEdit={{
        cardUrlByteUsage: introCardUrlByteLength(introCardDraftAsShape()),
        email: introCardDraftEmail,
        errorFieldKey: introCardErrorFieldKey,
        linkGithub: introCardDraftLinkGithub,
        linkLinkedin: introCardDraftLinkLinkedin,
        linkPortfolio: introCardDraftLinkPortfolio,
        linkX: introCardDraftLinkX,
        name: introCardDraftName,
        notice: introCardNotice,
        onAddOtherLink: () =>
          setIntroCardDraftOtherLinks((current) => addOtherLink(current)),
        onChangeEmail: setIntroCardDraftEmail,
        onChangeLinkGithub: setIntroCardDraftLinkGithub,
        onChangeLinkLinkedin: setIntroCardDraftLinkLinkedin,
        onChangeLinkPortfolio: setIntroCardDraftLinkPortfolio,
        onChangeLinkX: setIntroCardDraftLinkX,
        onChangeName: setIntroCardDraftName,
        onChangeOrganization: setIntroCardDraftOrganization,
        onChangeOtherLink: (index, value) =>
          setIntroCardDraftOtherLinks((current) =>
            updateOtherLink(current, index, value)
          ),
        onChangePhone: setIntroCardDraftPhone,
        onChangeSelfIntro: setIntroCardDraftSelfIntro,
        onChangeTitle: setIntroCardDraftTitle,
        onRemoveOtherLink: (index) =>
          setIntroCardDraftOtherLinks((current) =>
            removeOtherLink(current, index)
          ),
        onSave: () => void saveIntroCard(),
        organization: introCardDraftOrganization,
        otherLinks: introCardDraftOtherLinks,
        phone: introCardDraftPhone,
        saving: introCardSaving,
        selfIntro: introCardDraftSelfIntro,
        title: introCardDraftTitle,
      }}
      locale={locale}
      onDeleteIntroCard={() => void deleteIntroCard()}
      onEditIntroCard={openIntroCardEdit}
      onOpenSettings={openSettings}
      privateProfile={privateProfile}
      stage={stage}
    />
  );
}
