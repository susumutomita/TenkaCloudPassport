import type { Locale } from './locale';

/**
 * Issue 15: 型付き Message Catalog。`Record<Locale, AppMessages>` の形にすることで、
 * `ja` / `en` の両方が `AppMessages` の全 key を実装することを `bun run typecheck` が
 * 機械的に強制する（`docs/design/i18n-and-accessibility.md` の設計判断 2）。
 *
 * 製品語彙（Bridge / Lounge / Pet / Owner / Passport / Encounter / Ready / no-signal /
 * retired 等、`docs/product/glossary.md` の指定用語）は両 Locale で翻訳せずそのまま使う。
 * 動的な値を含む文言は関数値にし、JA/EN それぞれが自然な語順を独立に持てるようにする。
 * このファイルは他の app モジュールを import しない（notice モジュール・Screen がここへ
 * 依存する一方向の関係を保ち、循環 import を作らない）。
 */

export interface ProfileNoticeTitles {
  readonly empty: string;
  readonly restored: string;
  readonly 'validation-error': string;
  readonly 'save-error': string;
  readonly 'storage-unavailable': string;
  readonly 'invalid-data': string;
  readonly 'read-error': string;
  readonly 'lounge-discarded': string;
}

export interface DiagnosticRecoveryMessages {
  readonly TIMEOUT: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly CANCELLED: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly SCHEMA_ERROR: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly LOAD_ERROR: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly STORAGE_FAILURE: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly DELETE_INTERRUPTED: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly MODEL_IN_USE: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly PERMISSION_DENIED: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly TRANSPORT_UNAVAILABLE: {
    readonly title: string;
    readonly steps: readonly string[];
  };
  readonly UNEXPECTED_FAILURE: {
    readonly title: string;
    readonly steps: readonly string[];
  };
}

export interface AppMessages {
  readonly common: {
    readonly brand: string;
    readonly settingsButton: string;
    readonly settingsButtonHint: string;
    readonly backButton: string;
  };
  readonly profileLoading: {
    readonly title: string;
    readonly description: string;
    readonly loading: string;
  };
  readonly passportApp: {
    readonly initialNotice: string;
    readonly emptyOnLoad: string;
    readonly restoredOnLoad: string;
    readonly savedNotice: string;
    readonly loungeDiscardedNotice: string;
    readonly storageDefaultFailure: string;
  };
  readonly passportCreation: {
    readonly title: string;
    readonly description: string;
    readonly noticeTitles: ProfileNoticeTitles;
    readonly petNameLabel: string;
    readonly petNameAccessibilityLabel: string;
    readonly petNameHint: (maxLength: number) => string;
    readonly petNamePlaceholder: string;
    readonly petNameCounter: (current: number, max: number) => string;
    readonly petEmojiLabel: string;
    readonly ownerAliasLabel: string;
    readonly ownerAliasAccessibilityLabel: string;
    readonly ownerAliasHint: (maxLength: number) => string;
    readonly ownerAliasPlaceholder: string;
    readonly ownerAliasCounter: (current: number, max: number) => string;
    readonly cluesSectionTitle: string;
    readonly cluesCounter: (current: number, max: number) => string;
    readonly cluesLimitNote: string;
    readonly languagesSectionTitle: string;
    readonly languagesNote: string;
    readonly saveButton: (saving: boolean) => string;
    readonly saveButtonHint: string;
    readonly backupButton: string;
    readonly backupButtonHint: string;
  };
  readonly encounterSetup: {
    readonly title: string;
    readonly description: string;
    readonly localProfileSummaryLabel: string;
    readonly localProfileSummaryValue: (
      petName: string,
      clueCount: number
    ) => string;
    readonly peerPetNameSectionTitle: string;
    readonly peerPetNameAccessibilityLabel: string;
    readonly peerPetNameHint: (maxLength: number) => string;
    readonly peerPetNamePlaceholder: string;
    readonly peerPetNameCounter: (current: number, max: number) => string;
    readonly peerPetEmojiSectionTitle: string;
    readonly peerCluesSectionTitle: string;
    readonly peerCluesCounter: (current: number, max: number) => string;
    readonly peerCluesLimitNote: (max: number) => string;
    readonly confirmationAccessibilityLabel: string;
    readonly confirmationText: string;
    readonly validationErrorTitle: string;
    readonly continueButton: string;
    readonly continueButtonHint: string;
    readonly backButton: string;
  };
  readonly sharePreview: {
    readonly title: string;
    readonly description: string;
    readonly warningTitle: string;
    readonly warningText: string;
    readonly toggleSectionTitle: string;
    readonly petNameFieldLabel: string;
    readonly petEmojiFieldLabel: string;
    readonly ownerAliasFieldLabel: string;
    readonly languageFieldLabel: string;
    readonly toggleAccessibilityLabel: (
      label: string,
      value: string,
      enabled: boolean
    ) => string;
    readonly toggleStateOn: string;
    readonly toggleStateOff: string;
    readonly validationErrorTitle: string;
    readonly previewTitle: string;
    readonly startButton: string;
    readonly startButtonHint: string;
    readonly backButton: string;
  };
  readonly hostInvite: {
    readonly title: string;
    readonly description: string;
    readonly expiredTitle: string;
    readonly expiredText: string;
    readonly qrAccessibilityLabel: (remainingMinutes: string) => string;
    readonly remainingMinutesTitle: (remainingMinutes: string) => string;
    readonly screenshotRiskNotice: string;
    readonly participantsTitle: (count: number, capacity: number) => string;
    readonly participantYou: string;
    readonly participantGuest: string;
    readonly participantReady: string;
    readonly participantNotReady: string;
    /**
     * Issue 15: 参加者名と Ready 状態を 1 行にまとめる区切り。全角コロン「：」は日本語の
     * 区切り記号であり、英語表示にそのまま使うと "You (Host)：Ready" のように区切り文字
     * だけ和文のままになる。JA/EN で別々の区切り表現を持てるよう関数値にする。
     */
    readonly participantRow: (name: string, status: string) => string;
    readonly waitingForGuest: string;
    readonly markHostReadyButton: (hostIsReady: boolean) => string;
    readonly markHostReadyHint: string;
    readonly proceedToGuestScanButton: string;
    readonly proceedToGuestScanHint: string;
    readonly cancelButton: string;
  };
  readonly qrScan: {
    readonly title: string;
    readonly description: string;
    readonly requestPermissionButton: string;
    readonly recheckPermissionButton: string;
    readonly scanButton: string;
    readonly scanButtonHint: string;
    readonly backToHostInviteButton: string;
    readonly backToProfileButton: string;
    readonly backToProfileHint: string;
  };
  readonly activeLounge: {
    readonly title: string;
    readonly description: string;
    readonly localPassportTitle: string;
    readonly peerPassportTitle: string;
    readonly disposableNoticeTitle: string;
    readonly disposableNoticeText: string;
    readonly beginInteractionButton: string;
    readonly exitButton: string;
    readonly hostEndButton: string;
  };
  readonly ownerQuestion: {
    readonly title: string;
    readonly description: string;
    readonly countdown: (seconds: string) => string;
    readonly noteLabel: string;
    readonly noteAccessibilityLabel: string;
    readonly noteHint: (maxLength: number) => string;
    readonly notePlaceholder: string;
    readonly noteCounter: (current: number, max: number) => string;
    readonly noteInvalidFallback: string;
    readonly answerButton: string;
    readonly answerButtonHint: string;
    readonly noButton: string;
    readonly noButtonHint: string;
    readonly declineButton: string;
    readonly declineButtonHint: string;
    readonly confirmTitle: string;
    readonly confirmText: string;
    readonly confirmNotePrefix: string;
    readonly confirmShareButton: string;
    readonly confirmShareButtonHint: string;
    readonly cancelShareButton: string;
    readonly cancelShareButtonHint: string;
    readonly exitButton: string;
    readonly exitButtonHint: string;
    readonly hostEndButton: string;
    readonly hostEndButtonHint: string;
  };
  readonly outcome: {
    readonly bridgeTitle: string;
    readonly noSignalTitle: string;
    readonly description: string;
    readonly bridgeLabel: string;
    readonly noSignalLabel: string;
    readonly bridgeMaskedMessage: string;
    readonly noSignalMessage: string;
    readonly revealBridgeButton: string;
    readonly maskBridgeButton: string;
    readonly completeButton: string;
    readonly exitButton: string;
    readonly hostEndButton: string;
    readonly sourceLabelCaption: string;
    readonly generatedNoteCaption: string;
  };
  readonly conversationSelfReport: {
    readonly title: string;
    readonly description: string;
    readonly optionalNotice: string;
    readonly storageNotice: string;
    readonly question: string;
    readonly startedConversationButton: string;
    readonly notYetButton: string;
    readonly preferNotToAnswerButton: string;
    readonly skipButton: string;
    readonly answerHint: string;
    readonly declineHint: string;
    readonly skipHint: string;
  };
  readonly destroyedLounge: {
    readonly title: string;
    readonly description: string;
    readonly reasonLabel: string;
    readonly reasons: {
      readonly completed: string;
      readonly 'owner-exit': string;
      readonly 'host-ended': string;
      readonly expired: string;
    };
    readonly restartButton: string;
  };
  readonly backupExport: {
    readonly title: string;
    readonly description: string;
    readonly warningTitle: string;
    readonly warningText: string;
    readonly previewSectionTitle: string;
    readonly byteLength: (bytes: number) => string;
    readonly shareButton: (sharing: boolean) => string;
    readonly shareButtonHint: string;
    readonly openImportButton: string;
    readonly backButton: string;
  };
  readonly backupImport: {
    readonly title: string;
    readonly description: string;
    readonly rawInputLabel: string;
    readonly rawInputAccessibilityLabel: string;
    readonly rawInputHint: (maxBytes: number) => string;
    readonly rawInputPlaceholder: string;
    readonly validateButton: string;
    readonly validateButtonHint: string;
    readonly rejectedTitle: string;
    readonly rejectedUnchangedNotice: string;
    readonly parsedSectionTitle: string;
    readonly conflictQuestion: string;
    readonly keepExistingButton: (selected: boolean) => string;
    readonly keepExistingHint: string;
    readonly useImportedButton: (selected: boolean) => string;
    readonly useImportedHint: string;
    readonly commitButton: (committing: boolean) => string;
    readonly commitButtonHint: string;
    readonly openExportButton: string;
    readonly backButton: string;
  };
  readonly settings: {
    readonly title: string;
    readonly description: string;
    readonly distributionSectionTitle: string;
    readonly distribution: {
      readonly runtime: {
        readonly web: string;
        readonly expoGo: string;
        readonly nativeBuild: string;
      };
      readonly tier: {
        readonly productHypothesis: string;
        readonly undeterminedNative: string;
      };
      readonly runtimeLabel: (runtime: string) => string;
      readonly tierLabel: (tier: string) => string;
      readonly rulesProviderAvailable: string;
      readonly localModelUnavailable: string;
      readonly localModelRequiresSetup: string;
      readonly nearbyTransportUnavailable: string;
    };
    readonly languageSectionTitle: string;
    readonly languageOptionAccessibilityLabel: (
      label: string,
      selected: boolean
    ) => string;
    readonly languageOptionHint: string;
    readonly diagnosticsButton: string;
    readonly diagnosticsButtonHint: string;
    readonly pilotMeasurementButton: string;
    readonly pilotMeasurementButtonHint: string;
    readonly backButton: string;
  };
  readonly pilotMeasurement: {
    readonly title: string;
    readonly description: string;
    readonly memoryOnlyTitle: string;
    readonly memoryOnlyText: string;
    readonly researchConsentTitle: string;
    readonly researchEnabled: string;
    readonly researchDisabled: string;
    readonly enableResearchButton: string;
    readonly disableResearchButton: string;
    readonly belowMinimum: (current: number, minimum: number) => string;
    readonly previewTitle: string;
    readonly byteLength: (bytes: number) => string;
    readonly refreshButton: string;
    readonly shareButton: (sharing: boolean) => string;
    readonly shareError: string;
    readonly backButton: string;
    readonly notice: {
      readonly shared: string;
      readonly dismissed: string;
      readonly saved: string;
    };
  };
  readonly diagnostics: {
    readonly title: string;
    readonly description: string;
    readonly loading: string;
    readonly empty: string;
    readonly reportSectionTitle: string;
    readonly storageSectionTitle: string;
    readonly byteLength: (bytes: number) => string;
    readonly refreshButton: string;
    readonly retryRecoveryButton: string;
    readonly shareButton: (sharing: boolean) => string;
    readonly endLoungeButton: string;
    readonly resetPassportButton: string;
    readonly removeModelButton: string;
    readonly deleteAllButton: string;
    readonly confirmDeleteAllText: (count: number, bytes: number) => string;
    readonly confirmDeleteAllButton: string;
    readonly cancelDeleteAllButton: string;
    readonly backButton: string;
    readonly unavailableActionHint: string;
    readonly notice: {
      readonly shared: string;
      readonly dismissed: string;
      readonly saved: string;
      readonly loungeForgotten: string;
      readonly passportReset: string;
      readonly modelRemoved: string;
      readonly allDeleted: string;
    };
    readonly recovery: DiagnosticRecoveryMessages;
  };
  readonly clueSelector: {
    readonly fieldLabels: {
      readonly topics: string;
      readonly offers: string;
      readonly lookingFor: string;
      readonly goal: string;
    };
    readonly optionAccessibilityLabel: (
      fieldLabel: string,
      clueLabel: string
    ) => string;
  };
  readonly petEmojiSelector: {
    readonly optionAccessibilityLabel: (emoji: string) => string;
  };
  readonly languageSelector: {
    readonly optionAccessibilityLabel: (label: string) => string;
    readonly stateOn: string;
    readonly stateOff: string;
  };
  readonly qrCodeView: {
    readonly accessibilityLabel: (remainingMinutes: string) => string;
  };
  readonly expiryNotice: {
    readonly warning: string;
  };
  readonly interactionStatusNotice: {
    readonly waiting: string;
    readonly discovering: string;
    readonly clarifying: string;
    readonly bridging: string;
    readonly 'no-signal': string;
    readonly retired: string;
  };
  readonly providerStatusNotice: {
    readonly rules: string;
    readonly 'loading-local-model': string;
    readonly 'local-model': string;
    readonly 'falling-back': string;
    readonly failed: string;
  };
  readonly ownerQuestionDisclosure: {
    readonly sharedWithMessage: string;
    readonly deletedWhenMessage: string;
    readonly notSavedToPassportMessage: string;
  };
  readonly cameraPermissionNotice: {
    readonly otherFeaturesRemainAvailable: string;
    readonly notDeterminedTitle: string;
    readonly notDeterminedMessage: string;
    readonly grantedTitle: string;
    readonly grantedMessage: string;
    readonly deniedTitle: string;
    readonly deniedMessage: string;
    readonly revokedTitle: string;
    readonly revokedMessage: string;
    readonly hardwareUnavailableTitle: string;
    readonly hardwareUnavailableMessage: string;
  };
  readonly qrErrorNotice: {
    readonly notPassportQr: string;
    readonly invalidPrefix: string;
    readonly oversizedPayload: string;
    readonly invalidJson: string;
    readonly unknownVersion: string;
    readonly duplicateScan: string;
    readonly invalidClock: string;
    readonly roomExpired: string;
    readonly roomFull: string;
    readonly roomNotForming: string;
    readonly participantNotFound: string;
    readonly invalidParticipantCount: string;
    readonly permissionNotGranted: string;
    readonly nothingToScan: string;
    readonly genericFailure: string;
    /** Issue 15: 元は `PassportApp.tsx` に直書きされていた 2 件の Guest Scan 固有 Error。 */
    readonly notLoungeInviteQr: string;
    readonly unresolvedGuestProfile: string;
  };
  readonly backupNotice: {
    readonly shareSucceeded: string;
    readonly shareDismissed: string;
    readonly shareSavedToFile: (destination: string) => string;
    readonly shareFailedFallback: string;
    readonly importCommittedSucceeded: string;
    readonly importCommitFailedFallback: string;
  };
  readonly profileNotice: {
    readonly readErrorFallback: string;
    readonly saveErrorFallback: string;
  };
}

const ja: AppMessages = {
  common: {
    brand: 'TenkaCloud Passport',
    settingsButton: 'Settings（言語切り替え）',
    settingsButtonHint:
      '表示言語を切り替えます。Lounge の進行状況や同意は失われません。',
    backButton: '戻る',
  },
  profileLoading: {
    title: '端末内の保存状態を確認しています。',
    description:
      '明示保存済みの Local Profile だけを読み込みます。Draft や Lounge の履歴は復元しません。',
    loading: '読込中です。',
  },
  passportApp: {
    initialNotice: 'Pet と会話の材料を入力し、端末内保存を明示してください。',
    emptyOnLoad:
      '保存済み Profile はありません。入力は明示保存するまで復元されません。',
    restoredOnLoad: '明示保存済みの Local Profile だけを復元しました。',
    savedNotice: 'この Local Profile を端末内へ明示保存しました。',
    loungeDiscardedNotice:
      'この Lounge のデータを端末から破棄しました。参加者、共有内容、Invite QR は残っていません。',
    storageDefaultFailure:
      'Storage の処理に失敗しました。もう一度実行してください。',
  },
  passportCreation: {
    title: 'アカウントなしで Pet を準備する。',
    description:
      '入力は明示保存するまで端末へ残りません。氏名、メール、電話、住所、会社名、機密情報は入力しないでください。',
    noticeTitles: {
      empty: '保存済み Profile はありません。',
      restored: 'Local Profile を復元しました。',
      'validation-error': '入力を確認してください。',
      'save-error': '保存に失敗しました。',
      'storage-unavailable': '端末内 Storage を利用できません。',
      'invalid-data': '端末内の保存データが不正です。',
      'read-error': '保存済み Profile を読み込めません。',
      'lounge-discarded': 'この Lounge のデータを端末から破棄しました。',
    },
    petNameLabel: 'Pet Name（必須）',
    petNameAccessibilityLabel: 'Pet Name',
    petNameHint: (maxLength) =>
      `${maxLength} 文字以下の Pet の表示名を入力します。`,
    petNamePlaceholder: '例: こむぎ',
    petNameCounter: (current, max) =>
      `${current} / ${max}。機密情報を入力しないでください。`,
    petEmojiLabel: 'Pet Emoji（6 種類から 1 件）',
    ownerAliasLabel: 'Owner Alias（任意、本名不要）',
    ownerAliasAccessibilityLabel: 'Owner Alias、任意',
    ownerAliasHint: (maxLength) =>
      `${maxLength} 文字以下の呼び名を入力します。空でも保存できます。`,
    ownerAliasPlaceholder: '空のままで構いません',
    ownerAliasCounter: (current, max) =>
      `${current} / ${max}。本名や連絡先を入力しないでください。`,
    cluesSectionTitle: '会話の材料',
    cluesCounter: (current, max) => `${current} / ${max}`,
    cluesLimitNote:
      'Topics 3 件、Offer 3 件、Looking For 3 件、Goal 1 件までです。カタログ外の機密情報は入力できません。',
    languagesSectionTitle: 'Languages（3 件まで）',
    languagesNote:
      '同梱カタログから選びます。機密情報を入力する欄ではありません。',
    saveButton: (saving) =>
      saving ? '端末内に保存中' : 'Local Profile を端末内に明示保存',
    saveButtonHint: '検証済みの Local Profile をこの端末だけに保存します。',
    backupButton: 'Backup（JSON の書き出し・復元）',
    backupButtonHint:
      '端末内の設定を JSON として書き出す、または JSON バックアップから復元します。',
  },
  encounterSetup: {
    title: '相手が公開した手掛かりを受け取る。',
    description:
      '実在する相手がこの場で公開した項目だけを入力します。氏名、連絡先、位置情報、機密情報は入力しないでください。',
    localProfileSummaryLabel: 'この端末の Local Profile',
    localProfileSummaryValue: (petName, clueCount) =>
      `${petName}・候補 ${clueCount} 件`,
    peerPetNameSectionTitle: '相手の Pet Name',
    peerPetNameAccessibilityLabel: '相手の Pet Name',
    peerPetNameHint: (maxLength) =>
      `${maxLength} 文字以下で、相手が公開した Pet Name を入力します。`,
    peerPetNamePlaceholder: '相手が公開した Pet Name',
    peerPetNameCounter: (current, max) =>
      `${current} / ${max}。機密情報を入力しないでください。`,
    peerPetEmojiSectionTitle: '相手の Pet Emoji',
    peerCluesSectionTitle: '相手の公開項目',
    peerCluesCounter: (current, max) => `${current} / ${max}`,
    peerCluesLimitNote: (max) =>
      `カタログから最大 ${max} 件です。自由記述の機密情報は入力できません。`,
    confirmationAccessibilityLabel: '相手が今回公開した内容であることを確認',
    confirmationText: '相手が現在の Lounge で公開した内容だと確認しました。',
    validationErrorTitle: 'Validation Error',
    continueButton: '今回の共有 Preview へ',
    continueButtonHint: '自分が今回共有する項目の最終 Preview へ進みます。',
    backButton: 'Local Profile を編集',
  },
  sharePreview: {
    title: '今回だけ共有する内容を確認する。',
    description:
      'ON の項目だけが同じ Public Passport として QR / Peer Payload に入ります。Local Profile 全体は共有しません。',
    warningTitle: '機密情報を共有しないでください。',
    warningText:
      'Pet Name と会話材料 1 件以上が必須です。その他は項目単位で OFF にできます。',
    toggleSectionTitle: '今回の共有 ON / OFF',
    petNameFieldLabel: 'Pet Name',
    petEmojiFieldLabel: 'Pet Emoji',
    ownerAliasFieldLabel: 'Owner Alias',
    languageFieldLabel: 'Language',
    toggleAccessibilityLabel: (label, value, enabled) =>
      `${label}、${value}、今回の共有 ${enabled ? 'ON' : 'OFF'}`,
    toggleStateOn: 'ON',
    toggleStateOff: 'OFF',
    validationErrorTitle: 'Validation Error',
    previewTitle: 'QR / Peer Payload Preview',
    startButton: 'この Public Passport で Lounge に参加',
    startButtonHint:
      'Preview と同じ Public Passport を投影して Lounge を開始します。',
    backButton: '相手の公開内容へ戻る',
  },
  hostInvite: {
    title: 'Lounge への Invite QR を表示する。',
    description:
      'Invite QR を対面の相手に見せてください。参加者 2 名がそれぞれ Ready になるまで、判定は開始しません。',
    expiredTitle: 'この Lounge の招待は期限切れです。',
    expiredText: 'もう一度、最初から Lounge を作り直してください。',
    qrAccessibilityLabel: (remainingMinutes) =>
      `Invite QR。残り ${remainingMinutes} 分で期限切れになります。`,
    remainingMinutesTitle: (remainingMinutes) =>
      `残り ${remainingMinutes} 分で期限切れになります。`,
    screenshotRiskNotice:
      'Screenshot や画面共有で、この QR が対面以外の相手に見られるリスクがあります。期限内に、対面の相手にだけ見せてください。',
    participantsTitle: (count, capacity) => `参加者 ${count} / ${capacity}`,
    participantYou: 'あなた（Host）',
    participantGuest: 'ゲスト',
    participantReady: 'Ready',
    participantNotReady: '未 Ready',
    participantRow: (name, status) => `${name}：${status}`,
    waitingForGuest: 'ゲストの参加を待っています。',
    markHostReadyButton: (hostIsReady) =>
      hostIsReady ? 'あなたは Ready 済み' : '自分も Ready にする',
    markHostReadyHint:
      'あなた自身の Public Passport 共有を確定し、Ready にします。',
    proceedToGuestScanButton: '同じ端末でゲストとして QR を読み取る',
    proceedToGuestScanHint:
      '単一端末デモ用に、この QR をゲストとして読み取る画面へ切り替えます。',
    cancelButton: 'Lounge をキャンセルする',
  },
  qrScan: {
    title: 'Invite QR を読み取る。',
    description:
      'Host が表示した Invite QR を読み取ります。Camera の利用を拒否しても、Passport の編集や他の機能は引き続き利用できます。',
    requestPermissionButton: 'カメラの利用を許可する',
    recheckPermissionButton: 'Camera 権限を再確認する',
    scanButton: 'QR を読み取る',
    scanButtonHint: 'Host が表示している Invite QR を読み取ります。',
    backToHostInviteButton: 'Host の画面へ戻る',
    backToProfileButton: 'Passport の編集へ戻る',
    backToProfileHint:
      'Camera 権限の状態に関わらず、Passport の編集画面を利用できます。',
  },
  activeLounge: {
    title: '確認済みの手掛かりだけで判定する。',
    description:
      'Local Agent は端末外へ通信せず、共通項目がなければ推測せずに no-signal を返します。必要な場合は Owner へ 1 問だけ確認します。',
    localPassportTitle: 'この端末',
    peerPassportTitle: 'Encounter',
    disposableNoticeTitle: '使い捨て Lounge',
    disposableNoticeText:
      '20 分満了、退出、Host 終了の最早契機で、現在のデータを破棄します。',
    beginInteractionButton: '会話の糸を探す',
    exitButton: '退出して破棄',
    hostEndButton: 'Host として終了',
  },
  ownerQuestion: {
    title: 'Pet があなたに 1 問だけ確認します。',
    description:
      'この Lounge に限って使ってよいかを、あなた自身が決めます。回答しない権利があります。',
    countdown: (seconds) => `残り ${seconds} 秒で自動的に終了します。`,
    noteLabel: 'メモ（任意、相手には送りません）',
    noteAccessibilityLabel: 'Owner Question への任意のメモ',
    noteHint: (maxLength) =>
      `${maxLength} 文字以内。入力しなくても回答できます。`,
    notePlaceholder: '空のままでも回答できます',
    noteCounter: (current, max) => `${current} / ${max}`,
    noteInvalidFallback: 'メモを確認してください。',
    answerButton: '答える',
    answerButtonHint:
      'この手掛かりを今回の Lounge で使ってよいと答えます。最終確認の画面へ進みます。',
    noButton: '分からない',
    noButtonHint: '判断できない場合の回答です。この手掛かりは今回使いません。',
    declineButton: 'パス',
    declineButtonHint: 'この質問には答えません。この手掛かりは今回使いません。',
    confirmTitle: '最終確認',
    confirmText:
      'この手掛かりを今回の Lounge の相手にも見える Bridge として使います。',
    confirmNotePrefix: 'あなたのメモ: ',
    confirmShareButton: '確定して共有する',
    confirmShareButtonHint:
      'この回答を確定し、相手にも見える Bridge の判定に使います。',
    cancelShareButton: 'やめる',
    cancelShareButtonHint: '確定せずに選び直します。',
    exitButton: '退出して破棄',
    exitButtonHint: 'この Lounge から退出し、この端末のデータを破棄します。',
    hostEndButton: 'Host として終了',
    hostEndButtonHint:
      'Host としてこの Lounge を終了し、全参加者のデータを破棄します。',
  },
  outcome: {
    bridgeTitle: '人間の会話へ。',
    noSignalTitle: 'no-signal も正常な結果。',
    description:
      '結果の確定直後に Pet は retired になりました。追加説明、再判定、継続チャットは行いません。',
    bridgeLabel: 'Bridge',
    noSignalLabel: 'no-signal',
    bridgeMaskedMessage:
      'Bridge は mask されています。Owner が確認するときだけ表示してください。',
    noSignalMessage:
      '今回は Bridge を支える確認済みの手掛かりがありません。推測せずに終了します。',
    revealBridgeButton: 'Bridge を表示',
    maskBridgeButton: 'Bridge を隠す',
    completeButton: '結果を閉じて Lounge を破棄',
    exitButton: '退出して破棄',
    hostEndButton: 'Host として終了',
    sourceLabelCaption:
      '原文（お互いが入力した手掛かりそのもの、翻訳していません）',
    generatedNoteCaption:
      'この案内文は端末内で今回生成した補助的な文章です。相手からの原文ではありません。',
  },
  conversationSelfReport: {
    title: '任意の 1 Tap だけ。',
    description:
      'Lounge の内容はすでに破棄しました。この回答で結果の再判定や追加の質問は行いません。',
    optionalNotice: '回答は任意です。答えずに今すぐ終了できます。',
    storageNotice:
      '選択肢の件数だけを Process 内 Memory で集計し、氏名、ID、正確な時刻、内容は保存しません。',
    question:
      '表示された Bridge をきっかけに、相手との口頭会話が始まりましたか。',
    startedConversationButton: '会話が始まった',
    notYetButton: 'まだ',
    preferNotToAnswerButton: '回答しない',
    skipButton: '答えずに今すぐ終了',
    answerHint: 'この選択肢の件数だけを端末内の集計へ加えて終了します。',
    declineHint:
      '回答を拒否した件数だけを加え、会話開始率の分母には含めず終了します。',
    skipHint: '回答の件数を加えず、ただちに終了します。',
  },
  destroyedLounge: {
    title: 'この Lounge のデータを端末から破棄しました。',
    description:
      'Passport、相手の手掛かり、判定入力、Bridge または no-signal は履歴へ保存していません。',
    reasonLabel: '終了理由',
    reasons: {
      completed: '結果画面を閉じました。',
      'owner-exit': 'Owner が退出しました。',
      'host-ended': 'Host が Lounge を終了しました。',
      expired: '開始から 20 分が満了しました。',
    },
    restartButton: '保存済み Profile で新しい Encounter',
  },
  backupExport: {
    title: '端末内の設定を JSON として書き出す。',
    description:
      'Local Passport、Pet 設定、Model 設定のうち秘匿値でないものだけを書き出します。アプリは GitHub API と接続せず、Token を扱いません。',
    warningTitle: 'この JSON は暗号化されません。',
    warningText:
      '保存先の同期・共有範囲・版管理・削除は Owner 自身の責任です。アプリは保存先のファイルを一切追跡しません。',
    previewSectionTitle: 'Export される全項目（Preview）',
    byteLength: (bytes) => `${bytes} bytes`,
    shareButton: (sharing) => (sharing ? '共有中' : 'Share Sheet で共有する'),
    shareButtonHint:
      'Export した JSON を OS の Share Sheet（または Web の場合はファイル保存）で共有します。',
    openImportButton: 'バックアップを復元する（Import）',
    backButton: 'Profile 編集へ戻る',
  },
  backupImport: {
    title: 'JSON バックアップを読み込む。',
    description:
      'Export した JSON を貼り付けてください。GitHub Token など認証情報の入力欄はありません。',
    rawInputLabel: 'バックアップ JSON（貼り付け）',
    rawInputAccessibilityLabel: 'バックアップ JSON',
    rawInputHint: (maxBytes) =>
      `最大 ${maxBytes} byte までの JSON を貼り付けます。`,
    rawInputPlaceholder: '{"backupSchemaVersion": 2, ...}',
    validateButton: '内容を確認する（Preview / Validation）',
    validateButtonHint:
      '貼り付けた JSON を strict schema で検証し、Preview を表示します。',
    rejectedTitle: '読み込めませんでした。',
    rejectedUnchangedNotice: '既存の Local Profile は変更していません。',
    parsedSectionTitle: '読み込む内容（Preview）',
    conflictQuestion: 'すでに Local Profile があります。どちらを使いますか。',
    keepExistingButton: (selected) =>
      selected ? '既存を残す（選択中）' : '既存を残す',
    keepExistingHint:
      '既存の Local Profile をそのまま残し、読み込んだ内容を採用しません。',
    useImportedButton: (selected) =>
      selected
        ? '読み込んだ内容に置き換える（選択中）'
        : '読み込んだ内容に置き換える',
    useImportedHint: '既存の Local Profile を、読み込んだ内容で置き換えます。',
    commitButton: (committing) =>
      committing ? 'Commit 中' : 'この内容を Commit する',
    commitButtonHint:
      '選択した内容を端末内 Storage へ Atomic に Commit します。失敗時は既存の Profile を保ちます。',
    openExportButton: 'Export 画面へ戻る',
    backButton: 'Profile 編集へ戻る',
  },
  settings: {
    title: '設定と現在の配布能力を確認する。',
    description:
      'この実行環境で使える機能を表示します。言語を切り替えても、進行中の Lounge、同意、保存済み Local Profile は失われません。',
    distributionSectionTitle: '現在の配布能力',
    distribution: {
      runtime: {
        web: 'Web',
        expoGo: 'Expo Go',
        nativeBuild: 'Native Build',
      },
      tier: {
        productHypothesis: 'Tier A — Product Hypothesis',
        undeterminedNative: '未判定 — Release 情報で Tier B / C を確認',
      },
      runtimeLabel: (runtime) => `実行環境: ${runtime}`,
      tierLabel: (tier) => `配布 Tier: ${tier}`,
      rulesProviderAvailable: 'Rules Provider: 利用できます。',
      localModelUnavailable: 'Local LLM: この実行環境では利用できません。',
      localModelRequiresSetup: 'Local LLM: GGUF の設定と実機検証が必要です。',
      nearbyTransportUnavailable: 'Nearby Transport: 現在は利用できません。',
    },
    languageSectionTitle: '表示言語',
    languageOptionAccessibilityLabel: (label, selected) =>
      `表示言語 ${label}${selected ? '、選択中' : ''}`,
    languageOptionHint: 'この端末の表示言語をこの言語に切り替えます。',
    diagnosticsButton: '診断と端末内 Data',
    diagnosticsButtonHint:
      'Network 送信なしの診断 Preview と、分離された削除操作を開きます。',
    pilotMeasurementButton: 'Pilot の匿名 Aggregate',
    pilotMeasurementButtonHint:
      'Process 内 Counter の全項目を Preview し、最低集計単位を満たす場合だけ手動共有できます。',
    backButton: '戻る',
  },
  pilotMeasurement: {
    title: '個人を追跡せず Pilot を振り返る。',
    description:
      'Start、Ready、Outcome、Provider、任意回答の件数だけを確認します。自動送信はしません。',
    memoryOnlyTitle: 'この Aggregate は Process 内 Memory だけです。',
    memoryOnlyText:
      'アプリを閉じると消えます。正確な時刻、ID、場所、Passport、Bridge、会話内容は含みません。5 件でも匿名性を保証しません。',
    researchConsentTitle: 'Research Consent は Product Consent と別です。',
    researchEnabled:
      'Research Counter は有効です。同意した参加者の Session だけを開始してください。',
    researchDisabled:
      'Research Counter は無効です。Product は計測なしでそのまま利用できます。',
    enableResearchButton: 'Research Consent 確認後に Counter を有効化',
    disableResearchButton: 'Research Counter を無効化',
    belowMinimum: (current, minimum) =>
      `Outcome は ${current} 件です。${minimum} 件に達するまで Preview JSON と共有を作りません。`,
    previewTitle: '共有前の全項目 Preview',
    byteLength: (bytes) => `${bytes} bytes`,
    refreshButton: '現在の Counter から Preview を更新',
    shareButton: (sharing) =>
      sharing ? '共有中' : 'Preview を Share Sheet で手動共有',
    shareError:
      '共有できませんでした。Aggregate は自動送信せず、この Process の Memory にだけ残っています。',
    backButton: 'Settings へ戻る',
    notice: {
      shared: 'Share Sheet で共有しました。',
      dismissed: '共有を取り消しました。自動再送はしません。',
      saved: 'Owner が選んだ保存先へ保存しました。',
    },
  },
  diagnostics: {
    title: '端末内だけで状態を確認する。',
    description:
      '内容、識別子、Path、Network metadata を含まない Sanitized Report を Preview します。自動送信はしません。',
    loading: '端末内の件数と状態を確認しています。',
    empty: '診断 Preview を作成できませんでした。再読み込みしてください。',
    reportSectionTitle: 'Sanitized Report Preview',
    storageSectionTitle: '削除対象 Preview',
    byteLength: (bytes) => `${bytes} bytes`,
    refreshButton: '現在状態を再読み込み',
    retryRecoveryButton: '中断した全削除を再試行',
    shareButton: (sharing) =>
      sharing ? '共有中' : 'Preview を Share Sheet で共有',
    endLoungeButton: 'End and forget Lounge',
    resetPassportButton: 'Reset Passport',
    removeModelButton: 'Remove Model',
    deleteAllButton: 'Delete all local data',
    confirmDeleteAllText: (count, bytes) =>
      `${count} 件、${bytes} bytes を削除します。中断時は次回起動で再開します。`,
    confirmDeleteAllButton: '確認して全削除を実行',
    cancelDeleteAllButton: '全削除をやめる',
    backButton: 'Settings へ戻る',
    unavailableActionHint: '現在は対象 Data がないため実行できません。',
    notice: {
      shared: 'Sanitized Report を共有しました。',
      dismissed: 'Share Sheet を閉じました。共有していません。',
      saved: 'Sanitized Report をファイルへ保存しました。',
      loungeForgotten: '現在の Lounge Data を端末から破棄しました。',
      passportReset: 'Local Private Profile を削除しました。',
      modelRemoved: 'Local Model を削除しました。',
      allDeleted: 'すべての端末内 Data を削除しました。',
    },
    recovery: {
      TIMEOUT: {
        title: '処理が時間内に完了しませんでした。',
        steps: ['もう一度実行するか Rules Provider を使用してください。'],
      },
      CANCELLED: {
        title: '処理を中止しました。',
        steps: ['必要な場合だけもう一度実行してください。'],
      },
      SCHEMA_ERROR: {
        title: '検証できない形式を拒否しました。',
        steps: ['入力元を確認し、安全な内容で再実行してください。'],
      },
      LOAD_ERROR: {
        title: 'Local Model を読み込めませんでした。',
        steps: ['Model を検証し直すか Remove Model を実行してください。'],
      },
      STORAGE_FAILURE: {
        title: '端末内 Storage を利用できません。',
        steps: ['空き容量と権限を確認して再試行してください。'],
      },
      DELETE_INTERRUPTED: {
        title: '全削除を完了できませんでした。',
        steps: [
          '再試行するかアプリを再起動して削除 Recovery を続けてください。',
        ],
      },
      MODEL_IN_USE: {
        title: 'Local Model を使用中です。',
        steps: ['Model Session を終了してから削除を再試行してください。'],
      },
      PERMISSION_DENIED: {
        title: '必要な権限がありません。',
        steps: ['OS Settings で権限を確認してください。'],
      },
      TRANSPORT_UNAVAILABLE: {
        title: 'Transport を利用できません。',
        steps: [
          '権限と接続状態を確認し、Rules-only Flow はそのまま利用できます。',
        ],
      },
      UNEXPECTED_FAILURE: {
        title: '処理を完了できませんでした。',
        steps: ['内容を共有せず、現在状態を再読み込みして再試行してください。'],
      },
    },
  },
  clueSelector: {
    fieldLabels: {
      topics: 'Topics',
      offers: 'Offer',
      lookingFor: 'Looking For',
      goal: 'Goal',
    },
    optionAccessibilityLabel: (fieldLabel, clueLabel) =>
      `${fieldLabel}、${clueLabel}`,
  },
  petEmojiSelector: {
    optionAccessibilityLabel: (emoji) => `Pet Emoji ${emoji}`,
  },
  languageSelector: {
    optionAccessibilityLabel: (label) => `Language ${label}`,
    stateOn: 'ON',
    stateOff: 'OFF',
  },
  qrCodeView: {
    accessibilityLabel: (remainingMinutes) =>
      `Invite QR。残り ${remainingMinutes} 分で期限切れになります。`,
  },
  expiryNotice: {
    warning:
      'まもなく 20 分の期限です。操作を終えるか、退出して忘れる操作をしてください。',
  },
  interactionStatusNotice: {
    waiting: '出会いを待っています。',
    discovering: '手掛かりを探しています。',
    clarifying: 'Owner に確認しています。',
    bridging: 'Bridge を準備しています。',
    'no-signal': '今回は no-signal です。',
    retired: 'この Lounge での役割を終えました。',
  },
  providerStatusNotice: {
    rules: 'Rules Provider（基準実装）で判定します。',
    'loading-local-model': 'Local Model を端末内で読み込んでいます。',
    'local-model': 'Local Model を端末内だけで使用しています。',
    'falling-back': 'Rules Provider へ安全に切り替えています。',
    failed: '判定を完了できませんでした。',
  },
  ownerQuestionDisclosure: {
    sharedWithMessage:
      '共有先: 「答える」を確定した場合だけ、この Lounge の相手にも Bridge として伝わります。',
    deletedWhenMessage:
      '削除時期: この Lounge が終了した時点で、回答は端末から消えます。',
    notSavedToPassportMessage:
      'Passport への保存: 回答は Passport へ自動保存しません。',
  },
  cameraPermissionNotice: {
    otherFeaturesRemainAvailable:
      'Passport の編集、Backup、Settings はこのまま利用できます。',
    notDeterminedTitle: 'カメラの利用許可が必要です。',
    notDeterminedMessage:
      'QR を読み取るには、カメラへのアクセスを許可してください。',
    grantedTitle: 'カメラを利用できます。',
    grantedMessage: 'QR を読み取ってください。',
    deniedTitle: 'カメラの利用が拒否されています。',
    deniedMessage: 'この端末の設定でカメラの許可を変更できます。',
    revokedTitle: 'カメラの利用が後から無効化されました。',
    revokedMessage: '設定でカメラを再度許可すると QR を読み取れます。',
    hardwareUnavailableTitle: 'この端末にはカメラがありません。',
    hardwareUnavailableMessage: 'QR の読み取りはこの端末で利用できません。',
  },
  qrErrorNotice: {
    notPassportQr: 'これは TenkaCloud Passport の QR ではありません。',
    invalidPrefix: 'QR の形式（Prefix）が正しくありません。',
    oversizedPayload: 'QR の内容量が上限を超えています。',
    invalidJson: 'QR の内容を読み取れませんでした。',
    unknownVersion: 'このアプリが対応していない Version の QR です。',
    duplicateScan:
      '同じ QR を連続して読み取りました。新しく表示された QR を読み取ってください。',
    invalidClock: '端末の時計を確認してください。',
    roomExpired:
      'この Lounge の招待は期限切れです。Host に新しい Invite QR を表示してもらってください。',
    roomFull: 'この Lounge はすでに定員に達しています。',
    roomNotForming: 'この Lounge はすでに開始しているため、参加できません。',
    participantNotFound:
      '参加者情報が見つかりません。もう一度参加し直してください。',
    invalidParticipantCount: 'この Lounge の参加者数が不正です。',
    permissionNotGranted:
      'カメラの利用が許可されていないため QR を読み取れません。',
    nothingToScan:
      '読み取れる QR がありません。Host の画面を確認してください。',
    genericFailure: '読み取りに失敗しました。もう一度実行してください。',
    notLoungeInviteQr:
      'この QR は Lounge Invite ではありません。Host の Invite QR を読み取ってください。',
    unresolvedGuestProfile:
      '相手の公開内容を確認できません。Encounter の入力を見直してください。',
  },
  backupNotice: {
    shareSucceeded: '共有しました。',
    shareDismissed: 'Share Sheet を閉じました。共有は行われていません。',
    shareSavedToFile: (destination) =>
      `ファイルとして保存しました（${destination}）。`,
    shareFailedFallback: 'Share Sheet を開けませんでした。',
    importCommittedSucceeded: 'Import した内容を端末内へ保存しました。',
    importCommitFailedFallback:
      'Import の Commit に失敗したため、既存の Profile を保ちました。',
  },
  profileNotice: {
    readErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
    saveErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
  },
};

const en: AppMessages = {
  common: {
    brand: 'TenkaCloud Passport',
    settingsButton: 'Settings (switch language)',
    settingsButtonHint:
      'Switches the display language. Your Lounge progress and consent are kept.',
    backButton: 'Back',
  },
  profileLoading: {
    title: 'Checking your on-device saved state.',
    description:
      'Only an explicitly saved Local Profile is loaded. Drafts and Lounge history are never restored.',
    loading: 'Loading.',
  },
  passportApp: {
    initialNotice:
      'Enter your Pet and conversation material, then explicitly save on this device.',
    emptyOnLoad:
      'No saved profile yet. Nothing is restored until you explicitly save.',
    restoredOnLoad: 'Restored only the explicitly saved Local Profile.',
    savedNotice: 'Explicitly saved this Local Profile on this device.',
    loungeDiscardedNotice:
      'Discarded this Lounge’s data from this device. No participants, shared content, or Invite QR remain.',
    storageDefaultFailure: 'Storage operation failed. Please try again.',
  },
  passportCreation: {
    title: 'Set up your Pet without an account.',
    description:
      'Nothing is kept on this device until you explicitly save. Do not enter your name, email, phone number, address, company name, or other sensitive information.',
    noticeTitles: {
      empty: 'No saved profile yet.',
      restored: 'Restored your Local Profile.',
      'validation-error': 'Please check your input.',
      'save-error': 'Save failed.',
      'storage-unavailable': 'Local storage is unavailable.',
      'invalid-data': 'The saved data on this device is invalid.',
      'read-error': 'Could not load the saved profile.',
      'lounge-discarded': 'Discarded this Lounge’s data from this device.',
    },
    petNameLabel: 'Pet Name (required)',
    petNameAccessibilityLabel: 'Pet Name',
    petNameHint: (maxLength) =>
      `Enter your Pet's display name, up to ${maxLength} characters.`,
    petNamePlaceholder: 'e.g., Komugi',
    petNameCounter: (current, max) =>
      `${current} / ${max}. Do not enter sensitive information.`,
    petEmojiLabel: 'Pet Emoji (choose 1 of 6)',
    ownerAliasLabel: 'Owner Alias (optional, no real name needed)',
    ownerAliasAccessibilityLabel: 'Owner Alias, optional',
    ownerAliasHint: (maxLength) =>
      `Enter a nickname, up to ${maxLength} characters. You can save this blank.`,
    ownerAliasPlaceholder: "It's fine to leave this blank",
    ownerAliasCounter: (current, max) =>
      `${current} / ${max}. Do not enter your real name or contact details.`,
    cluesSectionTitle: 'Conversation material',
    cluesCounter: (current, max) => `${current} / ${max}`,
    cluesLimitNote:
      'Up to 3 Topics, 3 Offer, 3 Looking For, and 1 Goal. You cannot enter sensitive information outside the catalog.',
    languagesSectionTitle: 'Languages (up to 3)',
    languagesNote:
      'Choose from the bundled catalog. This is not a field for sensitive information.',
    saveButton: (saving) =>
      saving
        ? 'Saving to this device'
        : 'Explicitly save this Local Profile on this device',
    saveButtonHint: 'Saves a validated Local Profile only on this device.',
    backupButton: 'Backup (export / restore JSON)',
    backupButtonHint:
      'Export your on-device settings as JSON, or restore from a JSON backup.',
  },
  encounterSetup: {
    title: 'Take in what the other side has published.',
    description:
      'Enter only what the real person in front of you has published right now. Do not enter names, contact details, location, or other sensitive information.',
    localProfileSummaryLabel: 'This device’s Local Profile',
    localProfileSummaryValue: (petName, clueCount) =>
      `${petName} · ${clueCount} candidate clue(s)`,
    peerPetNameSectionTitle: 'Their Pet Name',
    peerPetNameAccessibilityLabel: 'Their Pet Name',
    peerPetNameHint: (maxLength) =>
      `Enter the Pet Name they published, up to ${maxLength} characters.`,
    peerPetNamePlaceholder: 'The Pet Name they published',
    peerPetNameCounter: (current, max) =>
      `${current} / ${max}. Do not enter sensitive information.`,
    peerPetEmojiSectionTitle: 'Their Pet Emoji',
    peerCluesSectionTitle: 'What they published',
    peerCluesCounter: (current, max) => `${current} / ${max}`,
    peerCluesLimitNote: (max) =>
      `Up to ${max} items from the catalog. Free-text sensitive information cannot be entered.`,
    confirmationAccessibilityLabel:
      'Confirm this is what they published for this Lounge',
    confirmationText:
      'I confirmed this is what they published in the current Lounge.',
    validationErrorTitle: 'Validation Error',
    continueButton: 'Go to this Lounge’s Share Preview',
    continueButtonHint:
      'Proceeds to the final preview of what you will share this time.',
    backButton: 'Edit Local Profile',
  },
  sharePreview: {
    title: 'Confirm what you will share this time.',
    description:
      'Only items set to ON go into the same Public Passport carried by the QR / Peer Payload. Your entire Local Profile is never shared.',
    warningTitle: 'Do not share sensitive information.',
    warningText:
      'Pet Name and at least one conversation clue are required. Everything else can be turned OFF individually.',
    toggleSectionTitle: 'Share ON / OFF for this Lounge',
    petNameFieldLabel: 'Pet Name',
    petEmojiFieldLabel: 'Pet Emoji',
    ownerAliasFieldLabel: 'Owner Alias',
    languageFieldLabel: 'Language',
    toggleAccessibilityLabel: (label, value, enabled) =>
      `${label}, ${value}, share this time ${enabled ? 'ON' : 'OFF'}`,
    toggleStateOn: 'ON',
    toggleStateOff: 'OFF',
    validationErrorTitle: 'Validation Error',
    previewTitle: 'QR / Peer Payload Preview',
    startButton: 'Join the Lounge with this Public Passport',
    startButtonHint:
      'Starts the Lounge, projecting the same Public Passport shown above.',
    backButton: 'Back to what they published',
  },
  hostInvite: {
    title: 'Show the Invite QR for this Lounge.',
    description:
      'Show the Invite QR to the person in front of you. Judging does not start until both of the 2 participants are Ready.',
    expiredTitle: 'This Lounge’s invitation has expired.',
    expiredText: 'Please start a new Lounge from the beginning.',
    qrAccessibilityLabel: (remainingMinutes) =>
      `Invite QR. Expires in ${remainingMinutes} minute(s).`,
    remainingMinutesTitle: (remainingMinutes) =>
      `Expires in ${remainingMinutes} minute(s).`,
    screenshotRiskNotice:
      'A screenshot or screen share could expose this QR to someone who is not in front of you. Show it only to the person in front of you, within the time limit.',
    participantsTitle: (count, capacity) =>
      `Participants ${count} / ${capacity}`,
    participantYou: 'You (Host)',
    participantGuest: 'Guest',
    participantReady: 'Ready',
    participantNotReady: 'Not Ready',
    participantRow: (name, status) => `${name}: ${status}`,
    waitingForGuest: 'Waiting for a guest to join.',
    markHostReadyButton: (hostIsReady) =>
      hostIsReady ? 'You are already Ready' : 'Mark yourself Ready',
    markHostReadyHint:
      'Confirms your own Public Passport share and marks you Ready.',
    proceedToGuestScanButton: 'Scan as guest on this same device',
    proceedToGuestScanHint:
      'For the single-device demo, switches to a screen that scans this QR as the guest.',
    cancelButton: 'Cancel this Lounge',
  },
  qrScan: {
    title: 'Scan the Invite QR.',
    description:
      'Scans the Invite QR shown by the Host. Even if you decline camera access, editing your Passport and other features remain available.',
    requestPermissionButton: 'Allow camera access',
    recheckPermissionButton: 'Recheck camera permission',
    scanButton: 'Scan QR',
    scanButtonHint: 'Scans the Invite QR the Host is showing.',
    backToHostInviteButton: 'Back to the Host’s screen',
    backToProfileButton: 'Back to editing Passport',
    backToProfileHint:
      'You can use the Passport editing screen regardless of camera permission state.',
  },
  activeLounge: {
    title: 'Judge using confirmed clues only.',
    description:
      'The Local Agent never communicates off-device. Without a common item, it returns no-signal instead of guessing. When needed, it asks the Owner exactly one question.',
    localPassportTitle: 'This device',
    peerPassportTitle: 'Encounter',
    disposableNoticeTitle: 'Disposable Lounge',
    disposableNoticeText:
      'The current data is discarded at the earliest of: 20-minute expiry, exit, or Host ending the Lounge.',
    beginInteractionButton: 'Look for a conversation thread',
    exitButton: 'Exit and discard',
    hostEndButton: 'End as Host',
  },
  ownerQuestion: {
    title: 'Your Pet has exactly one question for you.',
    description:
      'You decide for yourself whether this may be used for this Lounge only. You have the right not to answer.',
    countdown: (seconds) => `Ends automatically in ${seconds} second(s).`,
    noteLabel: 'Note (optional, never sent to the other side)',
    noteAccessibilityLabel: 'Optional note for the Owner Question',
    noteHint: (maxLength) =>
      `Up to ${maxLength} characters. You can answer without entering anything.`,
    notePlaceholder: 'You can answer with this left blank',
    noteCounter: (current, max) => `${current} / ${max}`,
    noteInvalidFallback: 'Please check your note.',
    answerButton: 'Answer',
    answerButtonHint:
      'Answers that this clue may be used in this Lounge. Proceeds to a final confirmation screen.',
    noButton: "I don't know",
    noButtonHint:
      'Use this when you cannot decide. This clue will not be used this time.',
    declineButton: 'Pass',
    declineButtonHint:
      'Declines to answer. This clue will not be used this time.',
    confirmTitle: 'Final confirmation',
    confirmText:
      'This clue will be used as a Bridge visible to the other side of this Lounge.',
    confirmNotePrefix: 'Your note: ',
    confirmShareButton: 'Confirm and share',
    confirmShareButtonHint:
      'Confirms this answer and uses it in the Bridge judgment visible to the other side.',
    cancelShareButton: 'Cancel',
    cancelShareButtonHint: 'Goes back to choose again without confirming.',
    exitButton: 'Exit and discard',
    exitButtonHint: 'Exits this Lounge and discards this device’s data.',
    hostEndButton: 'End as Host',
    hostEndButtonHint:
      'Ends this Lounge as Host and discards every participant’s data.',
  },
  outcome: {
    bridgeTitle: 'On to a human conversation.',
    noSignalTitle: 'no-signal is a normal result too.',
    description:
      'Your Pet became retired the moment the result was decided. No further explanation, re-judging, or continued chat follows.',
    bridgeLabel: 'Bridge',
    noSignalLabel: 'no-signal',
    bridgeMaskedMessage:
      'The Bridge is masked. Reveal it only when the Owner checks it.',
    noSignalMessage:
      'There was no confirmed clue to support a Bridge this time. Ending without guessing.',
    revealBridgeButton: 'Reveal Bridge',
    maskBridgeButton: 'Hide Bridge',
    completeButton: 'Close the result and discard the Lounge',
    exitButton: 'Exit and discard',
    hostEndButton: 'End as Host',
    sourceLabelCaption:
      'Original text (the exact clue both sides entered, not translated)',
    generatedNoteCaption:
      'This note was generated on this device just now, as a supplementary explanation. It is not original text from the other side.',
  },
  conversationSelfReport: {
    title: 'One optional tap.',
    description:
      'The Lounge content has already been discarded. This answer never re-judges the result or starts another question.',
    optionalNotice:
      'Answering is optional. You can finish now without answering.',
    storageNotice:
      'Only option counts are aggregated in process memory. No name, ID, exact time, or content is saved.',
    question:
      'Did the displayed Bridge prompt a spoken conversation with the other person to begin?',
    startedConversationButton: 'Conversation started',
    notYetButton: 'Not yet',
    preferNotToAnswerButton: 'Prefer not to answer',
    skipButton: 'Finish now without answering',
    answerHint:
      'Adds only this option count to the on-device aggregate and finishes.',
    declineHint:
      'Counts an explicit refusal, excludes it from the conversation-start denominator, and finishes.',
    skipHint: 'Finishes immediately without adding an answer count.',
  },
  destroyedLounge: {
    title: 'Discarded this Lounge’s data from this device.',
    description:
      'The Passport, the other side’s clues, judgment inputs, and the Bridge or no-signal result are never saved to history.',
    reasonLabel: 'Reason it ended',
    reasons: {
      completed: 'You closed the result screen.',
      'owner-exit': 'The Owner exited.',
      'host-ended': 'The Host ended the Lounge.',
      expired: '20 minutes elapsed since it started.',
    },
    restartButton: 'Start a new Encounter with your saved profile',
  },
  backupExport: {
    title: 'Export your on-device settings as JSON.',
    description:
      'Exports only the non-sensitive parts of your Local Passport, Pet settings, and Model settings. The app never connects to the GitHub API and never handles a Token.',
    warningTitle: 'This JSON is not encrypted.',
    warningText:
      'Sync, sharing scope, versioning, and deletion of the destination are the Owner’s own responsibility. The app never tracks the destination file.',
    previewSectionTitle: 'Every item to be exported (Preview)',
    byteLength: (bytes) => `${bytes} bytes`,
    shareButton: (sharing) => (sharing ? 'Sharing' : 'Share via Share Sheet'),
    shareButtonHint:
      'Shares the exported JSON via the OS Share Sheet (or a file save on Web).',
    openImportButton: 'Restore a backup (Import)',
    backButton: 'Back to editing Profile',
  },
  backupImport: {
    title: 'Load a JSON backup.',
    description:
      'Paste the exported JSON here. There is no field for a GitHub Token or any other credential.',
    rawInputLabel: 'Backup JSON (paste)',
    rawInputAccessibilityLabel: 'Backup JSON',
    rawInputHint: (maxBytes) => `Paste JSON up to ${maxBytes} bytes.`,
    rawInputPlaceholder: '{"backupSchemaVersion": 2, ...}',
    validateButton: 'Check the content (Preview / Validation)',
    validateButtonHint:
      'Validates the pasted JSON against the strict schema and shows a Preview.',
    rejectedTitle: 'Could not load this backup.',
    rejectedUnchangedNotice:
      'Your existing Local Profile has not been changed.',
    parsedSectionTitle: 'What will be loaded (Preview)',
    conflictQuestion:
      'A Local Profile already exists on this device. Which should be used?',
    keepExistingButton: (selected) =>
      selected ? 'Keep existing (selected)' : 'Keep existing',
    keepExistingHint:
      'Keeps the existing Local Profile as-is and does not adopt the loaded content.',
    useImportedButton: (selected) =>
      selected
        ? 'Replace with loaded content (selected)'
        : 'Replace with loaded content',
    useImportedHint:
      'Replaces the existing Local Profile with the loaded content.',
    commitButton: (committing) =>
      committing ? 'Committing' : 'Commit this content',
    commitButtonHint:
      'Atomically commits the selected content to on-device storage. Keeps the existing Profile if this fails.',
    openExportButton: 'Back to the Export screen',
    backButton: 'Back to editing Profile',
  },
  settings: {
    title: 'Review settings and current distribution capabilities.',
    description:
      'Shows what this runtime can use. Switching languages never loses an in-progress Lounge, consent, or your saved Local Profile.',
    distributionSectionTitle: 'Current distribution capabilities',
    distribution: {
      runtime: {
        web: 'Web',
        expoGo: 'Expo Go',
        nativeBuild: 'Native Build',
      },
      tier: {
        productHypothesis: 'Tier A — Product Hypothesis',
        undeterminedNative:
          'Undetermined — check release metadata for Tier B / C',
      },
      runtimeLabel: (runtime) => `Runtime: ${runtime}`,
      tierLabel: (tier) => `Distribution tier: ${tier}`,
      rulesProviderAvailable: 'Rules Provider: available.',
      localModelUnavailable: 'Local LLM: not available in this runtime.',
      localModelRequiresSetup:
        'Local LLM: requires GGUF setup and physical-device verification.',
      nearbyTransportUnavailable:
        'Nearby Transport: not available in the current build.',
    },
    languageSectionTitle: 'Display language',
    languageOptionAccessibilityLabel: (label, selected) =>
      `Display language ${label}${selected ? ', selected' : ''}`,
    languageOptionHint: 'Switches this device’s display language to this one.',
    diagnosticsButton: 'Diagnostics and local data',
    diagnosticsButtonHint:
      'Opens an on-device diagnostic Preview and separate deletion actions.',
    pilotMeasurementButton: 'Anonymous Pilot aggregate',
    pilotMeasurementButtonHint:
      'Previews every in-process counter and permits manual sharing only after the minimum aggregation unit.',
    backButton: 'Back',
  },
  pilotMeasurement: {
    title: 'Review the Pilot without tracking people.',
    description:
      'Checks only counts for Start, Ready, Outcome, Provider, and optional answers. Nothing is sent automatically.',
    memoryOnlyTitle: 'This aggregate exists only in process memory.',
    memoryOnlyText:
      'It disappears when the app closes. It contains no exact time, ID, location, Passport, Bridge, or conversation content. Five outcomes do not guarantee anonymity.',
    researchConsentTitle: 'Research consent is separate from Product consent.',
    researchEnabled:
      'Research counters are enabled. Start only sessions whose participants consented to research.',
    researchDisabled:
      'Research counters are disabled. The Product remains fully usable without measurement.',
    enableResearchButton: 'Enable counters after research consent',
    disableResearchButton: 'Disable research counters',
    belowMinimum: (current, minimum) =>
      `${current} outcomes are available. Preview JSON and sharing stay unavailable until ${minimum}.`,
    previewTitle: 'Every field before sharing',
    byteLength: (bytes) => `${bytes} bytes`,
    refreshButton: 'Refresh Preview from current counters',
    shareButton: (sharing) =>
      sharing ? 'Sharing' : 'Manually share Preview via Share Sheet',
    shareError:
      'Sharing failed. Nothing was sent automatically; the aggregate remains only in this process memory.',
    backButton: 'Back to Settings',
    notice: {
      shared: 'Shared through the Share Sheet.',
      dismissed: 'Sharing was dismissed. It will not retry automatically.',
      saved: 'Saved to the destination selected by the Owner.',
    },
  },
  diagnostics: {
    title: 'Check status only on this device.',
    description:
      'Previews a Sanitized Report without content, identifiers, paths, or network metadata. Nothing is sent automatically.',
    loading: 'Checking on-device counts and status.',
    empty: 'Could not create a diagnostic Preview. Refresh and try again.',
    reportSectionTitle: 'Sanitized Report Preview',
    storageSectionTitle: 'Deletion target Preview',
    byteLength: (bytes) => `${bytes} bytes`,
    refreshButton: 'Refresh current status',
    retryRecoveryButton: 'Retry interrupted deletion',
    shareButton: (sharing) =>
      sharing ? 'Sharing' : 'Share Preview via Share Sheet',
    endLoungeButton: 'End and forget Lounge',
    resetPassportButton: 'Reset Passport',
    removeModelButton: 'Remove Model',
    deleteAllButton: 'Delete all local data',
    confirmDeleteAllText: (count, bytes) =>
      `Delete ${count} item(s), ${bytes} bytes. An interrupted deletion resumes at next launch.`,
    confirmDeleteAllButton: 'Confirm and delete all',
    cancelDeleteAllButton: 'Cancel full deletion',
    backButton: 'Back to Settings',
    unavailableActionHint: 'There is no matching data to remove right now.',
    notice: {
      shared: 'Shared the Sanitized Report.',
      dismissed: 'Closed the Share Sheet. Nothing was shared.',
      saved: 'Saved the Sanitized Report to a file.',
      loungeForgotten: 'Discarded the current Lounge data from this device.',
      passportReset: 'Deleted the Local Private Profile.',
      modelRemoved: 'Deleted the Local Model.',
      allDeleted: 'Deleted all local data.',
    },
    recovery: {
      TIMEOUT: {
        title: 'The operation did not finish in time.',
        steps: ['Try again or use the Rules Provider.'],
      },
      CANCELLED: {
        title: 'The operation was cancelled.',
        steps: ['Run it again only if it is still needed.'],
      },
      SCHEMA_ERROR: {
        title: 'Rejected a format that could not be verified.',
        steps: ['Check the source and retry with safe content.'],
      },
      LOAD_ERROR: {
        title: 'Could not load the Local Model.',
        steps: ['Verify the Model again or use Remove Model.'],
      },
      STORAGE_FAILURE: {
        title: 'On-device storage is unavailable.',
        steps: ['Check free space and permissions, then retry.'],
      },
      DELETE_INTERRUPTED: {
        title: 'Could not complete full deletion.',
        steps: ['Retry or restart the app to resume deletion recovery.'],
      },
      MODEL_IN_USE: {
        title: 'The Local Model is in use.',
        steps: ['End the Model Session, then retry deletion.'],
      },
      PERMISSION_DENIED: {
        title: 'A required permission is missing.',
        steps: ['Check the permission in OS Settings.'],
      },
      TRANSPORT_UNAVAILABLE: {
        title: 'Transport is unavailable.',
        steps: [
          'Check permissions and connectivity. The Rules-only Flow remains available.',
        ],
      },
      UNEXPECTED_FAILURE: {
        title: 'Could not complete the operation.',
        steps: ['Do not share content; refresh the current status and retry.'],
      },
    },
  },
  clueSelector: {
    fieldLabels: {
      topics: 'Topics',
      offers: 'Offer',
      lookingFor: 'Looking For',
      goal: 'Goal',
    },
    optionAccessibilityLabel: (fieldLabel, clueLabel) =>
      `${fieldLabel}, ${clueLabel}`,
  },
  petEmojiSelector: {
    optionAccessibilityLabel: (emoji) => `Pet Emoji ${emoji}`,
  },
  languageSelector: {
    optionAccessibilityLabel: (label) => `Language ${label}`,
    stateOn: 'ON',
    stateOff: 'OFF',
  },
  qrCodeView: {
    accessibilityLabel: (remainingMinutes) =>
      `Invite QR. Expires in ${remainingMinutes} minute(s).`,
  },
  expiryNotice: {
    warning:
      'The 20-minute limit is almost up. Finish what you are doing, or exit and discard.',
  },
  interactionStatusNotice: {
    waiting: 'Waiting for an encounter.',
    discovering: 'Looking for clues.',
    clarifying: 'Checking with the Owner.',
    bridging: 'Preparing the Bridge.',
    'no-signal': 'This time it is no-signal.',
    retired: 'Finished this role in this Lounge.',
  },
  providerStatusNotice: {
    rules: 'Using the Rules Provider (baseline implementation).',
    'loading-local-model': 'Loading the Local Model on this device.',
    'local-model': 'Using the Local Model only on this device.',
    'falling-back': 'Safely switching to the Rules Provider.',
    failed: 'Could not complete the judgment.',
  },
  ownerQuestionDisclosure: {
    sharedWithMessage:
      'Shared with: only if you confirm “Answer” does it reach the other side of this Lounge, as a Bridge.',
    deletedWhenMessage:
      'Deleted when: your answer disappears from this device once this Lounge ends.',
    notSavedToPassportMessage:
      'Saved to Passport: your answer is never auto-saved to your Passport.',
  },
  cameraPermissionNotice: {
    otherFeaturesRemainAvailable:
      'Editing your Passport, Backup, and Settings remain available.',
    notDeterminedTitle: 'Camera access is needed.',
    notDeterminedMessage: 'Allow camera access to scan a QR.',
    grantedTitle: 'Camera access is available.',
    grantedMessage: 'Please scan the QR.',
    deniedTitle: 'Camera access is denied.',
    deniedMessage:
      'You can change the camera permission in this device’s settings.',
    revokedTitle: 'Camera access was later disabled.',
    revokedMessage: 'Re-allow the camera in settings to scan a QR.',
    hardwareUnavailableTitle: 'This device has no camera.',
    hardwareUnavailableMessage: 'Scanning a QR is unavailable on this device.',
  },
  qrErrorNotice: {
    notPassportQr: 'This is not a TenkaCloud Passport QR.',
    invalidPrefix: 'The QR format (prefix) is not valid.',
    oversizedPayload: 'The QR content exceeds the size limit.',
    invalidJson: 'Could not read the QR content.',
    unknownVersion: 'This app does not support this QR’s Version.',
    duplicateScan:
      'You scanned the same QR again. Scan the newly shown QR instead.',
    invalidClock: 'Please check this device’s clock.',
    roomExpired:
      'This Lounge’s invitation has expired. Ask the Host to show a new Invite QR.',
    roomFull: 'This Lounge has already reached its capacity.',
    roomNotForming: 'This Lounge has already started, so you cannot join.',
    participantNotFound:
      'Could not find your participant record. Please join again.',
    invalidParticipantCount: 'This Lounge’s participant count is invalid.',
    permissionNotGranted:
      'Camera access is not granted, so the QR cannot be scanned.',
    nothingToScan: 'There is no QR to scan. Please check the Host’s screen.',
    genericFailure: 'The scan failed. Please try again.',
    notLoungeInviteQr:
      'This QR is not a Lounge Invite. Scan the Host’s Invite QR instead.',
    unresolvedGuestProfile:
      'Could not confirm what they published. Please review the Encounter input.',
  },
  backupNotice: {
    shareSucceeded: 'Shared.',
    shareDismissed: 'Closed the Share Sheet. Nothing was shared.',
    shareSavedToFile: (destination) => `Saved as a file (${destination}).`,
    shareFailedFallback: 'Could not open the Share Sheet.',
    importCommittedSucceeded: 'Saved the imported content on this device.',
    importCommitFailedFallback:
      'The import commit failed, so the existing Profile was kept.',
  },
  profileNotice: {
    readErrorFallback: 'Storage operation failed. Please try again.',
    saveErrorFallback: 'Storage operation failed. Please try again.',
  },
};

export const MESSAGES: Record<Locale, AppMessages> = { ja, en };
