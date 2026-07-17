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
