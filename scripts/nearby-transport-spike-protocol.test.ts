import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { markdownSection, markdownTable } from './markdown-test-contract';
import {
  nearbyTransportStaticScreeningRecordRows,
  parseNearbyTransportStaticScreening,
  summarizeNearbyTransportStaticScreening,
} from './nearby-transport-static-screening';

const repositoryRoot = join(import.meta.dir, '..');

const readRepositoryDocument = (relativePath: string): Promise<string> =>
  Bun.file(join(repositoryRoot, relativePath)).text();

const isNotRun = (value: string): boolean => value === '`Not run`';

const candidates = [
  'mDNS + Local WebSocket / Secure Channel',
  'WebRTC DataChannel + QR Signaling',
  'Platform Adapter (Multipeer / Nearby)',
  'BLE Custom Protocol (comparison only)',
];

const staticGates = [
  'Official source and version',
  'Cross-platform route',
  'Expo and New Architecture',
  'Standard secure channel',
  'License and maintenance',
  'Application-controlled telemetry',
  'Topology and discovery',
];

const physicalGates = [
  'iOS and Android interoperability',
  'Offline network',
  'Encryption and peer authentication',
  'Join experience',
  'Group lifecycle',
  'Discovery recovery',
  'Background and reconnect',
  'Expo and New Architecture',
  'Supply chain',
  'Privacy and telemetry',
];

const lifecycleScenarios = [
  'QR to Ready operations',
  'Permission explanation',
  'Permission denied',
  'Permission restored',
  'Background then foreground',
  'Network switch',
  'Hotspot disconnect',
  'Target routing',
  'Guest leave',
  'Dispose',
];

const joinRows = [
  ['Same Wi-Fi', 'iPhone Host → Android Guest', '50'],
  ['Same Wi-Fi', 'Android Host → iPhone Guest', '50'],
  ['Personal Hotspot', 'iPhone Host → Android Guest', '50'],
  ['Personal Hotspot', 'Android Host → iPhone Guest', '50'],
];

describe('Nearby Transport 実機 Spike Protocol 文書契約', () => {
  it('Phase A の全 Candidate と Phase B の単一 Candidate を分離する', async () => {
    const [protocol, record, manifestSource] = await Promise.all([
      readRepositoryDocument('docs/design/nearby-transport-spike-protocol.md'),
      readRepositoryDocument('docs/evidence/nearby-transport-spike-record.md'),
      readRepositoryDocument(
        'docs/evidence/nearby-transport-static-screening.json'
      ),
    ]);
    const screening = parseNearbyTransportStaticScreening(manifestSource);
    const screeningSummary = summarizeNearbyTransportStaticScreening(screening);
    const staticRubric = markdownTable(
      protocol,
      'Phase A static screening rubric'
    );
    const staticRecord = markdownTable(record, 'Static screening record');

    expect(staticRubric.header).toEqual([
      'Static gate',
      'Pass condition',
      'Fail condition',
    ]);
    expect(staticRubric.rows.map((row) => row[0])).toEqual(staticGates);
    expect(staticRecord.header).toEqual([
      'Candidate',
      'Candidate route and version',
      'Official source',
      'Cross-platform route',
      'Expo and New Architecture',
      'Standard secure channel',
      'License, maintenance, provenance',
      'Application-controlled telemetry',
      'Topology and discovery',
      'Static status',
      'Rationale',
    ]);
    expect(staticRecord.rows.map((row) => row[0])).toEqual(candidates);
    expect(screening.candidates.map((candidate) => candidate.name)).toEqual(
      candidates
    );
    expect(staticRecord.rows).toEqual(
      nearbyTransportStaticScreeningRecordRows(screening)
    );
    expect(record).toContain(
      `Static Screening Status: \`${screeningSummary.screeningStatus}\``
    );
    expect(record).toContain('Physical Spike Candidate: `Not selected`');
    expect(record).toContain(
      'Machine-readable 正本: [Static Screening Manifest](./nearby-transport-static-screening.json)'
    );
    expect(protocol).toContain(
      'Phase B へ進めるのは、Static Status が `Pass` の Candidate から理由を記録して選んだ 1 Candidate だけ'
    );
    expect(protocol).toContain('機械的に `Fail` とする');
    expect(protocol).toContain(
      '各 Candidate が `Pass` または `Fail`、かつ 1 Candidate 以上が `Pass`'
    );
    expect(protocol).toContain(
      '未判定または不明が 1 件でもあれば `Fail` の有無にかかわらず `Not run`'
    );
    expect(protocol).toContain(
      'Phase A で正しく棄却した Candidate の\n`Fail` は、通過 Candidate の Phase B 実行を妨げない'
    );
    expect(protocol).toContain(
      'Internet 遮断中の外部 Endpoint 0 件は、この Gate の代替証拠にしない'
    );
    expect(protocol).not.toContain('- Selection Status:');
    expect(protocol).toContain('Evidence Record の Decision record');
  });

  it('Phase B の全 Gate、Lifecycle、方向別 200 Join を同じ Bundle に固定する', async () => {
    const [protocol, record] = await Promise.all([
      readRepositoryDocument('docs/design/nearby-transport-spike-protocol.md'),
      readRepositoryDocument('docs/evidence/nearby-transport-spike-record.md'),
    ]);
    const rubric = markdownTable(
      protocol,
      'Phase B physical evaluation rubric'
    );
    const rubricRecord = markdownTable(record, 'Physical rubric record');
    const scenarios = markdownTable(
      protocol,
      'Lifecycle and permission scenarios'
    );
    const scenarioRecord = markdownTable(
      record,
      'Lifecycle and permission record'
    );
    const joinProtocol = markdownTable(protocol, 'Required join matrix');
    const joinRecord = markdownTable(record, 'Join measurement record');
    const fixtureSummary = markdownTable(
      record,
      'Network fixture summary record'
    );
    const isolationProtocol = markdownTable(
      protocol,
      'Network isolation evidence'
    );
    const isolationRecord = markdownTable(record, 'Network isolation record');

    expect(rubric.rows.map((row) => row[0])).toEqual(physicalGates);
    expect(rubricRecord.rows.map((row) => row[0])).toEqual(physicalGates);
    expect(scenarios.rows.map((row) => row[0])).toEqual(lifecycleScenarios);
    expect(scenarioRecord.rows.map((row) => row[0])).toEqual(
      lifecycleScenarios
    );
    expect(joinProtocol.rows.map((row) => row.slice(0, 3))).toEqual(joinRows);
    expect(joinRecord.rows.map((row) => row.slice(0, 3))).toEqual(joinRows);
    expect(fixtureSummary.rows.map((row) => row.slice(0, 2))).toEqual([
      ['Same Wi-Fi', '100'],
      ['Personal Hotspot', '100'],
    ]);
    expect(isolationProtocol.rows.map((row) => row[0])).toEqual([
      'Reachability before',
      'Reachability after',
      'Public DNS queries',
      'External endpoints',
    ]);
    expect(isolationRecord.rows.map((row) => row.slice(0, 2))).toEqual([
      ['Same Wi-Fi', '`physical-iphone`'],
      ['Same Wi-Fi', '`physical-android`'],
      ['Personal Hotspot', '`physical-iphone`'],
      ['Personal Hotspot', '`physical-android`'],
    ]);
    for (const row of rubricRecord.rows) {
      expect(row[1]).not.toBe('`Not run`');
      expect(row[2]).toBe('`Not run`');
    }
    for (const row of scenarioRecord.rows) {
      expect(row.slice(1)).toEqual(row.slice(1).map(() => '`Not run`'));
    }
    for (const row of joinRecord.rows) {
      expect(row.slice(3)).toEqual(row.slice(3).map(() => '`Not run`'));
    }
    for (const row of fixtureSummary.rows) {
      expect(row.slice(2)).toEqual(row.slice(2).map(() => '`Not run`'));
    }
    for (const row of isolationRecord.rows) {
      expect(row.slice(2)).toEqual(row.slice(2).map(() => '`Not run`'));
    }
    expect(protocol).toContain(
      'Network fixture ごとに 100 Attempt、合計 200 Attempt'
    );
    expect(protocol).toContain('Owner 操作は 3 以下');
    expect(protocol).toContain('成功率 99％以上');
    expect(protocol).toContain('p95 10,000 ms 以下');
    expect(protocol).toContain('Ready 後 30 秒以内の Disconnect 0 件');
    expect(protocol).toContain('Network fixture ごとの `Successes / Attempts`');
  });

  it('Candidate、Build、Capture、Analyzer、Review を Evidence Bundle へ結合する', async () => {
    const [protocol, record] = await Promise.all([
      readRepositoryDocument('docs/design/nearby-transport-spike-protocol.md'),
      readRepositoryDocument('docs/evidence/nearby-transport-spike-record.md'),
    ]);
    const binding = markdownTable(protocol, 'Evidence bundle binding');
    const bindingRecord = markdownTable(
      record,
      'Evidence bundle binding record'
    );

    expect(binding.rows.map((row) => row[0])).toEqual([
      'Candidate',
      'Candidate source',
      'Repository source',
      'iOS and Android build',
      'Device class',
      'Analysis',
      'Review',
      'Execution bucket',
    ]);
    expect(bindingRecord.rows.map((row) => row[0])).toEqual([
      'Evidence Bundle ID',
      'Candidate and exact route',
      'Candidate version or OS API version',
      'Candidate source locator',
      'Repository Git commit',
      'iOS public Build ID',
      'iOS artifact SHA-256',
      'iOS OS major',
      'Android public Build ID',
      'Android artifact SHA-256',
      'Android OS major',
      'Analysis script version',
      'Analysis script SHA-256',
      'Sensitive Field Manifest SHA-256',
      'Positive-control Fixture SHA-256',
      'Capture Tool version',
      'Execution Month',
      'Public Review PR',
      'Security and Privacy attestation',
    ]);
    expect(bindingRecord.rows.every((row) => row[1] === '`Not run`')).toBe(
      true
    );
    expect(record).toContain('iOS は `physical-iphone`');
    expect(record).toContain('Android は `physical-android`');
    expect(protocol).toContain(
      'System Framework Candidate は SDK / API version、OS major、公開 Build locator'
    );
    expect(protocol).toContain(
      '非公開の System Framework に\nupstream source commit を要求せず'
    );
    expect(protocol).toContain('結果は別 Bundle とし、合算しない');
    expect(record).not.toContain('Selection Status: `Selected`');
  });

  it('Star、Discovery、暗号負試験、stream 再構成の未実行 Record を固定する', async () => {
    const [protocol, record] = await Promise.all([
      readRepositoryDocument('docs/design/nearby-transport-spike-protocol.md'),
      readRepositoryDocument('docs/evidence/nearby-transport-spike-record.md'),
    ]);
    const star = markdownTable(record, 'Star relay record');
    const recovery = markdownTable(
      record,
      'Discovery-disabled recovery record'
    );
    const security = markdownTable(record, 'Security binding record');
    const capture = markdownTable(record, 'Packet capture record');

    expect(star.rows.map((row) => row[0])).toEqual(['iPhone', 'Android']);
    expect(star.header).toContain('Target');
    expect(recovery.rows.map((row) => row.slice(0, 2))).toEqual([
      ['iPhone', '5'],
      ['Android', '5'],
    ]);
    expect(security.rows.map((row) => row[0])).toEqual([
      'Negotiated protocol and cipher',
      'QR fingerprint equals peer key',
      'Fingerprint mismatch rejected',
      'Untrusted peer key rejected',
      'Expired and replayed QR rejected',
      'Plaintext fallback rejected',
    ]);
    expect(capture.rows.map((row) => row[0])).toEqual([
      'Capture status',
      'Capture SHA-256',
      'Canary set SHA-256',
      'Serialized Envelope set SHA-256',
      'Analyzer positive-control status',
      'Candidate flow packets',
      'Candidate flow bytes',
      'Canary Envelopes sent and received',
      'Capture coverage status',
      'Sensitive Field Manifest coverage',
      'Full Canary matches',
      'Canary fragment matches',
      'Encoded representation matches',
      'External endpoints',
      'Raw L5 retention attestation',
      'Ephemeral volume and sync disabled',
      'Encryption key destroyed',
      'Reviewer verdict',
    ]);
    expect(star.rows.every((row) => row.slice(1).every(isNotRun))).toBe(true);
    expect(recovery.rows.every((row) => row.slice(2).every(isNotRun))).toBe(
      true
    );
    expect(security.rows.every((row) => row.slice(1).every(isNotRun))).toBe(
      true
    );
    expect(capture.rows.every((row) => row[1] === '`Not run`')).toBe(true);
    expect(protocol).toContain('stream へ再構成してから検索する');
    expect(protocol).toContain('16 byte 以上の全断片');
    expect(protocol).toContain('Sensitive Field Manifest');
    expect(protocol).toContain(
      '未分類または未試験 Field が 1 件でもあれば Fail'
    );
    expect(protocol).toContain('Positive-control Fixture');
    expect(protocol).toContain(
      'traffic 0、別 interface、counter 不一致は Fail'
    );
    expect(protocol).toContain(
      'fingerprint mismatch、untrusted peer key、expired / replayed QR、plaintext fallback'
    );
  });

  it('raw L5 と公開 L5P の許可 Field と Lifecycle を Privacy 正本へ一元化する', async () => {
    const [record, inventory, retention, threatModel] = await Promise.all([
      readRepositoryDocument('docs/evidence/nearby-transport-spike-record.md'),
      readRepositoryDocument('docs/privacy/data-inventory.md'),
      readRepositoryDocument('docs/privacy/retention-policy.md'),
      readRepositoryDocument('docs/security/threat-model.md'),
    ]);
    const inventoryTable = markdownTable(inventory, '全データ種別');
    const retentionTable = markdownTable(retention, 'データ種別ごとの保持');
    const evidenceRow = inventoryTable.rows.find(
      (row) => row[0] === 'Sanitized Nearby Transport Spike Evidence Record'
    );
    const evidenceRetention = retentionTable.rows.find(
      (row) => row[0] === 'Sanitized Nearby Transport Spike Evidence Record'
    );

    expect(inventory).toContain('`L5P` 公開 Engineering Evidence');
    expect(evidenceRow?.[1]).toBe('`L5P`');
    expect(evidenceRow?.[3]).toContain('Evidence Bundle ID');
    expect(evidenceRow?.[3]).toContain('Positive-control Fixture');
    expect(evidenceRow?.[8]).toContain('製品 model');
    expect(evidenceRow?.[8]).toContain('手動 JSON バックアップへ含めない');
    expect(evidenceRetention?.[1]).toBe('Repository history と同じである。');
    expect(evidenceRetention?.[4]).toContain('対象外である');
    expect(retention).toContain('Review 完了直後または取得から 7 日以内');
    expect(record).toContain('raw `L5` の保存と削除は');
    expect(record).toContain('この公開 `L5P` Record の Field は');
    expect(threatModel).toContain('公開 Spike Evidence の混同と再識別');
    expect(threatModel).toContain('保持ポリシーの `L5` 削除契機');
    expect(threatModel).toContain('traffic 0 と未捕捉 interface は Fail');
  });

  it('Binding と Decision を唯一の正本にし Rubric を詳細 Record から導出する', async () => {
    const record = await readRepositoryDocument(
      'docs/evidence/nearby-transport-spike-record.md'
    );
    const decision = markdownSection(record, 'Decision record');
    const rubric = markdownTable(record, 'Physical rubric record');
    const physicalTables = [
      'Join measurement record',
      'Network fixture summary record',
      'Network isolation record',
      'Lifecycle and permission record',
      'Star relay record',
      'Discovery-disabled recovery record',
      'Security binding record',
      'Packet capture record',
      'Expo and supply-chain record',
    ].map((heading) => markdownTable(record, heading));

    expect(decision).toContain('Selection Status: `Undecided`');
    expect(decision).toContain(
      'Rejected candidates: Static screening record の `Fail` Candidate と棄却理由を参照する'
    );
    expect(record.match(/Selection Status:/g)).toHaveLength(1);
    expect(rubric.header).toEqual(['Gate', 'Source record', 'Derived status']);
    expect(
      rubric.rows.every((row) => row[1] !== '' && row[2] === '`Not run`')
    ).toBe(true);
    for (const table of physicalTables) {
      expect(table.header).not.toContain('Evidence Bundle ID');
    }
    expect(record).toContain(
      '`Evidence bundle binding record` を Candidate、Build、Capture、Analyzer、実行月、Review の唯一の Metadata 正本'
    );
    expect(record).toContain('`Decision record` を選定状態の唯一の正本');
    expect(record).toContain(
      'Static Gate の各 Cell は `Pass — 公開根拠`、`Fail — 棄却理由`、`Not run — 欠落証拠`'
    );
    expect(record).toContain('値または検証が欠ければ `Not run` とする');
  });

  it('Accepted ADR は選定結果ではなく二段階 Evidence Gate だけを決定する', async () => {
    const adr = await readRepositoryDocument(
      'docs/adr/0023-nearby-transport-evidence-gate.md'
    );

    expect(adr).toContain('- **Status**: Accepted');
    expect(adr).toContain('Selection Status は `Undecided`');
    expect(adr).toContain('選んだ 1 候補だけを Phase B');
    expect(adr).toContain('別の Accepted ADR');
    expect(adr).toContain(
      'ADR-0023 の Accepted は Issue 20 の Transport 選定完了を\n意味しない'
    );
  });
});
