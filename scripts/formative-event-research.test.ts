import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  markdownTable,
  markdownSection as section,
} from './markdown-test-contract';

const researchRoot = join(import.meta.dir, '..', 'docs', 'research');
const privacyRoot = join(import.meta.dir, '..', 'docs', 'privacy');
const securityRoot = join(import.meta.dir, '..', 'docs', 'security');
const adrRoot = join(import.meta.dir, '..', 'docs', 'adr');

const readResearchDocument = (fileName: string): Promise<string> =>
  Bun.file(join(researchRoot, fileName)).text();

const readPrivacyDocument = (fileName: string): Promise<string> =>
  Bun.file(join(privacyRoot, fileName)).text();

const requiredRow = (
  rows: readonly (readonly string[])[],
  firstCell: string
): readonly string[] => {
  const matches = rows.filter((row) => row[0] === firstCell);
  expect(matches).toHaveLength(1);
  const row = matches[0];
  if (row === undefined)
    throw new Error(`必須 Table 行がありません: ${firstCell}`);
  return row;
};

const journeyStages = [
  'Arrival',
  'Passport setup',
  'Lounge join',
  'Pet exchange',
  'Owner Question',
  'Bridge or `no-signal`',
  'Human conversation',
  'Exit',
];

const failureCases = [
  'F1 Network unavailable',
  'F2 QR scan failure',
  'F3 Owner Question declined',
  'F4 `no-signal`',
  'F5 Early exit',
  'F6 Screen closed',
];

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
    const [
      guide,
      consentJa,
      consentEn,
      blueprint,
      inventory,
      retention,
      threatModel,
      adr,
    ] = await Promise.all([
      readResearchDocument('interview-guide.md'),
      readResearchDocument('formative-consent-script.ja.md'),
      readResearchDocument('formative-consent-script.en.md'),
      readResearchDocument('service-blueprint.md'),
      readPrivacyDocument('data-inventory.md'),
      readPrivacyDocument('retention-policy.md'),
      Bun.file(join(securityRoot, 'threat-model.md')).text(),
      Bun.file(
        join(adrRoot, '0025-formative-research-data-boundary.md')
      ).text(),
    ]);
    const allowlist = markdownTable(guide, 'Temporary coded record allowlist');
    const canonicalL6 = markdownTable(
      inventory,
      'L6 Temporary Coded Record allowlist'
    );
    const canonicalL6P = markdownTable(
      inventory,
      'L6P Public Aggregate allowlist'
    );

    expect(allowlist).toEqual({
      header: ['Field', 'Allowed value'],
      rows: [
        ['Role cohort', '`participant` / `event-organizer`'],
        ['Locale cohort', '`ja` / `en` / `approved-other`'],
        ['Journey stage', 'Interview Guide の 8 Stage のいずれかである。'],
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
    expect(allowlist).toEqual(canonicalL6);
    expect(canonicalL6P).toEqual({
      header: ['Field', 'Allowed value'],
      rows: [
        ['Journey stage', '`L6` の Journey stage だけである。'],
        ['Outcome class', '`L6` の Outcome class だけである。'],
        ['Behavior code', '`L6` の Behavior code だけである。'],
        [
          'Evidence direction',
          '`supporting` / `contradicting` / `not-observed`',
        ],
        ['Hypothesis reference', '`H1`〜`H5` / `none` である。'],
        [
          'Sanitized pattern summary',
          '上の固定 Code だけから作る 140 UTF-16 code unit 以下の要約である。参加者の回答や会話に由来する自由記述を使わない。',
        ],
      ],
    });

    const classifications = markdownTable(inventory, 'データ分類');
    expect(
      requiredRow(
        classifications.rows,
        '`L6` 管理された Formative Research Record'
      )[2]
    ).toContain('Repository、Issue、PR、Cloud Analytics へ保存しない');
    expect(
      requiredRow(
        classifications.rows,
        '`L6P` 公開 Formative Research Aggregate'
      )[2]
    ).toContain('公開 Repository と Review PR');

    const inventoryRows = markdownTable(inventory, '全データ種別').rows;
    const temporaryRecord = requiredRow(
      inventoryRows,
      'Formative Event Temporary Coded Record'
    );
    expect(temporaryRecord[6]).toContain('7 日以内');
    expect(temporaryRecord[7]).toContain('撤回');
    expect(temporaryRecord[7]).toContain('Record 全体を削除');
    const publicAggregate = requiredRow(
      inventoryRows,
      'Sanitized Formative Event Public Aggregate'
    );
    expect(publicAggregate[3]).toContain('140 文字以内');
    expect(publicAggregate[3]).toContain('正確な人数');
    expect(publicAggregate[3]).toContain('個別 Record');

    const retentionRows = markdownTable(retention, 'データ種別ごとの保持').rows;
    expect(
      requiredRow(retentionRows, 'Formative Event Temporary Coded Record')[1]
    ).toContain('7 日以内');
    expect(
      requiredRow(
        retentionRows,
        'Sanitized Formative Event Public Aggregate'
      )[4]
    ).toContain('140 文字以内');

    const trustBoundary = requiredRow(
      markdownTable(threatModel, '信頼境界').rows,
      'Formative Researcher と参加者'
    );
    expect(trustBoundary[3]).toContain('撤回時即時削除');
    const risks = markdownTable(threatModel, 'リスク評価').rows;
    expect(requiredRow(risks, 'Formative Record の過剰収集と保持')[4]).toBe(
      '高である。'
    );
    expect(
      requiredRow(risks, 'Formative Public Aggregate からの再識別')[4]
    ).toBe('高である。');
    const mitigations = markdownTable(threatModel, '脅威別の対策').rows;
    expect(
      requiredRow(mitigations, 'Formative Record の過剰収集と保持')[3]
    ).toContain('Record 全体を即時削除');
    expect(
      requiredRow(mitigations, 'Formative Public Aggregate からの再識別')[1]
    ).toContain('140 文字以内');

    expect(adr).toContain('**Status**: Accepted');
    expect(adr).toContain('`L6` Managed Formative Research Record');
    expect(adr).toContain('`L6P` Public Formative Research Aggregate');
    expect(guide).toContain('../privacy/data-inventory.md');
    expect(consentJa).toContain('../privacy/data-inventory.md');
    expect(consentEn).toContain('../privacy/data-inventory.md');
    expect(guide).toContain('140 UTF-16 code unit 以下');
    expect(consentJa).toContain('140 文字以内');
    expect(consentEn).toContain('no more than 140 characters');
    expect(blueprint).toContain('140 文字以内');
    const lifecycle = section(guide, 'Retention and synthesis');
    expect(lifecycle).toContain('セッション終了から 7 日以内に削除する');
    expect(lifecycle).toContain('3 セッション以上');
    expect(lifecycle).toContain('正確な人数');
    expect(lifecycle).toContain('個別 Record');
    expect(lifecycle).toContain('参加者由来の自由記述を公開しない');
    expect(lifecycle).toContain('独立 Privacy Reviewer');
    expect(guide).toContain(
      'Sensitive Data を誤って書いた場合はその Record 全体を直ちに削除'
    );
  });
});
