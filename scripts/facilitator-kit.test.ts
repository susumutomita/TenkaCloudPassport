import { describe, expect, it } from 'bun:test';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isJoinSecret } from '../src/domain/lounge-invite';
import { QR_PROTOCOL_PREFIX } from '../src/protocol/qr-payload';

const repositoryRoot = join(import.meta.dir, '..');
const kitRoot = join(repositoryRoot, 'docs', 'facilitator');
const kitDocuments = [
  'README.md',
  'guide.ja.md',
  'guide.en.md',
  'one-page-checklist.ja.md',
  'one-page-checklist.en.md',
  'qr-poster.ja.md',
  'qr-poster.en.md',
  'dry-run-record.md',
  'walkthrough.ja.md',
  'walkthrough.en.md',
] as const;

const readKit = (fileName: string): Promise<string> =>
  readFile(join(kitRoot, fileName), 'utf8');

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const expectTerms = (content: string, terms: readonly string[]): void => {
  const normalizedContent = normalizeWhitespace(content);
  for (const term of terms) {
    expect(normalizedContent).toContain(normalizeWhitespace(term));
  }
};

const markdownTableCells = (line: string): readonly string[] | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  if (cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  return cells;
};

const findTableRow = (
  content: string,
  firstCell: string
): readonly string[] | null => {
  for (const line of content.split('\n')) {
    const cells = markdownTableCells(line);
    if (cells?.[0] === firstCell) return cells;
  }
  return null;
};

const findTableRows = (
  content: string,
  firstCell: string
): readonly (readonly string[])[] =>
  content
    .split('\n')
    .map(markdownTableCells)
    .filter(
      (cells): cells is readonly string[] =>
        cells !== null && cells[0] === firstCell
    );

const physicalCapabilities = [
  ['Native Build / Distribution Channel', 2],
  ['iOS / Android の実 Camera QR', 1],
  ['Nearby Transport Adapter', 2],
  ['Rules Provider', 2],
  ['Local Model', 2],
  ['2〜6 台の Group Lounge', 1],
  ['Host Loss と端末別破棄完了表示', 1],
  ['A4 / Letter 1 Page と QR Poster の出力', 1],
  ['未経験者による Kit Dry Run', 1],
  ['Real iOS / Android camera QR', 1],
  ['Two-to-six-device Group Lounge', 1],
  ['Host loss and per-device discard confirmation', 1],
  ['A4 / Letter one-page and QR Poster output', 1],
  ['Kit Dry Run by an inexperienced person', 1],
] as const;

const tableRowContractViolations = (
  content: string,
  capability: string,
  expectedCount: number,
  expectedStatus: string
): readonly string[] => {
  const violations: string[] = [];
  const rows = findTableRows(content, capability);
  if (rows.length !== expectedCount) {
    violations.push(`${capability}: expected ${expectedCount} rows`);
    return violations;
  }
  for (const row of rows) {
    if (row.length !== 4) {
      violations.push(`${capability}: missing four-column row`);
      continue;
    }
    if (row[2] !== expectedStatus) {
      violations.push(`${capability}: status must be ${expectedStatus}`);
    }
    if (row[3] === '') violations.push(`${capability}: evidence is empty`);
  }
  return violations;
};

const supportMatrixViolations = (content: string): readonly string[] => {
  const physicalViolations = physicalCapabilities.flatMap(
    ([capability, expectedCount]) =>
      tableRowContractViolations(
        content,
        capability,
        expectedCount,
        '`Not run`'
      )
  );
  const repositoryRows = [
    ['Repository 文書と文書契約 Test', '`Not run`'],
    ['Repository documents and document contract test', '`Not run`'],
  ] as const;
  const repositoryViolations = repositoryRows.flatMap(
    ([capability, expectedStatus]) =>
      tableRowContractViolations(content, capability, 1, expectedStatus)
  );

  const supportStart = content.indexOf('## Kit Version 1.0 Support Matrix');
  const supportEnd = content.indexOf('## 現場で使う文書', supportStart);
  const supportSection = content.slice(supportStart, supportEnd);
  const allowedCapabilitySet: ReadonlySet<string> = new Set([
    ...physicalCapabilities.map(([capability]) => capability),
    ...repositoryRows.map(([capability]) => capability),
    '能力',
    'Capability',
  ]);
  const unexpectedRows = supportSection
    .split('\n')
    .map(markdownTableCells)
    .filter(
      (row): row is readonly string[] =>
        row !== null && !allowedCapabilitySet.has(row[0])
    )
    .map((row) => `${row[0]}: unexpected capability row`);
  return [...physicalViolations, ...repositoryViolations, ...unexpectedRows];
};

const qrPosterViolations = (content: string): readonly string[] => {
  const checks = [
    ['protocol payload', content.includes(QR_PROTOCOL_PREFIX)],
    ['legacy protocol payload', content.includes('TENKACLOUDPASSPORT:LOUNGE:')],
    ['Markdown image', /!\[[^\]]*\]\([^)]+\)/.test(content)],
    ['HTML image', /<img\b/i.test(content)],
    ['HTML SVG', /<svg\b/i.test(content)],
    ['image data URL', /data:image/i.test(content)],
    ['code fence', /```/.test(content)],
    ['64-digit secret value', /\b[0-9a-f]{64}\b/i.test(content)],
    [
      'branded Join Secret value',
      [...content.matchAll(/jsc_[0-9a-f]{64}/g)].some((match) =>
        isJoinSecret(match[0])
      ),
    ],
    [
      'secret input field',
      /(?:join\s+)?secret(?:\s+value)?\s*[:=：]\s*(?:_+|["'`]|jsc_[0-9a-f]{64}|[0-9a-f]{16,})/i.test(
        content
      ),
    ],
  ] as const;
  return checks.filter(([, found]) => found).map(([name]) => name);
};

const championContractViolations = (content: string): readonly string[] =>
  normalizeWhitespace(content)
    .split(/[.;。]/)
    .filter((clause) => {
      if (
        !/(?:score|rank|leaderboard|registry|採点|順位|中央.*台帳)/i.test(
          clause
        )
      ) {
        return false;
      }
      return !/(?:never|not |no |without|do not|ない|ません|せず|禁止|棄却|ではない)/i.test(
        clause
      );
    });

const consentContractViolations = (content: string): readonly string[] => {
  const patterns = [
    /Research Consent replaces Product Consent/i,
    /Research Consent (?:also grants|includes) Product Consent/i,
    /Research Consent で Product Consent を(?:代替|取得|許可)/,
    /Research Consent を Product Consent の代わりに(?:使う|用いる|扱う)/,
    /use Research Consent (?:as|instead of) Product Consent/i,
    /Product Consent replaces Research Consent/i,
    /Product Consent (?:also grants|includes) Research Consent/i,
    /Product Consent で Research Consent を(?:代替|取得|許可)/,
    /Product Consent を Research Consent の代わりに(?:使う|用いる|扱う)/,
    /use Product Consent (?:as|instead of) Research Consent/i,
  ] as const;
  return patterns.filter((pattern) => pattern.test(content)).map(String);
};

const recordFieldLabels = (content: string): readonly string[] =>
  [...content.matchAll(/^- ([^:\n]+):/gm)].map((match) => match[1].trim());

const allowedRecordFieldLabels = [
  'Kit Version',
  'Current Status',
  'Physical Gate',
  'Kit Commit',
  'App Build ID / Version',
  'Build / OS / Transport',
  '実施月 / Month',
  '読み上げ Locale / Read-aloud Locale',
  'Orientation',
  '事前説明 / Explanation',
  '60 秒紹介 / 60-second introduction',
  '5 分 Setup / Five-minute setup',
  '口頭補足 / Oral hints after start',
  'Event Format',
  'Format Timing',
  'Capability',
  '判定 / Decision',
  '改訂 Pull Request / Revision PR',
  '再実施 / Repeat',
] as const;
const allowedRecordFieldLabelSet: ReadonlySet<string> = new Set(
  allowedRecordFieldLabels
);

const recordFieldEntries = (
  content: string
): readonly (readonly [string, string])[] => {
  const lines = content.split('\n');
  const entries: [string, string][] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^- ([^:\n]+):[ \t]*(.*)$/);
    if (match === null) continue;
    const valueLines = [match[2].trim()];
    while (index + 1 < lines.length && /^ {2}\S/.test(lines[index + 1])) {
      index += 1;
      valueLines.push(lines[index].trim());
    }
    entries.push([match[1].trim(), normalizeWhitespace(valueLines.join(' '))]);
  }
  return entries;
};

const constrainedRecordFieldValues = [
  ['Kit Version', /^1\.0。$/],
  ['Current Status', /^`Not run`。$/],
  ['Physical Gate', /^Repository Test で代替しない。$/],
  ['Kit Commit', /^`_+`。$/],
  [
    'App Build ID / Version',
    /^`Not run` または公開 Build 識別子だけを書く \/ Write only `Not run` or a public build identifier\.$/,
  ],
  [
    'Build / OS / Transport',
    /^`Not run`、または公開 Support Matrix の項目名だけを書く \/ Write only `Not run` or the name of a capability in the public Support Matrix\.$/,
  ],
  ['実施月 / Month', /^`YYYY-MM`。$/],
  [
    '読み上げ Locale / Read-aloud Locale',
    /^`JA \/ EN \/ JA \+ EN` から選ぶ \/ Choose one\.$/,
  ],
  [
    'Orientation',
    /^`30 分以内 \/ 30 分超 \/ Not run` または `Within 30 minutes \/ Over 30 minutes \/ Not run` から選ぶ \/ Choose one\.$/,
  ],
  [
    '事前説明 / Explanation',
    /^`0〜5 分 \/ 6〜10 分 \/ 10 分超` または `0–5 minutes \/ 6–10 minutes \/ over 10 minutes` から選ぶ \/ Choose one range\.$/,
  ],
  [
    '60 秒紹介 / 60-second introduction',
    /^`上限内 \/ 超過 \/ Not run` または `Within limit \/ Over \/ Not run` から選ぶ \/ Choose one\.$/,
  ],
  [
    '5 分 Setup / Five-minute setup',
    /^`上限内 \/ 超過 \/ Not run` または `Within limit \/ Over \/ Not run` から選ぶ \/ Choose one\.$/,
  ],
  [
    '口頭補足 / Oral hints after start',
    /^`0 件 \/ 1 件以上` または `0 \/ 1 or more` から選ぶ \/ Choose one\.$/,
  ],
  [
    'Event Format',
    /^`30 分 \/ 60 分 \/ 90 分` または `30 \/ 60 \/ 90 minutes` から選ぶ \/ Choose one\.$/,
  ],
  [
    'Format Timing',
    /^`上限内 \/ 超過 \/ Not run` または `Within limit \/ Over \/ Not run` から選ぶ \/ Choose one\. 正確な開始、終了、秒数を書かない \/ Never write exact start, end, or seconds\.$/,
  ],
  [
    'Capability',
    /^`Tabletop \/ Verified physical path \/ Not run` から選ぶ。$/,
  ],
  ['判定 / Decision', /^`Pass \/ Revise and repeat \/ Not run`。$/],
  ['改訂 Pull Request / Revision PR', /^`Not applicable \/ URL`。$/],
  ['再実施 / Repeat', /^`Not run \/ Pass \/ Revise and repeat`。$/],
] as const satisfies readonly (readonly [string, RegExp])[];

const recordFieldViolations = (content: string): readonly string[] => {
  const labels = recordFieldLabels(content);
  const entries = recordFieldEntries(content);
  const unknown = labels.filter(
    (label) => !allowedRecordFieldLabelSet.has(label)
  );
  const missing = allowedRecordFieldLabels.filter(
    (label) => !labels.includes(label)
  );
  const duplicate = allowedRecordFieldLabels.filter(
    (label) => labels.filter((candidate) => candidate === label).length !== 1
  );
  const invalidValues = constrainedRecordFieldValues.flatMap(
    ([label, pattern]) => {
      const entry = entries.find(([candidate]) => candidate === label);
      return entry === undefined || !pattern.test(entry[1])
        ? [`invalid value:${label}`]
        : [];
    }
  );
  const revisionSection =
    content.split('## Kit 改訂入力 / Revision Input')[1] ?? '';
  const revisionRows = revisionSection
    .split('\n')
    .map(markdownTableCells)
    .filter((cells): cells is readonly string[] => cells !== null)
    .map((cells) => cells[0])
    .filter((label) => label !== '分類 / Category');
  const allowedRevisionRows = [
    '文書の場所に迷った / Navigation confusion',
    '手順の意味に迷った / Instruction confusion',
    '続行か停止か判断不能 / Undecidable continue-or-stop step',
    'Product / Research Consent の混同 / Consent confusion',
    '共有内容の説明漏れ / Shared-data omission',
    '20 分削除の説明漏れ / 20-minute deletion omission',
    'バックアップ除外の説明漏れ / backup exclusion omission',
    'QR 再利用禁止の説明漏れ / QR-reuse omission',
    '退出または `no-signal` の圧力 / Exit or `no-signal` pressure',
    'Role または必要端末の判断不能 / Role or device confusion',
    'JA / EN 導線の判断不能 / Locale-flow confusion',
    'Setup の二重実施 / Duplicated setup',
    '`NORMAL END` / `NOT STARTED` / `STOP THIS LOUNGE` の混同 / State-label confusion',
  ] as const;
  const allowedRevisionRowSet: ReadonlySet<string> = new Set(
    allowedRevisionRows
  );
  const revisionUnknown = revisionRows.filter(
    (label) => !allowedRevisionRowSet.has(label)
  );
  const revisionMissing = allowedRevisionRows.filter(
    (label) => !revisionRows.includes(label)
  );
  const forbiddenInputLines = content
    .split('\n')
    .filter((line) =>
      /^(?:[-*]\s+|\|\s*)(?:氏名|name|連絡先|contact|会場|venue|location|端末 ID|device ID|participant ID|lounge ID|passport|bridge|会話|conversation|incident content)\s*(?:\/[^:|]+)?\s*(?::|\|)/i.test(
        line.trim()
      )
    );
  return [
    ...unknown.map((label) => `unknown:${label}`),
    ...missing.map((label) => `missing:${label}`),
    ...duplicate.map((label) => `not unique:${label}`),
    ...invalidValues,
    ...revisionUnknown.map((label) => `unknown revision category:${label}`),
    ...revisionMissing.map((label) => `missing revision category:${label}`),
    ...forbiddenInputLines.map((line) => `forbidden input:${line.trim()}`),
  ];
};

const markdownAnchor = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .replaceAll(' ', '-');

const anchorsIn = (content: string): ReadonlySet<string> =>
  new Set(
    [...content.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((match) =>
      markdownAnchor(match[1])
    )
  );

const unsafeLinkReason = (
  sourcePath: string,
  destination: string
): string | null => {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(destination) ||
    destination.startsWith('//')
  ) {
    return 'external or scheme URL';
  }
  const [pathPart] = destination.split('#', 1);
  if (pathPart.startsWith('/') || isAbsolute(pathPart)) return 'absolute path';
  if (
    pathPart !== '' &&
    !pathPart.startsWith('./') &&
    !pathPart.startsWith('../')
  ) {
    return 'non-relative repository path';
  }
  const resolvedPath =
    pathPart === '' ? sourcePath : resolve(dirname(sourcePath), pathPart);
  const repositoryRelative = relative(repositoryRoot, resolvedPath);
  if (
    repositoryRelative === '..' ||
    repositoryRelative.startsWith(`..${sep}`) ||
    isAbsolute(repositoryRelative)
  ) {
    return 'repository escape';
  }
  return null;
};

describe('Facilitator Kit 文書契約', () => {
  it('日本語と英語の Guide、Checklist、QR 掲示物を同じ Version で提供する', async () => {
    const pairedDocuments = [
      ['guide.ja.md', 'guide.en.md'],
      ['one-page-checklist.ja.md', 'one-page-checklist.en.md'],
      ['qr-poster.ja.md', 'qr-poster.en.md'],
      ['walkthrough.ja.md', 'walkthrough.en.md'],
    ] as const;

    for (const pair of pairedDocuments) {
      const [japanese, english] = await Promise.all(pair.map(readKit));
      expect(japanese).toContain('Kit Version: 1.0');
      expect(english).toContain('Kit Version: 1.0');
    }
  });

  it('未検証時の Walkthrough が Product 操作へ進まず JA と EN で安全に完了する', async () => {
    const [index, japanese, english] = await Promise.all([
      readKit('README.md'),
      readKit('walkthrough.ja.md'),
      readKit('walkthrough.en.md'),
    ]);

    expectTerms(index, [
      '[日本語 Walkthrough](./walkthrough.ja.md)',
      '[English Walkthrough](./walkthrough.en.md)',
    ]);
    expectTerms(japanese, [
      'Product セッションを開始しない',
      '実参加者の情報を入力しない',
      '実 QR を生成または読み取らない',
      'Nearby Transport を開始しない',
      'すべて `Not run` のまま',
      'Walkthrough 完了',
    ]);
    expectTerms(english, [
      'Do not start a Product Lounge',
      'Enter no real participant information',
      'Do not create or scan a real QR',
      'Do not start Nearby Transport',
      'Keep every physical capability `Not run`',
      'Walkthrough complete',
    ]);
    for (const content of [japanese, english]) {
      expect(content).not.toContain('P6');
      expect(content).not.toContain('R8');
    }
  });

  it('Support Matrix が未検証の実機能力と Verified 移行証跡を区別する', async () => {
    const index = await readKit('README.md');

    expectTerms(index, [
      'iOS / Android の実 Camera QR',
      'Nearby Transport Adapter',
      'Rules Provider',
      'Local Model',
      '2〜6 台の Group Lounge',
      'Host Loss と端末別破棄完了表示',
      'A4 / Letter 1 Page と QR Poster の出力',
      '未経験者による Kit Dry Run',
      '`Not run`',
      'App Commit / Build ID',
      'OS と Device 範囲',
      '検証月',
      '証跡 URL',
      'Issue の Close だけを実機 Evidence にしない',
    ]);
    expect(supportMatrixViolations(index)).toEqual([]);

    const incorrectlyVerified = index.replace(
      '| iOS / Android の実 Camera QR | Build / OS / Device 未指定 | `Not run` |',
      '| iOS / Android の実 Camera QR | Build / OS / Device 未指定 | Verified |'
    );
    expect(supportMatrixViolations(incorrectlyVerified)).toContain(
      'iOS / Android の実 Camera QR: status must be `Not run`'
    );
    const incorrectlyVerifiedEnglish = index.replace(
      '| Real iOS / Android camera QR | Build / OS / device unspecified | `Not run` |',
      '| Real iOS / Android camera QR | Build / OS / device unspecified | Verified |'
    );
    expect(supportMatrixViolations(incorrectlyVerifiedEnglish)).toContain(
      'Real iOS / Android camera QR: status must be `Not run`'
    );
    const inventedCapability = index.replace(
      '## 現場で使う文書',
      '| Participant Registry | Event | Verified | Stored centrally. |\n\n## 現場で使う文書'
    );
    expect(supportMatrixViolations(inventedCapability)).toContain(
      'Participant Registry: unexpected capability row'
    );
  });

  it('両 Guide が時間枠、6 必須 Recovery、4 QR Recovery を欠落なく持つ', async () => {
    const [japanese, english] = await Promise.all([
      readKit('guide.ja.md'),
      readKit('guide.en.md'),
    ]);

    expectTerms(japanese, [
      '60 秒紹介',
      '5 分 Setup',
      '20 分セッション Script',
      '30 / 60 / 90 分',
      'Internet 無し',
      'Camera 拒否',
      '参加者不足',
      '満員',
      'Host Loss',
      'Model 無し',
      '不正形式',
      '重複または使用済み QR',
      '期限切れ QR',
      '別 Group または非対応 Version',
    ]);
    expectTerms(english, [
      '60-second introduction',
      'Five-minute setup',
      '20-minute Lounge script',
      '30 / 60 / 90 minute',
      'No Internet',
      'Camera denied',
      'Too few participants',
      'Full group',
      'Host loss',
      'No model',
      'invalid QR',
      'Duplicate or used QR',
      'Expired QR',
      'Wrong-group or unsupported-version QR',
    ]);
  });

  it('Guide と Checklist の JA と EN が P0〜P10 と R1〜R10 を共有する', async () => {
    const documents = await Promise.all([
      readKit('guide.ja.md'),
      readKit('guide.en.md'),
      readKit('one-page-checklist.ja.md'),
      readKit('one-page-checklist.en.md'),
    ]);

    for (const content of documents) {
      for (let action = 0; action <= 10; action += 1) {
        expect(content).toContain(`P${action}`);
      }
      for (let recovery = 1; recovery <= 10; recovery += 1) {
        expect(content).toContain(`R${recovery}`);
      }
    }

    expectTerms(documents[0], [
      'Host 以外の Participant ごとに',
      'Verified なら Product セッションへ進め、`Not run` なら Walkthrough だけに限定した',
      'Product 参加は `NOT STARTED`',
      '全残存端末で「この Lounge のデータを端末から破棄しました」を確認',
      '旧 Invite / Handshake だけを Dispose',
      '受理済み Membership',
    ]);
    expectTerms(documents[1], [
      'For each non-Host participant',
      'Verified allows a Product Lounge; `Not run` limits the path to a walkthrough',
      'Product participation is `NOT STARTED`',
      'Confirm “Discarded this Lounge’s data from this device” on every remaining device',
      'disposes only the old Invite / Handshake',
      'retains authenticated membership',
    ]);
    expectTerms(documents[2], [
      'Host を含む合計 2〜6 名',
      '1 名だけの場合は\n  Walkthrough',
      '1 名ずつ fresh Invite',
      'Product 参加は `NOT STARTED`',
      '全残存端末の破棄完了表示',
      '旧 Invite / Handshake だけを破棄',
      '受理済み Membership',
    ]);
    expectTerms(documents[3], [
      'Two to six people in total, including the Host',
      'If only one\n  person is present, use a walkthrough',
      'one fresh Invite to each non-Host participant in turn',
      'Product participation is `NOT STARTED`',
      'every remaining device shows discard completion',
      'Dispose only the old Invite / Handshake',
      'retain accepted membership',
    ]);
  });

  it('Product の Preview と Research Consent を別の判断として案内する', async () => {
    const [japanese, english] = await Promise.all([
      readKit('guide.ja.md'),
      readKit('guide.en.md'),
    ]);

    expectTerms(japanese, [
      'Research の判断は',
      '別の Script で尋ねます',
      'Product 共有 Preview',
    ]);
    expectTerms(english, [
      'research choice is asked with another script',
      'Product sharing Preview',
    ]);
    expect(japanese).not.toContain(
      '共有または\n> Research を断っても不利益はありません。続けますか'
    );
    expect(english).not.toContain('Do you want to continue?');
    expect(consentContractViolations(japanese)).toEqual([]);
    expect(consentContractViolations(english)).toEqual([]);

    const combinedConsent = english.replace(
      'Research consent never replaces Product consent.',
      'Research Consent replaces Product Consent.'
    );
    expect(consentContractViolations(combinedConsent)).not.toEqual([]);
    const combinedJapaneseConsent = japanese.replace(
      'Research Consent を Product Consent の代わりに使わない。',
      'Research Consent を Product Consent の代わりに使う。'
    );
    expect(consentContractViolations(combinedJapaneseConsent)).not.toEqual([]);
    expect(
      consentContractViolations(
        `${english}\nProduct Consent includes Research Consent.`
      )
    ).not.toEqual([]);
    expect(
      consentContractViolations(
        `${japanese}\nProduct Consent で Research Consent を許可します。`
      )
    ).not.toEqual([]);
    expect(
      consentContractViolations(
        `${english}\nUse Product Consent instead of Research Consent.`
      )
    ).not.toEqual([]);
    expect(
      consentContractViolations(
        `${japanese}\nProduct Consent を Research Consent の代わりに使う。`
      )
    ).not.toEqual([]);
  });

  it('Setup を Invite 前の 1 回に限定し 3 状態と個人退出を区別する', async () => {
    const [japanese, english] = await Promise.all([
      readKit('guide.ja.md'),
      readKit('guide.en.md'),
    ]);

    expectTerms(japanese, [
      'Setup は 1 回だけ実施',
      '`P6` で現在の Invite を生成した時点から始まる',
      '`NORMAL END`',
      '`NOT STARTED`',
      '`STOP THIS LOUNGE`',
      '退出する本人を他の端末の終了まで待たせない',
      '2 名以上が接続し、接続中 Participant 全員が自分で Ready を選ぶまで開始しない',
      'Host 以外の Participant ごとに',
      'Secret を Rotate した別の fresh Invite',
      '退出者の現在 Data だけを直ちに破棄',
      'Host の退出は',
      '`R5` Host Loss',
    ]);
    expectTerms(english, [
      'Run this setup once',
      'clock starts when `P6` creates the current Invite',
      '`NORMAL END`',
      '`NOT STARTED`',
      '`STOP THIS LOUNGE`',
      'never make that person wait for other devices to end',
      'at least two participants are connected and every connected participant has chosen Ready themselves',
      'For each non-Host participant',
      'rotate its Secret to display a different fresh Invite',
      "discard only that person's current data immediately",
      'A Host exit is not an individual exit',
    ]);
    expect(japanese).not.toContain(
      '20 分満了、Host 終了、個人退出のどれかが先に起きたら'
    );
    expect(english).not.toContain(
      '20-minute expiry, Host end, or an individual exit happens first'
    );
  });

  it('English の開催前 Gate と Dry Run Record が日本語説明なしで判断できる', async () => {
    const [index, englishGuide, englishChecklist, record] = await Promise.all([
      readKit('README.md'),
      readKit('guide.en.md'),
      readKit('one-page-checklist.en.md'),
      readKit('dry-run-record.md'),
    ]);

    expectTerms(index, [
      'Kit Version 1.0 Support Matrix English',
      'Real iOS / Android camera QR',
      'Nearby Transport Adapter',
      'Two-to-six-device Group Lounge',
      'Host loss and per-device discard confirmation',
      'A4 / Letter one-page and QR Poster output',
      'Kit Dry Run by an inexperienced person',
      'Closing an issue alone is not physical-device evidence',
    ]);
    expect(englishGuide).toContain('#kit-version-10-support-matrix-english');
    expect(englishChecklist).toContain(
      '#kit-version-10-support-matrix-english'
    );
    expectTerms(record, [
      'One inexperienced person who did not design, implement, or write the Kit',
      'Choose one range',
      'Did not begin `P7` until at least two participants were connected',
      'App Build ID / Version',
      'Read-aloud Locale',
      'Within 30 minutes',
      '60-second introduction',
      'Five-minute setup',
      'Recovery Decisions',
      'Write counts only',
      '`Pass` proves only that the Kit can be understood',
    ]);
  });

  it('両 Guide と Checklist が共有、20 分削除、Backup 除外を説明する', async () => {
    const [japaneseGuide, englishGuide, japaneseChecklist, englishChecklist] =
      await Promise.all([
        readKit('guide.ja.md'),
        readKit('guide.en.md'),
        readKit('one-page-checklist.ja.md'),
        readKit('one-page-checklist.en.md'),
      ]);

    for (const content of [japaneseGuide, japaneseChecklist]) {
      expectTerms(content, [
        'Public Passport',
        'Pet Emoji',
        '20',
        'バックアップ',
        'Owner Answer',
        'Bridge',
        '`no-signal`',
        'GGUF',
      ]);
    }
    for (const content of [englishGuide, englishChecklist]) {
      expectTerms(content, [
        'Public Passport',
        'Pet Emoji',
        '20',
        'backup',
        'Owner Answer',
        'Bridge',
        '`no-signal`',
        'GGUF',
      ]);
    }
  });

  it('Champion 運用が公開情報、非ランキング、30 分 Orientation、辞退と削除要求を明記する', async () => {
    const [japanese, english] = await Promise.all([
      readKit('guide.ja.md'),
      readKit('guide.en.md'),
    ]);

    expectTerms(japanese, [
      '公開 Event',
      'Score',
      '順位付け',
      '同期 Orientation は 30 分以内',
      '理由なしで辞退',
      '削除を依頼',
      '中央 Champion Registry',
    ]);
    expectTerms(english, [
      'public Cloud / CTF / education events',
      'Never score, rank, or compare',
      'within 30 minutes',
      'decline without a reason',
      'request deletion',
      'central Champion registry',
    ]);
    expect(championContractViolations(japanese)).toEqual([]);
    expect(championContractViolations(english)).toEqual([]);

    const rankedChampion = english.replace(
      'Never score, rank, or compare the answers.',
      'Score, rank, or compare the answers.'
    );
    expect(championContractViolations(rankedChampion)).not.toEqual([]);
  });

  it('QR 掲示物が静的 Invite と Secret 手入力を拒否する', async () => {
    const [japanese, english] = await Promise.all([
      readKit('qr-poster.ja.md'),
      readKit('qr-poster.en.md'),
    ]);

    expectTerms(japanese, [
      '今、自分 1 名のためにアプリで表示している fresh QR',
      '事前印刷',
      'Secret を手入力',
      '同じ QR を複数人で Scan しません',
    ]);
    expectTerms(english, [
      'displaying in the app now',
      'Never paste or print',
      'type the secret',
      'Never let multiple people scan the same QR',
    ]);
    expect(qrPosterViolations(japanese)).toEqual([]);
    expect(qrPosterViolations(english)).toEqual([]);

    expect(qrPosterViolations(`${english}\n${QR_PROTOCOL_PREFIX}{}`)).toContain(
      'protocol payload'
    );
    expect(
      qrPosterViolations(`${english}\n![QR](data:image/png;base64,AA)`)
    ).toEqual(expect.arrayContaining(['Markdown image', 'image data URL']));
    expect(
      qrPosterViolations(`${english}\n<svg aria-label="QR"></svg>`)
    ).toContain('HTML SVG');
    expect(
      qrPosterViolations(`${english}\nJoin Secret: ${'a'.repeat(64)}`)
    ).toEqual(
      expect.arrayContaining(['64-digit secret value', 'secret input field'])
    );
    const brandedJoinSecret = `jsc_${'a'.repeat(64)}`;
    expect(
      qrPosterViolations(`${english}\nJoin Secret: ${brandedJoinSecret}`)
    ).toEqual(
      expect.arrayContaining([
        'branded Join Secret value',
        'secret input field',
      ])
    );
  });

  it('Dry Run を実在者の未完了 Gate とし改訂入力を分類だけに限定する', async () => {
    const [record, design, productManagerReview] = await Promise.all([
      readKit('dry-run-record.md'),
      readFile(
        join(
          repositoryRoot,
          'docs/design/facilitator-kit-and-local-champion.md'
        ),
        'utf8'
      ),
      readFile(
        join(repositoryRoot, 'docs/specs/facilitator-kit-pm-review.md'),
        'utf8'
      ),
    ]);

    expectTerms(record, [
      'Current Status: `Not run`',
      'Repository Test で代替しない',
      '6〜10 分',
      '判断不能',
      'Product / Research Consent の混同',
      '共有内容の説明漏れ',
      '20 分削除の説明漏れ',
      'バックアップ除外の説明漏れ',
      '`P0`〜`P10`',
      '`R1`〜`R10`',
      'App Build ID / Version',
      '読み上げ Locale / Read-aloud Locale',
      '30 分以内 / 30 分超 / Not run',
      '60 秒紹介 / 60-second introduction',
      '5 分 Setup / Five-minute setup',
      'Recovery 判断 / Recovery Decisions',
      'Setup の二重実施',
      'Revise and repeat',
    ]);
    expect(design).toContain(
      '2 名以上が接続し、接続中の全 Participant が自分で Ready を選ぶまで `P7` へ進まない'
    );
    expectTerms(productManagerReview, [
      '`口頭補足 / Oral hints after start` は `0 / 1 or more` だけを保持',
      '`1 or more` は\n  `Revise and repeat` を必須',
      '`Capability` は `Tabletop / Verified physical path / Not run` だけを保持',
      'Dry Run の結果から推測しない',
    ]);
    expect(recordFieldViolations(record)).toEqual([]);
    for (let recovery = 1; recovery <= 10; recovery += 1) {
      expect(findTableRow(record, `\`R${recovery}\``)).toEqual([
        `\`R${recovery}\``,
        '`Not run`',
      ]);
    }

    const recordWithNameField = record.replace(
      '## 完了 Check / Completion Check',
      '- 氏名 / Name: `________________`。\n\n## 完了 Check / Completion Check'
    );
    expect(recordFieldViolations(recordWithNameField)).toContain(
      'unknown:氏名 / Name'
    );
    const recordWithFreeText = record.replace(
      '| 文書の場所に迷った / Navigation confusion |  |',
      '| 自由記述 / Free-text notes |  |\n| 文書の場所に迷った / Navigation confusion |  |'
    );
    expect(recordFieldViolations(recordWithFreeText)).toContain(
      'unknown revision category:自由記述 / Free-text notes'
    );
    const recordWithDuplicateStatus = record.replace(
      '- Current Status: `Not run`。',
      '- Current Status: `Not run`。\n- Current Status: `Pass`。'
    );
    expect(recordFieldViolations(recordWithDuplicateStatus)).toContain(
      'not unique:Current Status'
    );
    const recordWithInvalidStatus = record.replace(
      '- Current Status: `Not run`。',
      '- Current Status: `Pass`。'
    );
    expect(recordFieldViolations(recordWithInvalidStatus)).toContain(
      'invalid value:Current Status'
    );
    const recordWithFreeTextCapability = record.replace(
      '- Capability: `Tabletop / Verified physical path / Not run` から選ぶ。',
      '- Capability: Camera worked well.'
    );
    expect(recordFieldViolations(recordWithFreeTextCapability)).toContain(
      'invalid value:Capability'
    );
    const recordWithFreeTextHints = record.replace(
      '- 口頭補足 / Oral hints after start: `0 件 / 1 件以上` または `0 / 1 or more` から選ぶ / Choose one.',
      '- 口頭補足 / Oral hints after start: Participant needed help.'
    );
    expect(recordFieldViolations(recordWithFreeTextHints)).toContain(
      'invalid value:口頭補足 / Oral hints after start'
    );
    const recordWithEmptyCapability = record.replace(
      '- Capability: `Tabletop / Verified physical path / Not run` から選ぶ。',
      '- Capability:'
    );
    expect(recordFieldViolations(recordWithEmptyCapability)).toContain(
      'invalid value:Capability'
    );
    const recordWithEmptyHints = record.replace(
      '- 口頭補足 / Oral hints after start: `0 件 / 1 件以上` または `0 / 1 or more` から選ぶ / Choose one.',
      '- 口頭補足 / Oral hints after start:'
    );
    expect(recordFieldViolations(recordWithEmptyHints)).toContain(
      'invalid value:口頭補足 / Oral hints after start'
    );
  });

  it('全 Kit 文書の Link が Repository 内相対 Path と実在 Fragment だけへ到達する', async () => {
    let linkCount = 0;

    for (const fileName of kitDocuments) {
      const sourcePath = join(kitRoot, fileName);
      const content = await readKit(fileName);
      expect(content).not.toMatch(/\b[a-z][a-z0-9+.-]*:\/\//i);
      expect(content).not.toMatch(/^\s*\[[^\]]+\]:\s*/m);
      expect(content).not.toMatch(/<a\s+[^>]*href=/i);
      const links = [...content.matchAll(/\]\(([^)]+)\)/g)];
      for (const [, destination] of links) {
        expect(unsafeLinkReason(sourcePath, destination)).toBeNull();
        const [pathPart, rawFragment] = destination.split('#', 2);
        const linkedPath =
          pathPart === '' ? sourcePath : resolve(dirname(sourcePath), pathPart);
        expect((await stat(linkedPath)).isFile()).toBe(true);
        const canonicalPath = await realpath(linkedPath);
        const canonicalRelative = relative(repositoryRoot, canonicalPath);
        expect(canonicalRelative).not.toBe('..');
        expect(canonicalRelative.startsWith(`..${sep}`)).toBe(false);
        expect(isAbsolute(canonicalRelative)).toBe(false);
        if (rawFragment !== undefined && rawFragment !== '') {
          const linkedContent = await readFile(canonicalPath, 'utf8');
          expect(
            anchorsIn(linkedContent).has(decodeURIComponent(rawFragment))
          ).toBe(true);
        }
        linkCount += 1;
      }
    }

    expect(linkCount).toBeGreaterThanOrEqual(20);
    expect(
      unsafeLinkReason(join(kitRoot, 'README.md'), 'https://example.com')
    ).toBe('external or scheme URL');
    expect(
      unsafeLinkReason(join(kitRoot, 'README.md'), '../../../../etc/passwd')
    ).toBe('repository escape');
  });
});
