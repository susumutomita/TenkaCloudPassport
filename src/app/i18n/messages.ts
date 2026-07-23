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

/** Issue 79: `src/app/intro-card-notice.ts` の `IntroCardNotice['kind']` に対応する。 */
export interface IntroCardNoticeTitles {
  readonly empty: string;
  readonly saved: string;
  readonly 'validation-error': string;
  readonly 'save-error': string;
  readonly 'delete-error': string;
  readonly 'storage-unavailable': string;
  readonly 'invalid-data': string;
  readonly 'read-error': string;
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
    /** Issue 118: 自己紹介カード系画面のヘッダーに常設する言語切替トグルの文言。 */
    readonly localeToggleAccessibilityLabel: (
      currentLabel: string,
      nextLabel: string
    ) => string;
    readonly localeToggleHint: string;
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
  readonly settings: {
    readonly title: string;
    readonly description: string;
    readonly languageSectionTitle: string;
    readonly languageOptionAccessibilityLabel: (
      label: string,
      selected: boolean
    ) => string;
    readonly languageOptionHint: string;
    readonly modelSectionTitle: string;
    readonly modelDescription: string;
    readonly modelBusy: string;
    /**
     * Follow-up F-FDRGS4: Document Picker を知らない通常ユーザー向けの
     * 「オンデバイス AI を有効化」導線。Qwen2.5-1.5B の信頼済みダウンロードを
     * 起動し、既存 GGUF import/activate へ合流する。
     */
    readonly onDeviceAiSectionTitle: string;
    readonly onDeviceAiDescription: (
      displayName: string,
      size: string
    ) => string;
    readonly onDeviceAiEnableButton: string;
    readonly onDeviceAiEnableButtonHint: string;
    readonly onDeviceAiConsentTitle: string;
    readonly onDeviceAiConsentBody: (
      displayName: string,
      size: string,
      license: string
    ) => string;
    readonly onDeviceAiConsentStartButton: string;
    readonly onDeviceAiConsentCancelButton: string;
    readonly onDeviceAiDownloadStatus: (
      downloaded: string,
      total: string,
      percent: number
    ) => string;
    readonly onDeviceAiDownloadCancelButton: string;
    /**
     * code-reviewer 指摘（Cancel の実効性）: ダウンロード完了後の import・
     * activate は中止できないため、その区間専用の文言を用意し Cancel 導線は
     * 出さない。
     */
    readonly onDeviceAiFinalizingStatus: string;
    readonly onDeviceAiActiveStatus: string;
    readonly onDeviceAiImportedNotActiveStatus: string;
    readonly onDeviceAiRemoveButton: string;
    readonly selectModelButton: string;
    readonly selectModelHint: string;
    readonly candidateSummary: (name: string, size: string) => string;
    readonly candidateAvailableStorage: (size: string) => string;
    readonly candidateWarning: string;
    readonly confirmImportButton: string;
    readonly cancelImportButton: string;
    readonly cancelRunningImportButton: string;
    readonly importedModelSummary: (
      name: string,
      size: string,
      architecture: string,
      risk: string,
      active: boolean
    ) => string;
    readonly riskSupported: string;
    readonly riskCaution: string;
    readonly riskBlocked: string;
    readonly riskBasis: (
      estimatedMemory: string,
      effectiveMemory: string,
      ratio: string,
      reasons: string
    ) => string;
    readonly riskMemoryUnavailable: string;
    readonly riskReasonMemoryUnavailable: string;
    readonly riskReasonSupported: string;
    readonly riskReasonCaution: string;
    readonly riskReasonBlocked: string;
    readonly riskReasonThermal: string;
    readonly activateModelButton: string;
    readonly reassessBlockedModelButton: string;
    readonly unloadModelButton: string;
    readonly deleteModelButton: string;
    readonly providerOperationTitle: string;
    readonly providerOperationDescription: string;
    readonly confirmProviderOperationButton: string;
    readonly cancelProviderOperationButton: string;
    readonly cautionTitle: string;
    readonly cautionDescription: string;
    readonly confirmCautionButton: string;
    readonly blockedDescription: string;
    readonly benchmarkSummary: (
      count: number,
      importMs: number | null,
      loadMs: number | null,
      firstTokenMs: number | null,
      completionMs: number | null,
      peakMemory: string,
      thermalBefore: string,
      thermalAfter: string,
      batteryDeltaPermille: number | null,
      outcome: string
    ) => string;
    readonly modelError: (code: string) => string;
    readonly diagnosticsButton: string;
    readonly diagnosticsButtonHint: string;
    readonly pilotMeasurementButton: string;
    readonly pilotMeasurementButtonHint: string;
    /** Issue 110: クラウド基礎クイズ画面（`QuizScreen.tsx`）を開く導線。 */
    readonly quizButton: string;
    readonly quizButtonHint: string;
    /** Issue 104 / ADR-0036: 端末内会話エージェント画面を開く導線。 */
    readonly conversationAgentButton: string;
    readonly conversationAgentButtonHint: string;
    /**
     * major（Issue 104 PR #132、Codex 指摘）: 自己紹介カード未作成時は入口を
     * disabled にし、理由を案内する（無効な導線を有効に見せない）。
     */
    readonly conversationAgentButtonDisabledHint: string;
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
    /**
     * Issue 79: 自己紹介カード（Intro Card）は独立した Storage であり、この
     * 「全削除」の対象（`count` / `bytes`）に含まれない。誤解を避けるため、対象一覧の
     * すぐ下に明示する。
     */
    readonly introCardExcludedNotice: string;
    /**
     * Issue 130（Codex 指摘 blocker）: クイズ進捗（Issue 110）は Intro Card と異なり
     * 対象に含まれることを明示する（F-167000: 進捗が「全データ削除」後も残り続けた
     * 不整合の解消）。Intro Card 除外の開示と対になる、対象一覧のすぐ下に置く。
     */
    readonly quizIncludedNotice: string;
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
  readonly profileNotice: {
    readonly readErrorFallback: string;
    readonly saveErrorFallback: string;
  };
  /** Issue 79: 自己紹介カードピボット Step 1 の編集画面・表示画面が共有する文言。 */
  readonly introCard: {
    readonly editEyebrow: string;
    readonly editTitle: string;
    readonly editDescription: string;
    readonly initialNotice: string;
    readonly noticeTitles: IntroCardNoticeTitles;
    readonly readErrorFallback: string;
    readonly saveErrorFallback: string;
    readonly deleteErrorFallback: string;
    readonly nameLabel: string;
    readonly nameAccessibilityLabel: string;
    readonly nameHint: (maxLength: number) => string;
    readonly namePlaceholder: string;
    readonly nameCounter: (current: number, max: number) => string;
    readonly previewNamePlaceholder: string;
    readonly optionalSectionShowLabel: string;
    readonly optionalSectionShowHint: string;
    readonly optionalSectionHideLabel: string;
    readonly optionalSectionHideHint: string;
    readonly titleLabel: string;
    readonly titlePlaceholder: string;
    readonly titleCounter: (current: number, max: number) => string;
    readonly organizationLabel: string;
    readonly organizationPlaceholder: string;
    readonly organizationCounter: (current: number, max: number) => string;
    readonly selfIntroLabel: string;
    readonly selfIntroHint: string;
    readonly selfIntroPlaceholder: string;
    readonly selfIntroCounter: (current: number, max: number) => string;
    readonly emailLabel: string;
    readonly emailPlaceholder: string;
    readonly phoneLabel: string;
    readonly phonePlaceholder: string;
    readonly linksLabel: string;
    readonly linksHint: string;
    readonly linksCounter: (current: number, max: number) => string;
    readonly linkXLabel: string;
    readonly linkXPlaceholder: string;
    readonly linkGithubLabel: string;
    readonly linkGithubPlaceholder: string;
    readonly linkLinkedinLabel: string;
    readonly linkLinkedinPlaceholder: string;
    readonly linkPortfolioLabel: string;
    readonly linkPortfolioPlaceholder: string;
    readonly otherLinkPlaceholder: string;
    readonly addLinkButton: string;
    readonly addLinkButtonHint: string;
    readonly removeLinkButtonLabel: (index: number) => string;
    /**
     * Issue 104 / ADR-0036: 端末内会話エージェントが使う会話テーマの選択欄
     * （`ClueSelector` を再利用、`clueSelector` 名前空間のラベルとは別に
     * この欄固有の見出し・件数表示だけをここで持つ）。
     */
    readonly themeIdsLabel: string;
    readonly themeIdsHint: string;
    readonly themeIdsCounter: (current: number, max: number) => string;
    readonly byteUsageLabel: (current: number, max: number) => string;
    readonly byteUsageOverBudget: (current: number, max: number) => string;
    readonly saveButton: (saving: boolean) => string;
    readonly saveButtonHint: string;
    readonly cardEyebrow: string;
    readonly cardTitle: string;
    readonly cardDescription: string;
    readonly qrAccessibilityLabel: string;
    readonly qrExplanation: string;
    /**
     * Issue 130（Codex 指摘 minor）: QR byte 予算超過でクイズ進捗ビットマスク（`q`）が
     * best-effort で黙って省略された場合だけ表示する非ブロッキング通知。カード本体の
     * 表示自体は妨げない。
     */
    readonly quizProgressOmittedNotice: string;
    readonly editButton: string;
    readonly editButtonHint: string;
    readonly deleteButton: string;
    readonly deleteButtonHint: string;
    /**
     * Issue 130: #127 が Intro Card 画面から外した Settings 導線を、控えめな
     * リンクとして復活させる（クイズ・診断への唯一の入口）。言語切替はヘッダーの
     * ままなので、ここでは言及しない（Issue 118 と重複させない）。
     */
    readonly settingsButton: string;
    readonly settingsButtonHint: string;
  };
  /**
   * Issue 110: クラウド基礎クイズ画面（`QuizScreen.tsx`）の UI chrome。設問・選択肢・解説
   * 本文は `src/domain/quiz-catalog.ts` の `{ja, en}` を直接使う（ここには含めない）。
   */
  readonly quiz: {
    readonly eyebrow: string;
    readonly listTitle: string;
    readonly listDescription: string;
    readonly clearedCount: (current: number, total: number) => string;
    /** Issue 110 code-reviewer 指摘: `isQuizComplete` を実際に使う全問クリア演出。 */
    readonly allClearedNotice: string;
    readonly categoryLabels: {
      readonly iam: string;
      readonly network: string;
      readonly storage: string;
      readonly compute: string;
      readonly observability: string;
    };
    readonly clearedStatusLabel: string;
    readonly notClearedStatusLabel: string;
    readonly questionAccessibilityLabel: (
      prompt: string,
      cleared: boolean
    ) => string;
    readonly backButton: string;
    readonly backButtonHint: string;
    readonly questionEyebrow: string;
    readonly choiceAccessibilityLabel: (
      index: number,
      text: string,
      selected: boolean
    ) => string;
    readonly submitButton: string;
    readonly submitButtonHint: string;
    readonly correctTitle: string;
    readonly incorrectTitle: string;
    readonly explanationLabel: string;
    readonly backToListButton: string;
    readonly backToListButtonHint: string;
  };
  /**
   * Issue 104 / ADR-0036: 端末内会話エージェント画面（`ConversationAgentScreen.tsx`）
   * の UI chrome。会話理由・最初の質問の本文は Domain 側
   * （`agent-model-provider.ts` の `evidenceNarrative`）が組み立てた固定文をそのまま
   * 表示し、ここでは持たない。
   */
  readonly conversationAgent: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly selfCardMissingNotice: string;
    /**
     * major（Issue 104 PR #132、Codex 指摘 no-op UI）: 自己紹介カード未作成時は
     * scan/paste/sample の取り込み導線を隠し、代わりにこの CTA だけを表示する。
     */
    readonly selfCardMissingCtaButton: string;
    readonly selfCardMissingCtaButtonHint: string;
    readonly peerSectionTitle: string;
    readonly noPeerNotice: string;
    readonly scanButton: string;
    readonly scanButtonHint: string;
    readonly pasteLabel: string;
    readonly pasteHint: string;
    readonly pastePlaceholder: string;
    readonly pasteSubmitButton: string;
    readonly pasteSubmitButtonHint: string;
    readonly sampleButton: string;
    readonly sampleButtonHint: string;
    readonly peerLabel: (name: string) => string;
    readonly removePeerButtonLabel: (name: string) => string;
    readonly removePeerButtonHint: string;
    readonly startButton: string;
    readonly startButtonHint: string;
    readonly resetButton: string;
    readonly resetButtonHint: string;
    readonly runningNotice: string;
    readonly noSignalTitle: string;
    readonly noSignalMessage: string;
    readonly bridgeReasonTitle: string;
    readonly bridgeOpenerTitle: string;
    readonly runErrorMessage: string;
    readonly backButton: string;
    readonly settingsButton: string;
    readonly settingsButtonHint: string;
  };
}

const ja: AppMessages = {
  common: {
    brand: 'TenkaCloud Passport',
    settingsButton: 'Settings（言語切り替え）',
    settingsButtonHint:
      '表示言語を切り替えます。Lounge の進行状況や同意は失われません。',
    backButton: '戻る',
    localeToggleAccessibilityLabel: (currentLabel, nextLabel) =>
      `表示言語: ${currentLabel}。タップで ${nextLabel} に切り替えます。`,
    localeToggleHint: 'タップするたびに表示言語を切り替えます。',
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
  settings: {
    title: '設定を確認する。',
    description:
      '表示言語や Local Model の管理をここから行います。言語を切り替えても、進行中の Lounge、同意、保存済み Local Profile は失われません。',
    languageSectionTitle: '表示言語',
    languageOptionAccessibilityLabel: (label, selected) =>
      `表示言語 ${label}${selected ? '、選択中' : ''}`,
    languageOptionHint: 'この端末の表示言語をこの言語に切り替えます。',
    modelSectionTitle: '端末内 Local Model',
    modelDescription:
      'Development Build だけで利用できます。GGUF は選択後に Size を確認し、確定した場合だけアプリ専用領域へ Copy します。',
    modelBusy: 'Local Model の端末内処理を実行中です。',
    onDeviceAiSectionTitle: 'オンデバイス AI（Qwen）',
    onDeviceAiDescription: (displayName, size) =>
      `${displayName}（${size}）を端末内へ取得すると、会話 Agent が Rules ではなく Local LLM を使うようになります。内容はこの端末だけで処理し、サーバーへは送信しません。`,
    onDeviceAiEnableButton: 'オンデバイス AI を有効化',
    onDeviceAiEnableButtonHint:
      '明示同意の確認画面を開きます。この時点ではまだダウンロードを開始しません。',
    onDeviceAiConsentTitle: 'ダウンロード前に確認してください。',
    onDeviceAiConsentBody: (displayName, size, license) =>
      `${displayName} を約 ${size} ダウンロードします。ライセンスは ${license} です。Wi-Fi 接続時の実行を推奨します。ダウンロード後の推論はすべて端末内だけで行い、内容をサーバーへ送信することはありません。`,
    onDeviceAiConsentStartButton: '同意してダウンロードを開始する',
    onDeviceAiConsentCancelButton: 'やめる',
    onDeviceAiDownloadStatus: (downloaded, total, percent) =>
      `ダウンロード中: ${downloaded} / ${total}（${percent}%）`,
    onDeviceAiDownloadCancelButton: 'ダウンロードを中止する',
    onDeviceAiFinalizingStatus:
      'ダウンロード完了。端末内で仕上げの処理をしています（この処理は中止できません）。',
    onDeviceAiActiveStatus:
      '有効です。会話 Agent はこの Model を使用しています。',
    onDeviceAiImportedNotActiveStatus:
      '取得済みですが、まだ使用していません。下の一覧で状態を確認してください。',
    onDeviceAiRemoveButton: 'オンデバイス AI を無効化して削除する',
    selectModelButton: 'GGUF File を選択',
    selectModelHint:
      'OS の Document Picker を開きます。選択しただけではアプリ専用領域へ Copy しません。',
    candidateSummary: (name, size) => `選択候補: ${name}、${size}`,
    candidateAvailableStorage: (size) => `Copy 前の端末空き容量: ${size}`,
    candidateWarning:
      'この Size の File を端末内へ Copy します。SHA-256 は安全性や出所を証明しません。',
    confirmImportButton: 'この GGUF を端末内へ取り込む',
    cancelImportButton: '取り込みをやめる',
    cancelRunningImportButton: '実行中の取り込みを中止する',
    importedModelSummary: (name, size, architecture, risk, active) =>
      `${name}、${size}、${architecture}、${risk}${active ? '、使用中' : ''}`,
    riskSupported: '利用可能',
    riskCaution: '注意確認が必要',
    riskBlocked: '現在の端末状態では利用不可',
    riskBasis: (estimatedMemory, effectiveMemory, ratio, reasons) =>
      `推定 Working Set ${estimatedMemory} / 利用可能な Memory 基準 ${effectiveMemory}（比率 ${ratio}）。根拠: ${reasons}`,
    riskMemoryUnavailable: '取得不能',
    riskReasonMemoryUnavailable: 'Memory 上限情報を取得できない',
    riskReasonSupported: 'Memory 使用比率 45% 以下',
    riskReasonCaution: 'Memory 使用比率 45% 超 60% 以下',
    riskReasonBlocked: 'Memory 使用比率 60% 超',
    riskReasonThermal: 'Thermal 状態が serious または critical',
    activateModelButton: 'この Model を使用する',
    reassessBlockedModelButton: '端末状態を再評価して、利用可能なら使用する',
    unloadModelButton: 'Local Model を Unload',
    deleteModelButton: 'Model File と計測記録を削除',
    providerOperationTitle: '進行中の Local Model 判定を終了します。',
    providerOperationDescription:
      'この操作を続けると、現在の Lounge で実行中の Local Model 判定を Cancel し、Native Context の解放完了を待ってから Model を変更します。Lounge 自体は破棄しません。',
    confirmProviderOperationButton: '判定を終了して操作を続ける',
    cancelProviderOperationButton: '現在の判定を続ける',
    cautionTitle: 'Resource 使用量を確認してください。',
    cautionDescription:
      '推定値は OS、他 App、GPU と共有されるため保証ではありません。現在の Risk snapshot に対してだけ確認します。',
    confirmCautionButton: 'Risk を確認してこの Model を使用する',
    blockedDescription:
      'Memory 情報、推定使用量、または Thermal 状態により Context 初期化を停止しました。File は削除できます。',
    benchmarkSummary: (
      count,
      importMs,
      loadMs,
      firstTokenMs,
      completionMs,
      peakMemory,
      thermalBefore,
      thermalAfter,
      batteryDeltaPermille,
      outcome
    ) =>
      `内容を保存しない計測 ${count} 件。直近: Import ${importMs ?? '-'} ms、Load ${loadMs ?? '-'} ms、First Token ${firstTokenMs ?? '-'} ms、完了 ${completionMs ?? '-'} ms、Peak Memory ${peakMemory}、Thermal ${thermalBefore} → ${thermalAfter}、Battery ${batteryDeltaPermille ?? '-'} permille、結果 ${outcome}。`,
    modelError: (code) => {
      if (code === 'NATIVE_CONTEXT_UNAVAILABLE') {
        return 'Native Context の解放を確認できません。Model File は変更していません。App を完全に終了して再起動してください。';
      }
      if (code === 'INSUFFICIENT_STORAGE') {
        return 'この端末の空き容量が不足しています。空き容量を確保してからもう一度お試しください。現在の設定は変更していません。';
      }
      if (code === 'DOWNLOAD_FAILED') {
        return 'ダウンロードに失敗しました。通信状況を確認してもう一度お試しください。現在の設定は変更していません。';
      }
      if (code === 'DOWNLOAD_CANCELLED') {
        return 'ダウンロードを中止しました。現在の設定は変更していません。';
      }
      if (code === 'INTEGRITY_MISMATCH') {
        return 'ダウンロードした内容の検証に失敗しました。もう一度お試しください。現在の設定は変更していません。';
      }
      return `Local Model の処理を完了できませんでした（${code}）。File URI や推論内容は記録していません。`;
    },
    diagnosticsButton: '診断と端末内 Data',
    diagnosticsButtonHint:
      'Network 送信なしの診断 Preview と、分離された削除操作を開きます。',
    pilotMeasurementButton: 'Pilot の匿名 Aggregate',
    pilotMeasurementButtonHint:
      'Process 内 Counter の全項目を Preview し、最低集計単位を満たす場合だけ手動共有できます。',
    quizButton: 'クラウド基礎クイズに挑戦',
    quizButtonHint:
      'クラウド基礎の四択クイズに挑戦し、進捗を端末内に保存します。',
    conversationAgentButton: '端末内会話エージェントを試す',
    conversationAgentButtonHint:
      '相手の自己紹介カードから、会話のきっかけを端末内だけで見つけます。',
    conversationAgentButtonDisabledHint:
      '先に自己紹介カードを作成すると開けます。',
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
    introCardExcludedNotice:
      '自己紹介カードはこの対象に含まれません。削除するにはカード画面の「カードを削除する」を使ってください。',
    quizIncludedNotice:
      'クラウド基礎クイズの進捗（クリア済み設問の記録）もこの対象に含まれます。',
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
  profileNotice: {
    readErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
    saveErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
  },
  introCard: {
    editEyebrow: 'Step 1 / 自己紹介カード',
    editTitle: '自己紹介カードを作る。',
    editDescription:
      '入力は明示保存するまで端末へ残りません。名前だけが必須です。連絡先や自己紹介は渡したい分だけ入力してください。',
    initialNotice:
      '名前を入力し、端末内保存を明示してください。他の項目はすべて任意です。',
    noticeTitles: {
      empty: 'まだ自己紹介カードがありません。',
      saved: '自己紹介カードを端末内へ明示保存しました。',
      'validation-error': '入力を確認してください。',
      'save-error': '保存に失敗しました。',
      'delete-error': '削除に失敗しました。',
      'storage-unavailable': '端末内 Storage を利用できません。',
      'invalid-data': '端末内の保存データが不正です。',
      'read-error': '保存済みの自己紹介カードを読み込めません。',
    },
    readErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
    deleteErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
    saveErrorFallback:
      'Storage の処理に失敗しました。もう一度実行してください。',
    nameLabel: '名前（必須）',
    nameAccessibilityLabel: '名前',
    nameHint: (maxLength) => `${maxLength} 文字以下で名前を入力します。`,
    namePlaceholder: '例: 田中太郎',
    nameCounter: (current, max) => `${current} / ${max}`,
    previewNamePlaceholder: '名前を入力するとここに表示されます。',
    optionalSectionShowLabel: '任意項目を追加する',
    optionalSectionShowHint:
      '所属・自己紹介・メール・電話・リンクなど、渡したい分だけ追加できます。',
    optionalSectionHideLabel: '任意項目を閉じる',
    optionalSectionHideHint: '任意項目の入力欄を折りたたみます。',
    titleLabel: '肩書き（任意）',
    titlePlaceholder: '例: Engineer',
    titleCounter: (current, max) => `${current} / ${max}`,
    organizationLabel: '所属（任意）',
    organizationPlaceholder: '例: TenkaCloud',
    organizationCounter: (current, max) => `${current} / ${max}`,
    selfIntroLabel: '自己紹介・いまやっていること（任意）',
    selfIntroHint:
      '会話のきっかけになる、いまやっていることを書きます。相手が読むだけで話しかけやすくなる内容がおすすめです。',
    selfIntroPlaceholder: '例: LT でお話しした話題を深掘りしています。',
    selfIntroCounter: (current, max) => `${current} / ${max}`,
    emailLabel: 'メールアドレス（任意）',
    emailPlaceholder: '例: taro@example.com',
    phoneLabel: '電話番号（任意）',
    phonePlaceholder: '例: 090-1234-5678',
    linksLabel: 'リンク（任意、最大 5 件）',
    linksHint:
      'X・GitHub・LinkedIn はユーザー名だけでも入力できます。Portfolio とその他のリンクは URL を入力してください。',
    linksCounter: (current, max) => `${current} / ${max} 件`,
    linkXLabel: 'X（旧 Twitter）',
    linkXPlaceholder: '例: taro_tanaka（または完全な URL）',
    linkGithubLabel: 'GitHub',
    linkGithubPlaceholder: '例: taro-tanaka（または完全な URL）',
    linkLinkedinLabel: 'LinkedIn',
    linkLinkedinPlaceholder: '例: taro-tanaka（または完全な URL）',
    linkPortfolioLabel: 'Portfolio（任意、URL のみ）',
    linkPortfolioPlaceholder: '例: https://taro-tanaka.example.com',
    otherLinkPlaceholder: '例: https://example.com',
    addLinkButton: 'その他のリンクを追加',
    addLinkButtonHint:
      '自由な URL の入力欄を追加します。名前付き欄と合わせて最大 5 件までです。',
    removeLinkButtonLabel: (index) => `その他のリンク ${index} を削除`,
    themeIdsLabel: '会話テーマ（任意）',
    themeIdsHint:
      '端末内会話エージェントが相手との共通点を探すのに使います。最大 3 件まで選べます。',
    themeIdsCounter: (current, max) => `${current} / ${max} 件選択`,
    byteUsageLabel: (current, max) => `QR の目安: ${current} / ${max} byte`,
    byteUsageOverBudget: (current, max) =>
      `QR の上限を超えています（${current} / ${max} byte）。入力を減らしてください。`,
    saveButton: (saving) => (saving ? '保存中' : '保存'),
    saveButtonHint: '検証済みの自己紹介カードをこの端末だけに保存します。',
    cardEyebrow: 'Intro Card',
    cardTitle: '自己紹介カード',
    cardDescription:
      '相手はこの QR をカメラで読むとブラウザで自己紹介ページが開きます。連絡先への追加は相手がページ内で選べます。アプリのインストールは不要です。',
    qrAccessibilityLabel: '自己紹介カードの QR コード',
    qrExplanation:
      '相手はカメラで読むとブラウザで自己紹介が開きます。連絡先への追加はページ内で相手が選べます。',
    quizProgressOmittedNotice:
      'カード内容が多いため、クイズ進捗のスタンプは今回の QR に含まれていません。',
    editButton: '編集する',
    editButtonHint: '自己紹介カードの内容を編集します。',
    deleteButton: 'カードを削除する',
    deleteButtonHint:
      '端末内の自己紹介カードを削除します。この操作は取り消せません。',
    settingsButton: '設定',
    settingsButtonHint:
      'クイズ・診断など、自己紹介カード以外の設定を開きます。',
  },
  quiz: {
    eyebrow: 'Cloud Basics Quiz',
    listTitle: 'クラウド基礎クイズ',
    listDescription:
      'クラウドの基礎知識を四択で確認します。正解した設問は端末内にスタンプとして保存され、自己紹介カードの QR に合格数だけが載ります（誤答・解答履歴は載りません）。',
    clearedCount: (current, total) => `${current} / ${total} 問クリア`,
    allClearedNotice: '全問クリアしました。おめでとうございます。',
    categoryLabels: {
      iam: 'IAM',
      network: 'ネットワーク',
      storage: 'ストレージ',
      compute: 'コンピュート',
      observability: '可観測性',
    },
    clearedStatusLabel: 'クリア済み',
    notClearedStatusLabel: '未クリア',
    questionAccessibilityLabel: (prompt, cleared) =>
      `${prompt}、${cleared ? 'クリア済み' : '未クリア'}`,
    backButton: '設定に戻る',
    backButtonHint: 'クイズを終えて設定画面に戻ります。',
    questionEyebrow: 'Question',
    choiceAccessibilityLabel: (index, text, selected) =>
      `選択肢 ${index + 1}、${text}${selected ? '、選択中' : ''}`,
    submitButton: '回答する',
    submitButtonHint: '選んだ選択肢で採点します。',
    correctTitle: '正解',
    incorrectTitle: '不正解',
    explanationLabel: '解説',
    backToListButton: '一覧に戻る',
    backToListButtonHint: 'クイズの一覧画面に戻ります。',
  },
  conversationAgent: {
    eyebrow: '端末内会話エージェント',
    title: '会話のきっかけを見つける。',
    description:
      '相手の自己紹介ページ URL を取り込むと、確認済みの会話テーマから共通点と最初の質問を端末内だけで探します。相手の情報は端末のメモリにだけ保持し、終了すると消えます。',
    selfCardMissingNotice:
      '自己紹介カードをまだ作成していません。先に自己紹介カードを作成してください。',
    selfCardMissingCtaButton: '戻って自己紹介カードを作成する',
    selfCardMissingCtaButtonHint:
      '設定画面へ戻ります。自己紹介カードを作成すると、この機能を使えます。',
    peerSectionTitle: '相手のカード',
    noPeerNotice:
      'まだ相手のカードを受信していません。QR を再スキャンするか、URL を貼り付けてください。',
    scanButton: 'QR を再スキャン',
    scanButtonHint: '相手の自己紹介ページ QR を読み取ります。',
    pasteLabel: '自己紹介ページ URL を貼り付け',
    pasteHint:
      'カメラが使えない場合は、相手から共有された URL をそのまま貼り付けてください。',
    pastePlaceholder: '例: https://card.tenkacloud.com/c/#...',
    pasteSubmitButton: '追加',
    pasteSubmitButtonHint: '貼り付けた URL から相手のカードを取り込みます。',
    sampleButton: 'サンプルで試す',
    sampleButtonHint:
      '実在しないサンプルの相手カードで、この機能の流れを一人で確認できます。',
    peerLabel: (name) => `相手: ${name}`,
    removePeerButtonLabel: (name) => `${name} を削除`,
    removePeerButtonHint: '受信したカードをこのセッションから外します。',
    startButton: '会話のきっかけを見つける',
    startButtonHint:
      '確認済みの会話テーマから、共通点と最初の質問を計算します。',
    resetButton: 'カードを外してやり直す',
    resetButtonHint: '受信したカードを外し、別のカードを取り込み直せます。',
    runningNotice: '共通点を探しています…',
    noSignalTitle: '共通点が見つかりませんでした',
    noSignalMessage:
      'お互いが確認済みの会話テーマに重なりがありませんでした。会話テーマを増やすと見つかりやすくなります。',
    bridgeReasonTitle: '共通点',
    bridgeOpenerTitle: '最初の質問',
    runErrorMessage: '計算を完了できませんでした。もう一度お試しください。',
    backButton: '戻る',
    settingsButton: 'Settings（言語切り替え等）',
    settingsButtonHint: 'Settings 画面に戻ります。',
  },
};

const en: AppMessages = {
  common: {
    brand: 'TenkaCloud Passport',
    settingsButton: 'Settings (switch language)',
    settingsButtonHint:
      'Switches the display language. Your Lounge progress and consent are kept.',
    backButton: 'Back',
    localeToggleAccessibilityLabel: (currentLabel, nextLabel) =>
      `Display language: ${currentLabel}. Tap to switch to ${nextLabel}.`,
    localeToggleHint: 'Switches the display language each time you tap.',
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
  settings: {
    title: 'Review your settings.',
    description:
      'Manage the display language and Local Model from here. Switching languages never loses an in-progress Lounge, consent, or your saved Local Profile.',
    languageSectionTitle: 'Display language',
    languageOptionAccessibilityLabel: (label, selected) =>
      `Display language ${label}${selected ? ', selected' : ''}`,
    languageOptionHint: 'Switches this device’s display language to this one.',
    modelSectionTitle: 'On-device local models',
    modelDescription:
      'Available only in a Development Build. After selection, the app shows the GGUF size and copies it into private storage only after confirmation.',
    modelBusy: 'Processing the local model on this device.',
    onDeviceAiSectionTitle: 'On-device AI (Qwen)',
    onDeviceAiDescription: (displayName, size) =>
      `Fetching ${displayName} (${size}) on-device switches the conversation agent from Rules to the local LLM. Everything runs on this device only and nothing is sent to a server.`,
    onDeviceAiEnableButton: 'Enable on-device AI',
    onDeviceAiEnableButtonHint:
      'Opens the explicit-consent screen. The download does not start yet.',
    onDeviceAiConsentTitle: 'Please review before downloading.',
    onDeviceAiConsentBody: (displayName, size, license) =>
      `This downloads ${displayName}, about ${size}. License: ${license}. We recommend doing this over Wi-Fi. All inference afterward runs on this device only; nothing is sent to a server.`,
    onDeviceAiConsentStartButton: 'I agree, start the download',
    onDeviceAiConsentCancelButton: 'Cancel',
    onDeviceAiDownloadStatus: (downloaded, total, percent) =>
      `Downloading: ${downloaded} / ${total} (${percent}%)`,
    onDeviceAiDownloadCancelButton: 'Cancel the download',
    onDeviceAiFinalizingStatus:
      'Download complete. Finishing setup on this device (this step cannot be cancelled).',
    onDeviceAiActiveStatus:
      'Enabled. The conversation agent is using this model.',
    onDeviceAiImportedNotActiveStatus:
      'Already fetched, but not in use yet. Check the status in the list below.',
    onDeviceAiRemoveButton: 'Disable on-device AI and delete it',
    selectModelButton: 'Choose a GGUF file',
    selectModelHint:
      'Opens the OS document picker. Selection alone does not copy the file into app-private storage.',
    candidateSummary: (name, size) => `Selected candidate: ${name}, ${size}`,
    candidateAvailableStorage: (size) =>
      `Available on-device storage before copy: ${size}`,
    candidateWarning:
      'This file size will be copied on-device. SHA-256 does not prove safety or provenance.',
    confirmImportButton: 'Import this GGUF on-device',
    cancelImportButton: 'Cancel import',
    cancelRunningImportButton: 'Stop the import in progress',
    importedModelSummary: (name, size, architecture, risk, active) =>
      `${name}, ${size}, ${architecture}, ${risk}${active ? ', active' : ''}`,
    riskSupported: 'Supported',
    riskCaution: 'Confirmation required',
    riskBlocked: 'Blocked for the current device state',
    riskBasis: (estimatedMemory, effectiveMemory, ratio, reasons) =>
      `Estimated working set ${estimatedMemory} / effective memory basis ${effectiveMemory} (ratio ${ratio}). Basis: ${reasons}`,
    riskMemoryUnavailable: 'unavailable',
    riskReasonMemoryUnavailable: 'memory ceiling information is unavailable',
    riskReasonSupported: 'memory ratio is at most 45%',
    riskReasonCaution: 'memory ratio is over 45% and at most 60%',
    riskReasonBlocked: 'memory ratio is over 60%',
    riskReasonThermal: 'thermal state is serious or critical',
    activateModelButton: 'Use this model',
    reassessBlockedModelButton:
      'Reassess device state and use the model if supported',
    unloadModelButton: 'Unload local model',
    deleteModelButton: 'Delete model file and measurements',
    providerOperationTitle: 'This ends the in-progress local model decision.',
    providerOperationDescription:
      'Continuing cancels the local model decision running in the current Lounge, waits for native context teardown, and then changes the model. The Lounge itself is not discarded.',
    confirmProviderOperationButton: 'End the decision and continue',
    cancelProviderOperationButton: 'Keep the current decision running',
    cautionTitle: 'Review resource usage.',
    cautionDescription:
      'The estimate is not a guarantee because memory is shared with the OS, other apps, and the GPU. Confirmation applies only to the current risk snapshot.',
    confirmCautionButton: 'Accept this risk and use the model',
    blockedDescription:
      'Context initialization was stopped because of memory information, estimated usage, or thermal state. You can still delete the file.',
    benchmarkSummary: (
      count,
      importMs,
      loadMs,
      firstTokenMs,
      completionMs,
      peakMemory,
      thermalBefore,
      thermalAfter,
      batteryDeltaPermille,
      outcome
    ) =>
      `${count} content-free measurements. Latest: import ${importMs ?? '-'} ms, load ${loadMs ?? '-'} ms, first token ${firstTokenMs ?? '-'} ms, completion ${completionMs ?? '-'} ms, peak memory ${peakMemory}, thermal ${thermalBefore} → ${thermalAfter}, battery ${batteryDeltaPermille ?? '-'} permille, outcome ${outcome}.`,
    modelError: (code) => {
      if (code === 'NATIVE_CONTEXT_UNAVAILABLE') {
        return 'Native context teardown could not be confirmed. No model file was changed. Fully quit and restart the app.';
      }
      if (code === 'INSUFFICIENT_STORAGE') {
        return 'This device does not have enough free storage. Free up space and try again. Your current setting has not changed.';
      }
      if (code === 'DOWNLOAD_FAILED') {
        return 'The download failed. Check your connection and try again. Your current setting has not changed.';
      }
      if (code === 'DOWNLOAD_CANCELLED') {
        return 'The download was cancelled. Your current setting has not changed.';
      }
      if (code === 'INTEGRITY_MISMATCH') {
        return 'The downloaded content failed verification. Please try again. Your current setting has not changed.';
      }
      return `The local model operation could not finish (${code}). No file URI or inference content was recorded.`;
    },
    diagnosticsButton: 'Diagnostics and local data',
    diagnosticsButtonHint:
      'Opens an on-device diagnostic Preview and separate deletion actions.',
    pilotMeasurementButton: 'Anonymous Pilot aggregate',
    pilotMeasurementButtonHint:
      'Previews every in-process counter and permits manual sharing only after the minimum aggregation unit.',
    quizButton: 'Try the cloud basics quiz',
    quizButtonHint:
      'Take the cloud basics multiple-choice quiz and save your progress on this device.',
    conversationAgentButton: 'Try the on-device conversation agent',
    conversationAgentButtonHint:
      "Finds a conversation opener from someone's intro card, entirely on this device.",
    conversationAgentButtonDisabledHint:
      'Create an intro card first to unlock this.',
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
    introCardExcludedNotice:
      'Your Intro Card is not included in this action. To delete it, use "Delete card" on the card screen.',
    quizIncludedNotice:
      'Your cloud basics quiz progress (which questions you have cleared) is included in this action.',
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
  profileNotice: {
    readErrorFallback: 'Storage operation failed. Please try again.',
    saveErrorFallback: 'Storage operation failed. Please try again.',
  },
  introCard: {
    editEyebrow: 'Step 1 / Intro Card',
    editTitle: 'Create your Intro Card.',
    editDescription:
      'Nothing is kept on this device until you explicitly save. Only your name is required. Add contact details or a self-introduction only as much as you want to share.',
    initialNotice:
      'Enter your name and explicitly save on this device. All other fields are optional.',
    noticeTitles: {
      empty: 'No Intro Card yet.',
      saved: 'Saved your Intro Card on this device.',
      'validation-error': 'Please check your input.',
      'save-error': 'Save failed.',
      'delete-error': 'Delete failed.',
      'storage-unavailable': 'Local storage is unavailable.',
      'invalid-data': 'The saved data on this device is invalid.',
      'read-error': 'Could not load the saved Intro Card.',
    },
    readErrorFallback: 'Storage operation failed. Please try again.',
    saveErrorFallback: 'Storage operation failed. Please try again.',
    deleteErrorFallback: 'Storage operation failed. Please try again.',
    nameLabel: 'Name (required)',
    nameAccessibilityLabel: 'Name',
    nameHint: (maxLength) => `Enter your name, up to ${maxLength} characters.`,
    namePlaceholder: 'e.g., Taro Tanaka',
    nameCounter: (current, max) => `${current} / ${max}`,
    previewNamePlaceholder: 'Your name will appear here once entered.',
    optionalSectionShowLabel: 'Add optional details',
    optionalSectionShowHint:
      'Add as much as you want to share: organization, self-intro, email, phone, links.',
    optionalSectionHideLabel: 'Hide optional details',
    optionalSectionHideHint: 'Collapses the optional input fields.',
    titleLabel: 'Title (optional)',
    titlePlaceholder: 'e.g., Engineer',
    titleCounter: (current, max) => `${current} / ${max}`,
    organizationLabel: 'Organization (optional)',
    organizationPlaceholder: 'e.g., TenkaCloud',
    organizationCounter: (current, max) => `${current} / ${max}`,
    selfIntroLabel: 'About you / what you are doing (optional)',
    selfIntroHint:
      'Write what you are working on now, as a conversation starter. Something the other person can read and easily follow up on works best.',
    selfIntroPlaceholder: 'e.g., Digging deeper into the topic from my talk.',
    selfIntroCounter: (current, max) => `${current} / ${max}`,
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'e.g., taro@example.com',
    phoneLabel: 'Phone (optional)',
    phonePlaceholder: 'e.g., 090-1234-5678',
    linksLabel: 'Links (optional, up to 5)',
    linksHint:
      'For X, GitHub, and LinkedIn, a username alone is enough. Portfolio and other links need a full URL.',
    linksCounter: (current, max) => `${current} / ${max}`,
    linkXLabel: 'X (formerly Twitter)',
    linkXPlaceholder: 'e.g., taro_tanaka (or a full URL)',
    linkGithubLabel: 'GitHub',
    linkGithubPlaceholder: 'e.g., taro-tanaka (or a full URL)',
    linkLinkedinLabel: 'LinkedIn',
    linkLinkedinPlaceholder: 'e.g., taro-tanaka (or a full URL)',
    linkPortfolioLabel: 'Portfolio (optional, URL only)',
    linkPortfolioPlaceholder: 'e.g., https://taro-tanaka.example.com',
    otherLinkPlaceholder: 'e.g., https://example.com',
    addLinkButton: 'Add another link',
    addLinkButtonHint:
      'Adds a free-form URL field. Up to 5 links in total, including the named fields.',
    removeLinkButtonLabel: (index) => `Remove other link ${index}`,
    themeIdsLabel: 'Conversation topics (optional)',
    themeIdsHint:
      'Used by the on-device conversation agent to find common ground with someone you meet. Choose up to 3.',
    themeIdsCounter: (current, max) => `${current} / ${max} selected`,
    byteUsageLabel: (current, max) => `QR estimate: ${current} / ${max} byte`,
    byteUsageOverBudget: (current, max) =>
      `This exceeds the QR limit (${current} / ${max} byte). Please shorten your input.`,
    saveButton: (saving) => (saving ? 'Saving...' : 'Save'),
    saveButtonHint: 'Saves the validated Intro Card only on this device.',
    cardEyebrow: 'Intro Card',
    cardTitle: 'Intro Card',
    cardDescription:
      'Scanning this QR with their camera opens your intro page in their browser. They can choose whether to add you to their contacts from that page. No app install needed.',
    qrAccessibilityLabel: 'Intro Card QR code',
    qrExplanation:
      'Scanning with their camera opens your intro in their browser. Adding your contact is a choice they make on that page.',
    quizProgressOmittedNotice:
      'Your card content is long, so the quiz progress stamp is not included in this QR code.',
    editButton: 'Edit',
    editButtonHint: 'Edit the contents of your Intro Card.',
    deleteButton: 'Delete card',
    deleteButtonHint:
      'Deletes the Intro Card on this device. This cannot be undone.',
    settingsButton: 'Settings',
    settingsButtonHint:
      'Opens quiz, diagnostics, and other settings beyond your Intro Card.',
  },
  quiz: {
    eyebrow: 'Cloud Basics Quiz',
    listTitle: 'Cloud basics quiz',
    listDescription:
      'Check your cloud fundamentals with multiple-choice questions. Questions you answer correctly are stamped on this device, and only the cleared count is added to your Intro Card QR (wrong answers and history are never included).',
    clearedCount: (current, total) => `${current} / ${total} cleared`,
    allClearedNotice: "You've cleared every question. Congratulations!",
    categoryLabels: {
      iam: 'IAM',
      network: 'Network',
      storage: 'Storage',
      compute: 'Compute',
      observability: 'Observability',
    },
    clearedStatusLabel: 'Cleared',
    notClearedStatusLabel: 'Not cleared',
    questionAccessibilityLabel: (prompt, cleared) =>
      `${prompt}, ${cleared ? 'cleared' : 'not cleared'}`,
    backButton: 'Back to Settings',
    backButtonHint: 'Finish the quiz and return to Settings.',
    questionEyebrow: 'Question',
    choiceAccessibilityLabel: (index, text, selected) =>
      `Choice ${index + 1}, ${text}${selected ? ', selected' : ''}`,
    submitButton: 'Submit answer',
    submitButtonHint: 'Score the selected choice.',
    correctTitle: 'Correct',
    incorrectTitle: 'Incorrect',
    explanationLabel: 'Explanation',
    backToListButton: 'Back to list',
    backToListButtonHint: 'Return to the quiz list screen.',
  },
  conversationAgent: {
    eyebrow: 'On-device conversation agent',
    title: 'Find a conversation opener.',
    description:
      'Bring in someone’s intro card URL, and this finds a shared topic and opening question from confirmed conversation topics, entirely on this device. The other person’s card only lives in memory and disappears when you finish.',
    selfCardMissingNotice:
      'You have not created an intro card yet. Please create one first.',
    selfCardMissingCtaButton: 'Go back to create an intro card',
    selfCardMissingCtaButtonHint:
      'Returns to Settings. Creating an intro card unlocks this feature.',
    peerSectionTitle: 'Their card',
    noPeerNotice:
      'You have not received their card yet. Re-scan the QR code or paste the URL.',
    scanButton: 'Re-scan QR code',
    scanButtonHint: "Scans the other person's intro page QR code.",
    pasteLabel: 'Paste their intro page URL',
    pasteHint:
      'If the camera is unavailable, paste the URL they shared with you.',
    pastePlaceholder: 'e.g., https://card.tenkacloud.com/c/#...',
    pasteSubmitButton: 'Add',
    pasteSubmitButtonHint: 'Imports their card from the pasted URL.',
    sampleButton: 'Try with a sample',
    sampleButtonHint:
      'Try this feature by yourself with a fictional sample card.',
    peerLabel: (name) => `With: ${name}`,
    removePeerButtonLabel: (name) => `Remove ${name}`,
    removePeerButtonHint: 'Removes the received card from this session.',
    startButton: 'Find a conversation opener',
    startButtonHint:
      'Computes a shared topic and opening question from confirmed conversation topics.',
    resetButton: 'Remove card and start over',
    resetButtonHint: 'Removes the received card so you can bring in another.',
    runningNotice: 'Looking for common ground…',
    noSignalTitle: 'No common ground found',
    noSignalMessage:
      'Your confirmed conversation topics did not overlap. Adding more topics makes a match more likely.',
    bridgeReasonTitle: 'Common ground',
    bridgeOpenerTitle: 'Opening question',
    runErrorMessage: 'Could not finish. Please try again.',
    backButton: 'Back',
    settingsButton: 'Settings (language, etc.)',
    settingsButtonHint: 'Returns to the Settings screen.',
  },
};

export const MESSAGES: Record<Locale, AppMessages> = { ja, en };
