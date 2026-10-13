import { expect, it } from 'bun:test';
import { catalogTitle, orderedCatalogs, practiceText } from './presentation';

it('organizes known and legacy company-labelled catalogs by content without rewriting stored data', () => {
  const stored = {
    catalogID: 'interviewlab.algorithms.derivation',
    title: 'OpenAI interview questions',
  };
  expect(catalogTitle(stored)).toBe('典型アルゴリズムの考え方');
  expect(stored.title).toBe('OpenAI interview questions');
  expect(
    catalogTitle({ catalogID: 'legacy', title: 'Anthropic exercises' })
  ).toBe('練習教材');
  expect(catalogTitle({ catalogID: 'custom', title: 'BFS and Dijkstra' })).toBe(
    'BFS and Dijkstra'
  );
});
it('removes company names only from the known disclaimer, preserving precise technical attribution', () => {
  expect(
    practiceText(
      'Google・OpenAI・Anthropicの実際の出題、採点基準、合格予測ではありません。'
    )
  ).toBe('特定企業の実際の出題、採点基準、合格予測ではありません。');
  expect(practiceText('Google Spanner technical paper')).toBe(
    'Google Spanner technical paper'
  );
});

it('opens the selected topic and newest version first without changing stored order', () => {
  const catalog = {
    schemaVersion: 1 as const,
    catalogID: 'interviewlab.algorithms.derivation',
    title: 'Algorithms',
    lessons: [],
  };
  const old = { ...catalog, version: '2026.10.1301' };
  const updated = { ...catalog, version: '2026.10.1302' };
  const design = {
    ...catalog,
    catalogID: 'interviewlab.system-design',
    version: '2026.10.1302',
  };
  const stored = [old, design, updated];
  expect(orderedCatalogs(stored)).toEqual([updated, old, design]);
  expect(orderedCatalogs(stored, design.catalogID)).toEqual([
    design,
    updated,
    old,
  ]);
  expect(stored).toEqual([old, design, updated]);
  expect(orderedCatalogs([{ ...old, catalogID: 'custom' }])[0]?.catalogID).toBe(
    'custom'
  );
});
