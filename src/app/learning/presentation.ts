import type { Catalog } from '../../domain/learning/model';
import { PUBLISHED_CATALOGS } from './published-catalogs';

/** Display changes never rewrite stored catalog identities, versions or lesson text. */
export function catalogTitle(
  catalog: Pick<Catalog, 'catalogID' | 'title'>
): string {
  const published = PUBLISHED_CATALOGS.find(
    (item) => item.catalogID === catalog.catalogID
  );
  if (published) return published.title;
  if (/OpenAI|Anthropic|Google/i.test(catalog.title)) return '練習教材';
  return catalog.title;
}
export function practiceText(text: string): string {
  return text.replace(
    'Google・OpenAI・Anthropicの実際の出題、採点基準、合格予測ではありません。',
    '特定企業の実際の出題、採点基準、合格予測ではありません。'
  );
}

export function orderedCatalogs(
  catalogs: readonly Catalog[],
  focus: string | null = null
): Catalog[] {
  const order = (catalog: Catalog) => {
    if (catalog.catalogID === focus) return -1;
    const index = PUBLISHED_CATALOGS.findIndex(
      (item) => item.catalogID === catalog.catalogID
    );
    return index < 0 ? PUBLISHED_CATALOGS.length : index;
  };
  return [...catalogs].sort((a, b) => {
    const difference = order(a) - order(b);
    return (
      difference || b.version.localeCompare(a.version, 'en', { numeric: true })
    );
  });
}
