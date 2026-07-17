import {
  type ClueId,
  clueById,
  LANGUAGE_CATALOG,
  type LanguageCode,
} from '../domain/clue-catalog';
import {
  type LocalPrivateProfile,
  type ProjectPassportInput,
  PUBLIC_PASSPORT_MAX_CLUES,
  PUBLIC_PASSPORT_MAX_LANGUAGES,
  type PublicPassport,
  projectPublicPassport,
} from '../domain/passport';
import type { PeerPayload } from '../protocol/peer-envelope';

export interface PassportShareSelection {
  readonly includePetName: boolean;
  readonly includePetEmoji: boolean;
  readonly includeOwnerAlias: boolean;
  readonly clueIds: readonly ClueId[];
  readonly languageCodes: readonly LanguageCode[];
}

export interface PassportPreviewItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface PassportShare {
  readonly preview: {
    readonly publicPassport: PublicPassport;
    readonly items: readonly PassportPreviewItem[];
  };
  readonly qrProjection: PublicPassport;
  readonly peerPayload: Extract<
    PeerPayload,
    { readonly kind: 'public-passport' }
  >;
}

export function createDefaultPassportShareSelection(
  profile: LocalPrivateProfile
): PassportShareSelection {
  return {
    includePetName: true,
    includePetEmoji: true,
    includeOwnerAlias: profile.ownerAlias !== undefined,
    clueIds: profile.candidateClues
      .filter((clue) => clue.selectedForPassport)
      .slice(0, PUBLIC_PASSPORT_MAX_CLUES)
      .map((clue) => clue.value),
    languageCodes: [...profile.languages],
  };
}

function previewItems(passport: PublicPassport): PassportPreviewItem[] {
  return [
    { key: 'petName', label: 'Pet Name', value: passport.petName },
    ...(passport.petEmoji
      ? [{ key: 'petEmoji', label: 'Pet Emoji', value: passport.petEmoji }]
      : []),
    ...(passport.ownerAlias
      ? [
          {
            key: 'ownerAlias',
            label: 'Owner Alias',
            value: passport.ownerAlias,
          },
        ]
      : []),
    ...passport.clues.map((clue) => ({
      key: `clue:${clue.value}`,
      label: clueById(clue.value).passportField,
      value: clueById(clue.value).label,
    })),
    ...passport.languages.map((language) => ({
      key: `language:${language}`,
      label: 'Language',
      value: LANGUAGE_CATALOG[language].label,
    })),
  ];
}

export function toggleClueId(
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

export function toggleLanguageCode(
  selectedCodes: readonly LanguageCode[],
  code: LanguageCode,
  maximum: number
): LanguageCode[] {
  if (selectedCodes.includes(code)) {
    return selectedCodes.filter((selectedCode) => selectedCode !== code);
  }
  if (selectedCodes.length >= maximum) return [...selectedCodes];
  return [...selectedCodes, code];
}

export type PassportShareSelectionAction =
  | { readonly type: 'toggle-pet-name' }
  | { readonly type: 'toggle-pet-emoji' }
  | { readonly type: 'toggle-owner-alias' }
  | { readonly type: 'toggle-clue'; readonly id: ClueId }
  | { readonly type: 'toggle-language'; readonly code: LanguageCode };

/**
 * Owner（Host）と Guest、どちらの共有 Preview 画面でも同じ ON / OFF 操作を扱うための
 * 純粋 reducer。PassportSharePreviewScreen は誰の Selection かを問わず同じ形で使える。
 */
export function reducePassportShareSelection(
  selection: PassportShareSelection,
  action: PassportShareSelectionAction
): PassportShareSelection {
  switch (action.type) {
    case 'toggle-pet-name':
      return { ...selection, includePetName: !selection.includePetName };
    case 'toggle-pet-emoji':
      return { ...selection, includePetEmoji: !selection.includePetEmoji };
    case 'toggle-owner-alias':
      return {
        ...selection,
        includeOwnerAlias: !selection.includeOwnerAlias,
      };
    case 'toggle-clue':
      return {
        ...selection,
        clueIds: toggleClueId(
          selection.clueIds,
          action.id,
          PUBLIC_PASSPORT_MAX_CLUES
        ),
      };
    case 'toggle-language':
      return {
        ...selection,
        languageCodes: toggleLanguageCode(
          selection.languageCodes,
          action.code,
          PUBLIC_PASSPORT_MAX_LANGUAGES
        ),
      };
  }
}

export function createPassportShare(
  profile: LocalPrivateProfile,
  selection: PassportShareSelection
): PassportShare {
  const projectionInput: ProjectPassportInput = {
    ...selection,
    ownerConfirmed: true,
  };
  const publicPassport = projectPublicPassport(profile, projectionInput);
  return {
    preview: {
      publicPassport,
      items: previewItems(publicPassport),
    },
    qrProjection: publicPassport,
    peerPayload: { kind: 'public-passport', publicPassport },
  };
}
