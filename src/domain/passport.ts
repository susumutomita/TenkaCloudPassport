import {
  CATALOG_VERSION,
  type ClueCategory,
  type ClueId,
  clueById,
  isClueId,
  isLanguageCode,
  type LanguageCode,
  type PassportField,
} from './clue-catalog';

export const PET_NAME_MAX_LENGTH = 24;
export const OWNER_ALIAS_MAX_LENGTH = 24;
export const PROFILE_MAX_CLUES = 10;
export const PUBLIC_PASSPORT_MAX_CLUES = 3;
export const PROFILE_MAX_LANGUAGES = 3;
export const PUBLIC_PASSPORT_MAX_LANGUAGES = 3;

export const PET_EMOJIS = ['🐾', '🐶', '🐱', '🦊', '🐼', '🐧'] as const;
export type PetEmoji = (typeof PET_EMOJIS)[number];

export const PASSPORT_FIELD_LIMITS: Readonly<Record<PassportField, number>> = {
  topics: 3,
  offers: 3,
  lookingFor: 3,
  goal: 1,
};

export type PassportValidationCode =
  | 'UNKNOWN_CLUE'
  | 'DUPLICATE_CLUE'
  | 'PROFILE_CLUE_COUNT'
  | 'CLUE_NOT_IN_PROFILE'
  | 'CLUE_NOT_SELECTED'
  | 'OWNER_CONFIRMATION_REQUIRED'
  | 'PASSPORT_CLUE_COUNT'
  | 'PET_NAME_INVALID'
  | 'PET_NAME_REQUIRED'
  | 'PET_EMOJI_INVALID'
  | 'OWNER_ALIAS_INVALID'
  | 'OWNER_ALIAS_NOT_IN_PROFILE'
  | 'PROFILE_FIELD_COUNT'
  | 'LANGUAGE_INVALID'
  | 'LANGUAGE_NOT_IN_PROFILE';

export class PassportValidationError extends Error {
  readonly code: PassportValidationCode;

  constructor(code: PassportValidationCode, message: string) {
    super(message);
    this.name = 'PassportValidationError';
    this.code = code;
  }
}

export interface ProfileClue {
  readonly value: ClueId;
  readonly category: ClueCategory;
  readonly selectedForPassport: boolean;
}

export interface LocalPrivateProfile {
  readonly schemaVersion: 2;
  readonly catalogVersion: typeof CATALOG_VERSION;
  readonly petName: string;
  readonly petEmoji: PetEmoji;
  readonly ownerAlias?: string;
  readonly candidateClues: readonly ProfileClue[];
  readonly excludedTopics: readonly ClueId[];
  readonly languages: readonly LanguageCode[];
}

export interface ConfirmedClue {
  readonly value: ClueId;
  readonly category: ClueCategory;
  readonly source: 'owner-selected';
}

export interface PublicPassport {
  readonly schemaVersion: 2;
  readonly catalogVersion: typeof CATALOG_VERSION;
  readonly petName: string;
  readonly petEmoji?: PetEmoji;
  readonly ownerAlias?: string;
  readonly clues: readonly ConfirmedClue[];
  readonly languages: readonly LanguageCode[];
}

export interface CreateProfileInput {
  readonly petName: string;
  readonly petEmoji: string;
  readonly ownerAlias: string;
  readonly candidateClueIds: readonly string[];
  readonly selectedForPassportClueIds: readonly string[];
  readonly excludedTopicIds?: readonly string[];
  readonly languageCodes: readonly string[];
}

export interface ProjectPassportInput {
  readonly includePetName: boolean;
  readonly includePetEmoji: boolean;
  readonly includeOwnerAlias: boolean;
  readonly clueIds: readonly string[];
  readonly languageCodes: readonly string[];
  readonly ownerConfirmed: boolean;
}

export function isPetEmoji(value: string): value is PetEmoji {
  return PET_EMOJIS.some((emoji) => emoji === value);
}

function normalizedRequiredLabel(
  value: string,
  maximumLength: number,
  code: 'PET_NAME_INVALID' | 'OWNER_ALIAS_INVALID',
  fieldName: string
): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximumLength) {
    throw new PassportValidationError(
      code,
      `${fieldName} は 1 文字以上 ${maximumLength} 文字以下にしてください。`
    );
  }
  return normalized;
}

function normalizedOwnerAlias(value: string): string | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  return normalizedRequiredLabel(
    normalized,
    OWNER_ALIAS_MAX_LENGTH,
    'OWNER_ALIAS_INVALID',
    'Owner Alias'
  );
}

function validatedClueIds(values: readonly string[]): ClueId[] {
  const result: ClueId[] = [];
  for (const value of values) {
    if (!isClueId(value)) {
      throw new PassportValidationError(
        'UNKNOWN_CLUE',
        '手掛かりは版管理済みカタログから選んでください。'
      );
    }
    if (result.includes(value)) {
      throw new PassportValidationError(
        'DUPLICATE_CLUE',
        '同じ手掛かりを重複して選ぶことはできません。'
      );
    }
    result.push(value);
  }
  return result;
}

function assertClueFieldLimits(clueIds: readonly ClueId[]): void {
  const counts: Record<PassportField, number> = {
    topics: 0,
    offers: 0,
    lookingFor: 0,
    goal: 0,
  };
  for (const clueId of clueIds) {
    const field = clueById(clueId).passportField;
    counts[field] += 1;
    if (counts[field] > PASSPORT_FIELD_LIMITS[field]) {
      throw new PassportValidationError(
        'PROFILE_FIELD_COUNT',
        `${field} の候補は ${PASSPORT_FIELD_LIMITS[field]} 件以下にしてください。`
      );
    }
  }
}

function validatedLanguageCodes(
  values: readonly string[],
  maximumLength: number
): LanguageCode[] {
  if (values.length > maximumLength) {
    throw new PassportValidationError(
      'LANGUAGE_INVALID',
      `Languages は ${maximumLength} 件以下にしてください。`
    );
  }
  const result: LanguageCode[] = [];
  for (const value of values) {
    if (!isLanguageCode(value) || result.includes(value)) {
      throw new PassportValidationError(
        'LANGUAGE_INVALID',
        'Languages は版管理済みカタログから重複なく選んでください。'
      );
    }
    result.push(value);
  }
  return result;
}

export function createLocalPrivateProfile(
  input: CreateProfileInput
): LocalPrivateProfile {
  const petName = normalizedRequiredLabel(
    input.petName,
    PET_NAME_MAX_LENGTH,
    'PET_NAME_INVALID',
    'Pet Name'
  );
  if (!isPetEmoji(input.petEmoji)) {
    throw new PassportValidationError(
      'PET_EMOJI_INVALID',
      'Pet Emoji は同梱カタログから選んでください。'
    );
  }
  const ownerAlias = normalizedOwnerAlias(input.ownerAlias);
  if (
    input.candidateClueIds.length < 1 ||
    input.candidateClueIds.length > PROFILE_MAX_CLUES
  ) {
    throw new PassportValidationError(
      'PROFILE_CLUE_COUNT',
      `Local Private Profile の候補は 1 件以上 ${PROFILE_MAX_CLUES} 件以下にしてください。`
    );
  }
  const candidateIds = validatedClueIds(input.candidateClueIds);
  assertClueFieldLimits(candidateIds);
  const selectedIds = validatedClueIds(input.selectedForPassportClueIds);
  const excludedTopicIds = validatedClueIds(input.excludedTopicIds ?? []);
  if (excludedTopicIds.length > PROFILE_MAX_CLUES) {
    throw new PassportValidationError(
      'PROFILE_CLUE_COUNT',
      `Local Private Profile の除外トピックは ${PROFILE_MAX_CLUES} 件以下にしてください。`
    );
  }
  const candidates = new Set<ClueId>(candidateIds);
  for (const selectedId of selectedIds) {
    if (!candidates.has(selectedId)) {
      throw new PassportValidationError(
        'CLUE_NOT_IN_PROFILE',
        '公開対象は Local Private Profile の候補から選んでください。'
      );
    }
  }
  const selected = new Set<ClueId>(selectedIds);
  const languages = validatedLanguageCodes(
    input.languageCodes,
    PROFILE_MAX_LANGUAGES
  );
  return {
    schemaVersion: 2,
    catalogVersion: CATALOG_VERSION,
    petName,
    petEmoji: input.petEmoji,
    ...(ownerAlias ? { ownerAlias } : {}),
    candidateClues: candidateIds.map((id) => {
      const definition = clueById(id);
      return {
        value: id,
        category: definition.category,
        selectedForPassport: selected.has(id),
      };
    }),
    excludedTopics: excludedTopicIds,
    languages,
  };
}

export function projectPublicPassport(
  profile: LocalPrivateProfile,
  input: ProjectPassportInput
): PublicPassport {
  if (!input.ownerConfirmed) {
    throw new PassportValidationError(
      'OWNER_CONFIRMATION_REQUIRED',
      'Owner の公開確認が必要です。'
    );
  }
  if (!input.includePetName) {
    throw new PassportValidationError(
      'PET_NAME_REQUIRED',
      'Public Passport には Pet Name が必要です。'
    );
  }
  if (
    input.clueIds.length < 1 ||
    input.clueIds.length > PUBLIC_PASSPORT_MAX_CLUES
  ) {
    throw new PassportValidationError(
      'PASSPORT_CLUE_COUNT',
      `Public Passport の手掛かりは 1 件以上 ${PUBLIC_PASSPORT_MAX_CLUES} 件以下にしてください。`
    );
  }
  const clueIds = validatedClueIds(input.clueIds);
  const selectedIds = new Set(
    profile.candidateClues
      .filter((clue) => clue.selectedForPassport)
      .map((clue) => clue.value)
  );
  for (const clueId of clueIds) {
    if (!selectedIds.has(clueId)) {
      throw new PassportValidationError(
        'CLUE_NOT_SELECTED',
        'Profile で公開対象にした手掛かりだけを投影できます。'
      );
    }
  }
  const languages = validatedLanguageCodes(
    input.languageCodes,
    PUBLIC_PASSPORT_MAX_LANGUAGES
  );
  const profileLanguages = new Set(profile.languages);
  for (const language of languages) {
    if (!profileLanguages.has(language)) {
      throw new PassportValidationError(
        'LANGUAGE_NOT_IN_PROFILE',
        'Local Private Profile にある Language だけを投影できます。'
      );
    }
  }
  if (input.includeOwnerAlias && !profile.ownerAlias) {
    throw new PassportValidationError(
      'OWNER_ALIAS_NOT_IN_PROFILE',
      '空の Owner Alias は共有できません。'
    );
  }
  return {
    schemaVersion: 2,
    catalogVersion: CATALOG_VERSION,
    petName: profile.petName,
    ...(input.includePetEmoji ? { petEmoji: profile.petEmoji } : {}),
    ...(input.includeOwnerAlias && profile.ownerAlias
      ? { ownerAlias: profile.ownerAlias }
      : {}),
    clues: clueIds.map((id) => ({
      value: id,
      category: clueById(id).category,
      source: 'owner-selected',
    })),
    languages,
  };
}
