import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const researchRoot = join(import.meta.dir, '..', 'docs', 'research');

const readResearchDocument = (fileName: string): Promise<string> =>
  Bun.file(join(researchRoot, fileName)).text();

interface MarkdownTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function section(document: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = document.indexOf(marker);
  if (start < 0) {
    throw new Error(`必須 Section がありません: ${heading}`);
  }
  const remainder = document.slice(start + marker.length);
  const nextHeading = remainder.indexOf('\n## ');
  return nextHeading < 0 ? remainder : remainder.slice(0, nextHeading);
}

function markdownTable(document: string, heading: string): MarkdownTable {
  const lines = section(document, heading)
    .split('\n')
    .filter((line) => line.startsWith('|') && line.endsWith('|'));
  if (lines.length < 2) {
    throw new Error(`必須 Table がありません: ${heading}`);
  }
  const parseRow = (line: string): readonly string[] =>
    line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
  return {
    header: parseRow(lines[0]),
    rows: lines.slice(2).map(parseRow),
  };
}

const journeyStages = [
  'Arrival',
  'Passport setup',
  'Lounge join',
  'Pet exchange',
  'Owner Question',
  'Bridge or `no-signal`',
  'Human conversation',
  'Exit',
] as const;

const failureCases = [
  'F1 Network unavailable',
  'F2 QR scan failure',
  'F3 Owner Question declined',
  'F4 `no-signal`',
  'F5 Early exit',
  'F6 Screen closed',
] as const;

describe('形成的イベント調査文書契約', () => {
  it('調査ガイドが 2 言語の Consent と最低実証数を固定する', async () => {
    const [guide, consentJa, consentEn] = await Promise.all([
      readResearchDocument('interview-guide.md'),
      readResearchDocument('formative-consent-script.ja.md'),
      readResearchDocument('formative-consent-script.en.md'),
    ]);
    const gate = markdownTable(guide, 'Minimum evidence gate');
    const participantJa = markdownTable(guide, 'Participant track');
    const participantEn = markdownTable(
      guide,
      'Participant prompts in English'
    );

    expect(gate).toEqual({
      header: ['Cohort', 'Minimum completed sessions'],
      rows: [
        ['Participant', '4'],
        ['Event organizer', '4'],
        ['Locale cohorts', '2'],
      ],
    });
    expect(guide).toContain('./formative-consent-script.ja.md');
    expect(guide).toContain('./formative-consent-script.en.md');
    expect(guide).toContain('## English prompt set');
    expect(participantJa.rows.map((row) => row[0])).toEqual(journeyStages);
    expect(participantEn.rows.map((row) => row[0])).toEqual(journeyStages);
    const englishPrompts = section(guide, 'English prompt set');
    for (const failureCase of failureCases) {
      expect(englishPrompts).toContain(failureCase.replace(/^F\d /, ''));
    }
    for (const document of [guide, consentJa, consentEn]) {
      expect(document).toContain('Research execution: `Not run`');
      expect(document).toContain('FORMATIVE-EVENT-RESEARCH-1');
    }
    expect(consentJa).toContain('完全な匿名性を保証できません');
    expect(consentJa).toContain('セッションを閉じる確認を受ける前まで');
    expect(consentJa).toContain('遅くともセッションから 7 日以内');
    expect(consentJa).toContain('公開 Repository');
    expect(consentJa).toContain('支持・反証・未観察の区分');
    expect(consentJa).toContain('Pilot Counter、Pilot Observation Sheet');
    expect(consentEn).toContain('complete anonymity cannot be guaranteed');
    expect(consentEn).toContain(
      'until the researcher asks to close this session'
    );
    expect(consentEn).toContain('no later than seven days after this session');
    expect(consentEn).toContain('public repository');
    expect(consentEn).toContain('evidence direction');
    expect(consentEn).toContain('Pilot counters, the Pilot Observation Sheet');
    expect(guide).not.toContain('- [x]');
  });

  it('Service Blueprint の 4 責務層と全 Status を調査前に固定する', async () => {
    const blueprint = await readResearchDocument('service-blueprint.md');
    const journey = markdownTable(blueprint, 'One-page journey blueprint');
    const failures = markdownTable(blueprint, 'Failure cards under study');

    expect(journey.header).toEqual([
      'Journey stage',
      'Participant experience',
      'Facilitator work',
      'On-device processing',
      'Failure and recovery',
      'Evidence status',
    ]);
    expect(journey.rows.map((row) => row[0])).toEqual(journeyStages);
    expect(journey.rows.map((row) => row[5])).toEqual(
      journeyStages.map(() => '`Untested`。')
    );
    expect(failures.header).toEqual([
      'ID',
      'Scenario',
      'Safe contract',
      'Evidence status',
    ]);
    expect(failures.rows.map((row) => row[0])).toEqual(failureCases);
    expect(failures.rows.map((row) => row[3])).toEqual(
      failureCases.map(() => '`Untested`。')
    );
    expect(blueprint).toContain('Research execution: `Not run`');
    expect(blueprint).toContain(
      'Blueprint status: `Hypothesis baseline / Not validated`'
    );
  });

  it('上位 5 仮説を未検証かつ反証可能な状態に限定する', async () => {
    const hypotheses = await readResearchDocument('hypotheses.md');
    const ranked = markdownTable(hypotheses, 'Ranked falsifiable hypotheses');

    expect(ranked.rows.map((row) => row[0])).toEqual([
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
    ]);
    for (const row of ranked.rows) {
      expect(row).toHaveLength(5);
      expect(row[3]).toContain('Disconfirm when');
      expect(row[4]).toBe('`Untested`');
    }
    expect(hypotheses).toContain('Research execution: `Not run`');
    expect(hypotheses).toContain(
      'No design-change Issue is justified before field evidence'
    );
  });

  it('一時 Record の Field 集合と Privacy Lifecycle を完全一致で固定する', async () => {
    const guide = await readResearchDocument('interview-guide.md');
    const allowlist = markdownTable(guide, 'Temporary coded record allowlist');

    expect(allowlist).toEqual({
      header: ['Field', 'Allowed value'],
      rows: [
        ['Role cohort', '`participant` / `event-organizer`'],
        ['Locale cohort', '`ja` / `en` / `approved-other`'],
        ['Journey stage', '本書の 8 Stage のいずれかである。'],
        [
          'Outcome class',
          '`continued` / `recovered` / `declined` / `exited` / `blocked`',
        ],
        [
          'Behavior code',
          '`self-directed` / `neutral-repeat-needed` / `help-requested` / `privacy-confusion` / `recovery-chosen` / `stop-chosen`',
        ],
        [
          'Evidence direction',
          '`supporting` / `contradicting` / `not-observed`',
        ],
        ['Hypothesis reference', '`H1`〜`H5` / `none` である。'],
      ],
    });
    const lifecycle = section(guide, 'Retention and synthesis');
    expect(lifecycle).toContain('セッション終了から 7 日以内に削除する');
    expect(lifecycle).toContain('3 セッション以上');
    expect(lifecycle).toContain('正確な人数、個別 Record を公開しない');
    expect(lifecycle).toContain('独立 Privacy Reviewer');
    expect(guide).toContain(
      'Sensitive Data を誤って書いた場合はその Record 全体を直ちに削除'
    );
  });
});
