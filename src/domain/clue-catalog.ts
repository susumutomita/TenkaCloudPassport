export const CATALOG_VERSION = '2026-07-17';

export const CLUE_CATALOG = {
  'regional-event-operations': {
    category: 'activity',
    label: '地域イベントの運営',
    passportField: 'offers',
  },
  'local-tournament': {
    category: 'activity',
    label: 'ローカル大会',
    passportField: 'lookingFor',
  },
  'community-operations': {
    category: 'activity',
    label: 'コミュニティの共同運営',
    passportField: 'goal',
  },
  'open-source': {
    category: 'interest',
    label: 'オープンソース',
    passportField: 'topics',
  },
  accessibility: {
    category: 'interest',
    label: 'アクセシビリティ',
    passportField: 'topics',
  },
  'information-security': {
    category: 'skill',
    label: '情報セキュリティ',
    passportField: 'offers',
  },
  'cloud-infrastructure': {
    category: 'skill',
    label: 'クラウド基盤',
    passportField: 'offers',
  },
  'product-design': {
    category: 'skill',
    label: 'プロダクトデザイン',
    passportField: 'lookingFor',
  },
  'event-lessons': {
    category: 'conversation-topic',
    label: 'イベント運営で学んだこと',
    passportField: 'topics',
  },
  'local-technology': {
    category: 'conversation-topic',
    label: '地域で活用する技術',
    passportField: 'lookingFor',
  },
  'responsible-ai': {
    category: 'conversation-topic',
    label: '責任ある AI 活用',
    passportField: 'topics',
  },
} as const;

export type ClueId = keyof typeof CLUE_CATALOG;
export type ClueCategory = (typeof CLUE_CATALOG)[ClueId]['category'];
export type PassportField = (typeof CLUE_CATALOG)[ClueId]['passportField'];

export interface ClueDefinition {
  readonly id: ClueId;
  readonly category: ClueCategory;
  readonly label: string;
  readonly passportField: PassportField;
}

export const CLUE_IDS = Object.keys(CLUE_CATALOG) as ClueId[];

export function isClueId(value: string): value is ClueId {
  return Object.hasOwn(CLUE_CATALOG, value);
}

export function clueById(id: ClueId): ClueDefinition {
  return { id, ...CLUE_CATALOG[id] };
}

export const LANGUAGE_CATALOG = {
  ja: { label: '日本語' },
  en: { label: 'English' },
} as const;

export type LanguageCode = keyof typeof LANGUAGE_CATALOG;

export const LANGUAGE_CODES = Object.keys(LANGUAGE_CATALOG) as LanguageCode[];

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.hasOwn(LANGUAGE_CATALOG, value);
}
