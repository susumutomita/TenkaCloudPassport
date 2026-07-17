import {
  CATALOG_VERSION,
  CLUE_IDS,
  type ClueCategory,
  type ClueId,
  clueById,
  isClueId,
} from './clue-catalog';

export type PassportValidationCode =
  | 'UNKNOWN_CLUE'
  | 'DUPLICATE_CLUE'
  | 'PROFILE_CLUE_COUNT'
  | 'CLUE_NOT_IN_PROFILE'
  | 'CLUE_NOT_SELECTED'
  | 'OWNER_CONFIRMATION_REQUIRED'
  | 'PASSPORT_CLUE_COUNT';

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
  readonly schemaVersion: 1;
  readonly catalogVersion: typeof CATALOG_VERSION;
  readonly candidateClues: readonly ProfileClue[];
  readonly excludedTopics: readonly ClueId[];
}

export interface ConfirmedClue {
  readonly value: ClueId;
  readonly category: ClueCategory;
  readonly source: 'owner-selected';
}

export interface PublicPassport {
  readonly schemaVersion: 1;
  readonly catalogVersion: typeof CATALOG_VERSION;
  readonly clues: readonly ConfirmedClue[];
}

interface CreateProfileInput {
  readonly candidateClueIds: readonly string[];
  readonly selectedForPassportClueIds: readonly string[];
  readonly excludedTopicIds?: readonly string[];
}

interface ProjectPassportInput {
  readonly clueIds: readonly string[];
  readonly ownerConfirmed: boolean;
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

export function createLocalPrivateProfile(
  input: CreateProfileInput
): LocalPrivateProfile {
  if (input.candidateClueIds.length > CLUE_IDS.length) {
    throw new PassportValidationError(
      'PROFILE_CLUE_COUNT',
      `Local Private Profile の候補は ${CLUE_IDS.length} 件以下にしてください。`
    );
  }
  const candidateIds = validatedClueIds(input.candidateClueIds);
  const selectedIds = validatedClueIds(input.selectedForPassportClueIds);
  const excludedTopicIds = validatedClueIds(input.excludedTopicIds ?? []);
  if (excludedTopicIds.length > CLUE_IDS.length) {
    throw new PassportValidationError(
      'PROFILE_CLUE_COUNT',
      `Local Private Profile の除外トピックは ${CLUE_IDS.length} 件以下にしてください。`
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
  return {
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    candidateClues: candidateIds.map((id) => {
      const definition = clueById(id);
      return {
        value: id,
        category: definition.category,
        selectedForPassport: selected.has(id),
      };
    }),
    excludedTopics: excludedTopicIds,
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
  if (input.clueIds.length < 1 || input.clueIds.length > 3) {
    throw new PassportValidationError(
      'PASSPORT_CLUE_COUNT',
      'Public Passport の手掛かりは 1 件以上 3 件以下にしてください。'
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
  return {
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    clues: clueIds.map((id) => ({
      value: id,
      category: clueById(id).category,
      source: 'owner-selected',
    })),
  };
}
