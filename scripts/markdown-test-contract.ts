export interface MarkdownTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface ParsedMarkdownTableLine {
  readonly kind: 'delimiter' | 'row';
  readonly cells: readonly string[];
}

const documentLines = (document: string): readonly string[] =>
  document.split(/\r?\n/);

interface MarkdownFence {
  readonly character: '`' | '~';
  readonly length: number;
}

const openingFence = (line: string): MarkdownFence | null => {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (match === null) return null;
  const character = match[1].startsWith('`') ? '`' : '~';
  if (character === '`' && match[2].includes('`')) return null;
  return { character, length: match[1].length };
};

const closesFence = (line: string, fence: MarkdownFence): boolean => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return (
    match !== null &&
    match[1][0] === fence.character &&
    match[1].length >= fence.length
  );
};

const fenceAfterLine = (
  line: string,
  fence: MarkdownFence
): MarkdownFence | null => (closesFence(line, fence) ? null : fence);

const startsRawHtmlBlock = (line: string): boolean =>
  /^ {0,3}(?:<!--|<\?|<!\[CDATA\[|<![A-Z]|<\/?[A-Za-z][A-Za-z0-9-]*(?:[\t />]|$))/.test(
    line
  );

const proseLines = (document: string): readonly string[] => {
  let fence: MarkdownFence | null = null;
  return documentLines(document).map((line) => {
    if (fence !== null) {
      fence = fenceAfterLine(line, fence);
      return '';
    }
    if (/^(?: {4,}|\t)/.test(line)) return '';
    if (startsRawHtmlBlock(line)) {
      throw new Error('raw HTML block は Evidence Contract で許可しません');
    }
    const openedFence = openingFence(line);
    if (openedFence !== null) {
      fence = openedFence;
      return '';
    }
    return line;
  });
};

interface MarkdownHeading {
  readonly level: number;
  readonly text: string;
}

const parseMarkdownHeading = (line: string): MarkdownHeading | null => {
  const match = /^(#{2,6}) (.+)$/.exec(line);
  return match === null
    ? null
    : {
        level: match[1].length,
        text: match[2],
      };
};

export function parseMarkdownTableLine(
  line: string
): ParsedMarkdownTableLine | null {
  if (/^(?: {4,}|\t)/.test(line)) return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  const delimiterCells = cells.filter((cell) => /^:?-{3,}:?$/.test(cell));
  return {
    kind: delimiterCells.length === cells.length ? 'delimiter' : 'row',
    cells,
  };
}

export function markdownTableRowsInDocument(
  document: string
): readonly (readonly string[])[] {
  return proseLines(document).flatMap((line) => {
    const parsed = parseMarkdownTableLine(line);
    return parsed?.kind === 'row' ? [parsed.cells] : [];
  });
}

export function markdownSection(document: string, heading: string): string {
  const lines = proseLines(document);
  const headingIndexes = lines.flatMap((line, index) =>
    parseMarkdownHeading(line)?.text === heading ? [index] : []
  );
  if (headingIndexes.length === 0) {
    throw new Error(`必須 Section がありません: ${heading}`);
  }
  if (headingIndexes.length > 1) {
    throw new Error(`Section が重複しています: ${heading}`);
  }
  const headingIndex = headingIndexes[0];
  const headingLevel = parseMarkdownHeading(lines[headingIndex])?.level;
  if (headingLevel === undefined) {
    throw new Error(`必須 Section がありません: ${heading}`);
  }
  const start = headingIndex + 1;
  const nextHeadingOffset = lines.slice(start).findIndex((line) => {
    const parsed = parseMarkdownHeading(line);
    return parsed !== null && parsed.level <= headingLevel;
  });
  const end = nextHeadingOffset < 0 ? lines.length : start + nextHeadingOffset;
  return lines.slice(start, end).join('\n');
}

export function markdownTable(
  document: string,
  heading: string
): MarkdownTable {
  const lines = documentLines(markdownSection(document, heading));
  const tableStart = lines.findIndex(
    (line) => parseMarkdownTableLine(line)?.kind === 'row'
  );
  if (tableStart < 0) {
    throw new Error(`必須 Table がありません: ${heading}`);
  }
  const header = parseMarkdownTableLine(lines[tableStart]);
  const delimiter = parseMarkdownTableLine(lines[tableStart + 1] ?? '');
  if (header?.kind !== 'row' || delimiter?.kind !== 'delimiter') {
    throw new Error(`Table 区切り行が不正です: ${heading}`);
  }
  if (header.cells.length !== delimiter.cells.length) {
    throw new Error(`Table の列数が一致しません: ${heading}`);
  }
  const rows: (readonly string[])[] = [];
  let cursor = tableStart + 2;
  while (cursor < lines.length) {
    const parsed = parseMarkdownTableLine(lines[cursor]);
    if (parsed === null) break;
    if (parsed.kind !== 'row' || parsed.cells.length !== header.cells.length) {
      throw new Error(`Table の Data 行が不正です: ${heading}`);
    }
    rows.push(parsed.cells);
    cursor += 1;
  }
  if (rows.length === 0) {
    throw new Error(`Table に Data 行がありません: ${heading}`);
  }
  if (
    lines.slice(cursor).some((line) => parseMarkdownTableLine(line) !== null)
  ) {
    throw new Error(`Table 行が連続していません: ${heading}`);
  }
  return {
    header: header.cells,
    rows,
  };
}
