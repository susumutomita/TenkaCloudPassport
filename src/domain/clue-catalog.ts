export const CATALOG_VERSION = '2026-07-17';

export const CLUE_CATALOG = {
  'regional-event-operations': {
    category: 'activity',
    label: '地域イベントの運営',
  },
  'local-tournament': {
    category: 'activity',
    label: 'ローカル大会',
  },
  'community-operations': {
    category: 'activity',
    label: 'コミュニティの共同運営',
  },
  'open-source': {
    category: 'interest',
    label: 'オープンソース',
  },
  accessibility: {
    category: 'interest',
    label: 'アクセシビリティ',
  },
  'information-security': {
    category: 'skill',
    label: '情報セキュリティ',
  },
  'cloud-infrastructure': {
    category: 'skill',
    label: 'クラウド基盤',
  },
  'product-design': {
    category: 'skill',
    label: 'プロダクトデザイン',
  },
  'event-lessons': {
    category: 'conversation-topic',
    label: 'イベント運営で学んだこと',
  },
  'local-technology': {
    category: 'conversation-topic',
    label: '地域で活用する技術',
  },
} as const;

export type ClueId = keyof typeof CLUE_CATALOG;
export type ClueCategory = (typeof CLUE_CATALOG)[ClueId]['category'];

export interface ClueDefinition {
  readonly id: ClueId;
  readonly category: ClueCategory;
  readonly label: string;
}

export const CLUE_IDS = Object.keys(CLUE_CATALOG) as ClueId[];

export function isClueId(value: string): value is ClueId {
  return Object.hasOwn(CLUE_CATALOG, value);
}

export function clueById(id: ClueId): ClueDefinition {
  return { id, ...CLUE_CATALOG[id] };
}
