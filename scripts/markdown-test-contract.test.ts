import { describe, expect, it } from 'bun:test';
import {
  markdownSection,
  markdownTable,
  markdownTableRowsInDocument,
  parseMarkdownTableLine,
} from './markdown-test-contract';

describe('Markdown 文書 Test Contract', () => {
  it('完全一致した Section と連続した Table を解析する', () => {
    const document = [
      '# Document',
      '',
      '## Evidence',
      '',
      '説明です。',
      '',
      '| Field | Status |',
      '| :--- | ---: |',
      '| Static | `Not run` |',
      '| Physical | `Not run` |',
      '',
      '## Next',
      '',
      '本文です。',
    ].join('\n');

    expect(markdownSection(document, 'Evidence')).toContain('説明です。');
    expect(markdownTable(document, 'Evidence')).toEqual({
      header: ['Field', 'Status'],
      rows: [
        ['Static', '`Not run`'],
        ['Physical', '`Not run`'],
      ],
    });
    expect(parseMarkdownTableLine('| --- | :---: |')?.kind).toBe('delimiter');
  });

  it('部分一致または重複した Section を拒否する', () => {
    expect(() => markdownSection('## Evidence details', 'Evidence')).toThrow(
      '必須 Section がありません'
    );
    expect(() =>
      markdownSection('## Evidence\nA\n## Evidence\nB', 'Evidence')
    ).toThrow('Section が重複しています');
  });

  it('Fenced と4-space indented code block 内の見出しと表を証跡にしない', () => {
    const fenced = [
      '```markdown',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '```',
    ].join('\n');
    const indented = [
      '## Evidence',
      '',
      '    | A | B |',
      '    | --- | --- |',
      '    | 1 | 2 |',
    ].join('\n');
    const invalidClosingFence = [
      '```markdown',
      '```not-a-closing-fence',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const invalidOpeningFence = [
      '```bad`info',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const htmlComment = [
      '<!--',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '-->',
    ].join('\n');
    const rawHtmlBlock = [
      '<script>',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '</script>',
    ].join('\n');
    const processingInstruction = [
      '<?probe',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '?>',
    ].join('\n');
    const declaration = [
      '<!PROBE',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '>',
    ].join('\n');
    const cdata = [
      '<![CDATA[',
      '## Evidence',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      ']]>',
    ].join('\n');

    expect(() => markdownSection(fenced, 'Evidence')).toThrow(
      '必須 Section がありません'
    );
    expect(() => markdownTable(indented, 'Evidence')).toThrow(
      '必須 Table がありません'
    );
    expect(() => markdownSection(invalidClosingFence, 'Evidence')).toThrow(
      '必須 Section がありません'
    );
    expect(markdownTable(invalidOpeningFence, 'Evidence')).toEqual({
      header: ['A', 'B'],
      rows: [['1', '2']],
    });
    for (const document of [
      htmlComment,
      rawHtmlBlock,
      processingInstruction,
      declaration,
      cdata,
    ]) {
      expect(() => markdownSection(document, 'Evidence')).toThrow(
        'raw HTML block は Evidence Contract で許可しません'
      );
    }
    expect(markdownTableRowsInDocument(`${fenced}\n| Real | Row |`)).toEqual([
      ['Real', 'Row'],
    ]);
    expect(parseMarkdownTableLine('   | A | B |')?.cells).toEqual(['A', 'B']);
    expect(parseMarkdownTableLine('    | A | B |')).toBeNull();
  });

  it('区切り行の欠落と不正な Hyphen 数を拒否する', () => {
    const missing = '## Evidence\n\n| A | B |\n| one | two |';
    const malformed = '## Evidence\n\n| A | B |\n| -- | --- |\n| 1 | 2 |';

    expect(() => markdownTable(missing, 'Evidence')).toThrow(
      'Table 区切り行が不正です'
    );
    expect(() => markdownTable(malformed, 'Evidence')).toThrow(
      'Table 区切り行が不正です'
    );
  });

  it('列数不一致、Data 行なし、途中で分断された行を拒否する', () => {
    const mismatched = '## Evidence\n\n| A | B |\n| --- | --- |\n| only-one |';
    const empty = '## Evidence\n\n| A | B |\n| --- | --- |';
    const interrupted = [
      '## Evidence',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '| 3 | 4 |',
    ].join('\n');

    expect(() => markdownTable(mismatched, 'Evidence')).toThrow(
      'Table の Data 行が不正です'
    );
    expect(() => markdownTable(empty, 'Evidence')).toThrow(
      'Table に Data 行がありません'
    );
    expect(() => markdownTable(interrupted, 'Evidence')).toThrow(
      'Table 行が連続していません'
    );
  });
});
