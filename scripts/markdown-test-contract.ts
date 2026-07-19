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
  const fenceSource = match[1];
  const suffix = match[2];
  if (fenceSource === undefined || suffix === undefined) return null;
  const character = fenceSource.startsWith('`') ? '`' : '~';
  if (character === '`' && suffix.includes('`')) return null;
  return { character, length: fenceSource.length };
};

const closesFence = (line: string, fence: MarkdownFence): boolean => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  const fenceSource = match?.[1];
  return (
    fenceSource !== undefined &&
    fenceSource[0] === fence.character &&
    fenceSource.length >= fence.length
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
  const marker = match?.[1];
  const text = match?.[2];
  return marker === undefined || text === undefined
    ? null
    : { level: marker.length, text };
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

function tableHeaderColumns(
  header: ParsedMarkdownTableLine | null,
  delimiter: ParsedMarkdownTableLine | null
): number | null {
  if (header?.kind !== 'row' || delimiter?.kind !== 'delimiter') return null;
  if (header.cells.length !== delimiter.cells.length) {
    throw new Error('Table の列数が一致しません');
  }
  return header.cells.length;
}

/** Returns data rows from each well-formed Markdown table and excludes headers. */
export function markdownTableRowsInDocument(
  document: string
): readonly (readonly string[])[] {
  const lines = proseLines(document);
  const rows: (readonly string[])[] = [];
  let tableColumns: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseMarkdownTableLine(lines[index] ?? '');
    if (tableColumns === null) {
      const headerColumns = tableHeaderColumns(
        parsed,
        parseMarkdownTableLine(lines[index + 1] ?? '')
      );
      if (headerColumns !== null) {
        tableColumns = headerColumns;
        index += 1;
      }
      continue;
    }
    if (parsed === null) {
      tableColumns = null;
      continue;
    }
    if (parsed.kind !== 'row' || parsed.cells.length !== tableColumns) {
      throw new Error('Table の Data 行が不正です');
    }
    rows.push(parsed.cells);
  }
  return rows;
}

export function markdownSection(document: string, heading: string): string {
  const lines = proseLines(document);
  const matchingHeadings = lines.flatMap((line, index) => {
    const parsed = parseMarkdownHeading(line);
    return parsed?.text === heading ? [{ index, level: parsed.level }] : [];
  });
  if (matchingHeadings.length === 0) {
    throw new Error(`必須 Section がありません: ${heading}`);
  }
  if (matchingHeadings.length > 1) {
    throw new Error(`Section が重複しています: ${heading}`);
  }
  const match = matchingHeadings[0];
  if (match === undefined) {
    throw new Error(`必須 Section がありません: ${heading}`);
  }
  const { index: headingIndex, level: headingLevel } = match;
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
  const header = parseMarkdownTableLine(lines[tableStart] ?? '');
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
    const parsed = parseMarkdownTableLine(lines[cursor] ?? '');
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
