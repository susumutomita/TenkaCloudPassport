import { strictRecord } from '../protocol/validation';
import type { BackupSharePort } from './backup-share-port';

export const PILOT_AGGREGATE_SCHEMA_VERSION = 1;
export const PILOT_MINIMUM_AGGREGATION_UNIT = 5;
export const PILOT_AGGREGATE_MAX_BYTES = 64 * 1024;

export const PILOT_AGGREGATE_MAX_COUNT = 1_000_000;
const PILOT_AGGREGATE_FILE_NAME = 'tenkacloud-passport-pilot-aggregate.json';

export type PilotOutcomeKind = 'bridge' | 'no-signal';
export type PilotProviderRun = 'rules' | 'local-llm' | 'fallback';
export type ConversationSelfReport =
  | 'started-conversation'
  | 'not-yet'
  | 'prefer-not-to-answer';

export interface PilotEventAggregate {
  readonly aggregateSchemaVersion: 1;
  readonly minimumAggregationUnit: 5;
  readonly startReady: {
    readonly started: number;
    readonly ready: number;
  };
  readonly readyToBridgeDurationBuckets: {
    readonly under30Seconds: number;
    readonly from30To89Seconds: number;
    readonly from90To179Seconds: number;
    readonly atLeast180Seconds: number;
  };
  readonly outcomes: {
    readonly bridge: number;
    readonly noSignal: number;
  };
  readonly providerRuns: {
    readonly rules: number;
    readonly localLlm: number;
    readonly fallback: number;
  };
  readonly conversationStartSelfReport: {
    readonly eligible: number;
    readonly startedConversation: number;
    readonly notYet: number;
    readonly preferNotToAnswer: number;
  };
}

export interface PilotAggregatePreviewItem {
  readonly key: string;
  readonly value: string;
}

export interface PilotAggregatePreview {
  readonly aggregate: PilotEventAggregate;
  readonly json: string;
  readonly items: readonly PilotAggregatePreviewItem[];
  readonly byteLength: number;
}

export type PilotMeasurementNotice = 'shared' | 'dismissed' | 'saved';

export interface PilotMeasurementView {
  readonly aggregate: PilotEventAggregate;
  readonly researchEnabled: boolean;
  readonly selfReportPending: boolean;
  readonly preview: PilotAggregatePreview | null;
  readonly sharing: boolean;
  readonly notice: PilotMeasurementNotice | null;
  readonly error: boolean;
}

export interface PilotOutcomeEvent {
  readonly kind: PilotOutcomeKind;
  readonly provider: PilotProviderRun;
  readonly monotonicMs: number;
}

export interface PilotMeasurementController {
  readonly view: () => PilotMeasurementView;
  readonly setResearchEnabled: (enabled: boolean) => void;
  readonly start: () => void;
  readonly ready: (monotonicMs: number) => void;
  readonly outcome: (event: PilotOutcomeEvent) => void;
  readonly selfReport: (answer: ConversationSelfReport) => void;
  readonly skipSelfReport: () => void;
  readonly abandon: () => void;
  readonly refreshPreview: () => void;
  readonly share: () => Promise<void>;
  readonly reset: () => void;
}

type PendingMeasurement =
  | { readonly phase: 'started' }
  | { readonly phase: 'ready'; readonly readyAtMonotonicMs: number }
  | { readonly phase: 'awaiting-self-report' };

export class PilotMeasurementError extends Error {
  constructor() {
    super('Pilot Aggregate を読み取れませんでした。');
    this.name = 'PilotMeasurementError';
  }
}

function fail(): never {
  throw new PilotMeasurementError();
}

function emptyAggregate(): PilotEventAggregate {
  return {
    aggregateSchemaVersion: PILOT_AGGREGATE_SCHEMA_VERSION,
    minimumAggregationUnit: PILOT_MINIMUM_AGGREGATION_UNIT,
    startReady: { started: 0, ready: 0 },
    readyToBridgeDurationBuckets: {
      under30Seconds: 0,
      from30To89Seconds: 0,
      from90To179Seconds: 0,
      atLeast180Seconds: 0,
    },
    outcomes: { bridge: 0, noSignal: 0 },
    providerRuns: { rules: 0, localLlm: 0, fallback: 0 },
    conversationStartSelfReport: {
      eligible: 0,
      startedConversation: 0,
      notYet: 0,
      preferNotToAnswer: 0,
    },
  };
}

function copyAggregate(aggregate: PilotEventAggregate): PilotEventAggregate {
  return {
    ...aggregate,
    startReady: { ...aggregate.startReady },
    readyToBridgeDurationBuckets: {
      ...aggregate.readyToBridgeDurationBuckets,
    },
    outcomes: { ...aggregate.outcomes },
    providerRuns: { ...aggregate.providerRuns },
    conversationStartSelfReport: {
      ...aggregate.conversationStartSelfReport,
    },
  };
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys
): Record<Keys[number], unknown> {
  return strictRecord(value, 'pilotAggregate', expected);
}

function count(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > PILOT_AGGREGATE_MAX_COUNT
  ) {
    return fail();
  }
  return value as number;
}

function parseStartReady(value: unknown): PilotEventAggregate['startReady'] {
  const candidate = exactRecord(value, ['started', 'ready'] as const);
  return { started: count(candidate.started), ready: count(candidate.ready) };
}

function parseDurationBuckets(
  value: unknown
): PilotEventAggregate['readyToBridgeDurationBuckets'] {
  const candidate = exactRecord(value, [
    'under30Seconds',
    'from30To89Seconds',
    'from90To179Seconds',
    'atLeast180Seconds',
  ] as const);
  return {
    under30Seconds: count(candidate.under30Seconds),
    from30To89Seconds: count(candidate.from30To89Seconds),
    from90To179Seconds: count(candidate.from90To179Seconds),
    atLeast180Seconds: count(candidate.atLeast180Seconds),
  };
}

function parseOutcomes(value: unknown): PilotEventAggregate['outcomes'] {
  const candidate = exactRecord(value, ['bridge', 'noSignal'] as const);
  return {
    bridge: count(candidate.bridge),
    noSignal: count(candidate.noSignal),
  };
}

function parseProviderRuns(
  value: unknown
): PilotEventAggregate['providerRuns'] {
  const candidate = exactRecord(value, [
    'rules',
    'localLlm',
    'fallback',
  ] as const);
  return {
    rules: count(candidate.rules),
    localLlm: count(candidate.localLlm),
    fallback: count(candidate.fallback),
  };
}

function parseSelfReport(
  value: unknown
): PilotEventAggregate['conversationStartSelfReport'] {
  const candidate = exactRecord(value, [
    'eligible',
    'startedConversation',
    'notYet',
    'preferNotToAnswer',
  ] as const);
  return {
    eligible: count(candidate.eligible),
    startedConversation: count(candidate.startedConversation),
    notYet: count(candidate.notYet),
    preferNotToAnswer: count(candidate.preferNotToAnswer),
  };
}

function assertAggregateConsistency(aggregate: PilotEventAggregate): void {
  const outcomes = aggregate.outcomes.bridge + aggregate.outcomes.noSignal;
  const providers =
    aggregate.providerRuns.rules +
    aggregate.providerRuns.localLlm +
    aggregate.providerRuns.fallback;
  const bridgeDurations =
    aggregate.readyToBridgeDurationBuckets.under30Seconds +
    aggregate.readyToBridgeDurationBuckets.from30To89Seconds +
    aggregate.readyToBridgeDurationBuckets.from90To179Seconds +
    aggregate.readyToBridgeDurationBuckets.atLeast180Seconds;
  const responses =
    aggregate.conversationStartSelfReport.startedConversation +
    aggregate.conversationStartSelfReport.notYet +
    aggregate.conversationStartSelfReport.preferNotToAnswer;
  if (
    aggregate.startReady.ready > aggregate.startReady.started ||
    outcomes > aggregate.startReady.ready ||
    outcomes < PILOT_MINIMUM_AGGREGATION_UNIT ||
    providers !== outcomes ||
    bridgeDurations !== aggregate.outcomes.bridge ||
    aggregate.conversationStartSelfReport.eligible !==
      aggregate.outcomes.bridge ||
    responses > aggregate.conversationStartSelfReport.eligible
  ) {
    fail();
  }
}

function parseAggregateValue(value: unknown): PilotEventAggregate {
  const candidate = exactRecord(value, [
    'aggregateSchemaVersion',
    'minimumAggregationUnit',
    'startReady',
    'readyToBridgeDurationBuckets',
    'outcomes',
    'providerRuns',
    'conversationStartSelfReport',
  ] as const);
  if (
    candidate.aggregateSchemaVersion !== PILOT_AGGREGATE_SCHEMA_VERSION ||
    candidate.minimumAggregationUnit !== PILOT_MINIMUM_AGGREGATION_UNIT
  ) {
    return fail();
  }
  const aggregate: PilotEventAggregate = {
    aggregateSchemaVersion: PILOT_AGGREGATE_SCHEMA_VERSION,
    minimumAggregationUnit: PILOT_MINIMUM_AGGREGATION_UNIT,
    startReady: parseStartReady(candidate.startReady),
    readyToBridgeDurationBuckets: parseDurationBuckets(
      candidate.readyToBridgeDurationBuckets
    ),
    outcomes: parseOutcomes(candidate.outcomes),
    providerRuns: parseProviderRuns(candidate.providerRuns),
    conversationStartSelfReport: parseSelfReport(
      candidate.conversationStartSelfReport
    ),
  };
  assertAggregateConsistency(aggregate);
  return aggregate;
}

export function parsePilotEventAggregate(raw: string): PilotEventAggregate {
  if (
    typeof raw !== 'string' ||
    new TextEncoder().encode(raw).byteLength > PILOT_AGGREGATE_MAX_BYTES
  ) {
    return fail();
  }
  try {
    return parseAggregateValue(JSON.parse(raw));
  } catch (error: unknown) {
    if (error instanceof PilotMeasurementError) throw error;
    return fail();
  }
}

function previewItems(
  aggregate: PilotEventAggregate
): readonly PilotAggregatePreviewItem[] {
  return [
    ['startReady.started', aggregate.startReady.started],
    ['startReady.ready', aggregate.startReady.ready],
    [
      'readyToBridgeDurationBuckets.under30Seconds',
      aggregate.readyToBridgeDurationBuckets.under30Seconds,
    ],
    [
      'readyToBridgeDurationBuckets.from30To89Seconds',
      aggregate.readyToBridgeDurationBuckets.from30To89Seconds,
    ],
    [
      'readyToBridgeDurationBuckets.from90To179Seconds',
      aggregate.readyToBridgeDurationBuckets.from90To179Seconds,
    ],
    [
      'readyToBridgeDurationBuckets.atLeast180Seconds',
      aggregate.readyToBridgeDurationBuckets.atLeast180Seconds,
    ],
    ['outcomes.bridge', aggregate.outcomes.bridge],
    ['outcomes.noSignal', aggregate.outcomes.noSignal],
    ['providerRuns.rules', aggregate.providerRuns.rules],
    ['providerRuns.localLlm', aggregate.providerRuns.localLlm],
    ['providerRuns.fallback', aggregate.providerRuns.fallback],
    [
      'conversationStartSelfReport.eligible',
      aggregate.conversationStartSelfReport.eligible,
    ],
    [
      'conversationStartSelfReport.startedConversation',
      aggregate.conversationStartSelfReport.startedConversation,
    ],
    [
      'conversationStartSelfReport.notYet',
      aggregate.conversationStartSelfReport.notYet,
    ],
    [
      'conversationStartSelfReport.preferNotToAnswer',
      aggregate.conversationStartSelfReport.preferNotToAnswer,
    ],
  ].map(([key, value]) => ({ key: String(key), value: String(value) }));
}

function createPreview(
  aggregate: PilotEventAggregate
): PilotAggregatePreview | null {
  const outcomeCount = aggregate.outcomes.bridge + aggregate.outcomes.noSignal;
  if (outcomeCount < PILOT_MINIMUM_AGGREGATION_UNIT) return null;
  const json = JSON.stringify(aggregate);
  const validated = parsePilotEventAggregate(json);
  return {
    aggregate: validated,
    json,
    items: previewItems(validated),
    byteLength: new TextEncoder().encode(json).byteLength,
  };
}

function assertMonotonicClock(value: number): void {
  if (!Number.isFinite(value) || value < 0) fail();
}

function bridgeDurationKey(
  durationMs: number
): keyof PilotEventAggregate['readyToBridgeDurationBuckets'] {
  if (durationMs < 30_000) return 'under30Seconds';
  if (durationMs < 90_000) return 'from30To89Seconds';
  if (durationMs < 180_000) return 'from90To179Seconds';
  return 'atLeast180Seconds';
}

function providerKey(
  provider: PilotProviderRun
): keyof PilotEventAggregate['providerRuns'] {
  if (provider === 'local-llm') return 'localLlm';
  return provider;
}

function responseKey(
  answer: ConversationSelfReport
): keyof Omit<PilotEventAggregate['conversationStartSelfReport'], 'eligible'> {
  if (answer === 'started-conversation') return 'startedConversation';
  if (answer === 'not-yet') return 'notYet';
  return 'preferNotToAnswer';
}

export function createPilotMeasurementController(
  sharePort: BackupSharePort
): PilotMeasurementController {
  let aggregate = emptyAggregate();
  let pending: PendingMeasurement | null = null;
  let preview: PilotAggregatePreview | null = null;
  let researchEnabled = false;
  let sharing = false;
  let notice: PilotMeasurementNotice | null = null;
  let error = false;

  function invalidatePreview(): void {
    preview = null;
    notice = null;
    error = false;
  }

  function view(): PilotMeasurementView {
    return {
      aggregate: copyAggregate(aggregate),
      researchEnabled,
      selfReportPending: pending?.phase === 'awaiting-self-report',
      preview,
      sharing,
      notice,
      error,
    };
  }

  function setResearchEnabled(enabled: boolean): void {
    researchEnabled = enabled;
    if (!enabled) pending = null;
  }

  function start(): void {
    if (!researchEnabled) return;
    if (aggregate.startReady.started >= PILOT_AGGREGATE_MAX_COUNT) {
      researchEnabled = false;
      pending = null;
      return;
    }
    invalidatePreview();
    aggregate = {
      ...aggregate,
      startReady: {
        ...aggregate.startReady,
        started: aggregate.startReady.started + 1,
      },
    };
    pending = { phase: 'started' };
  }

  function ready(monotonicMs: number): void {
    if (!researchEnabled) return;
    if (pending?.phase !== 'started') return;
    assertMonotonicClock(monotonicMs);
    invalidatePreview();
    aggregate = {
      ...aggregate,
      startReady: {
        ...aggregate.startReady,
        ready: aggregate.startReady.ready + 1,
      },
    };
    pending = { phase: 'ready', readyAtMonotonicMs: monotonicMs };
  }

  function outcome(event: PilotOutcomeEvent): void {
    if (!researchEnabled) return;
    if (pending?.phase !== 'ready') return;
    assertMonotonicClock(event.monotonicMs);
    if (event.monotonicMs < pending.readyAtMonotonicMs) fail();
    invalidatePreview();
    const provider = providerKey(event.provider);
    const outcomes = {
      ...aggregate.outcomes,
      [event.kind === 'bridge' ? 'bridge' : 'noSignal']:
        aggregate.outcomes[event.kind === 'bridge' ? 'bridge' : 'noSignal'] + 1,
    };
    const providerRuns = {
      ...aggregate.providerRuns,
      [provider]: aggregate.providerRuns[provider] + 1,
    };
    if (event.kind === 'bridge') {
      const duration = bridgeDurationKey(
        event.monotonicMs - pending.readyAtMonotonicMs
      );
      aggregate = {
        ...aggregate,
        outcomes,
        providerRuns,
        readyToBridgeDurationBuckets: {
          ...aggregate.readyToBridgeDurationBuckets,
          [duration]: aggregate.readyToBridgeDurationBuckets[duration] + 1,
        },
        conversationStartSelfReport: {
          ...aggregate.conversationStartSelfReport,
          eligible: aggregate.conversationStartSelfReport.eligible + 1,
        },
      };
      pending = { phase: 'awaiting-self-report' };
      return;
    }
    aggregate = { ...aggregate, outcomes, providerRuns };
    pending = null;
  }

  function selfReport(answer: ConversationSelfReport): void {
    if (!researchEnabled) return;
    if (pending?.phase !== 'awaiting-self-report') return;
    invalidatePreview();
    const key = responseKey(answer);
    aggregate = {
      ...aggregate,
      conversationStartSelfReport: {
        ...aggregate.conversationStartSelfReport,
        [key]: aggregate.conversationStartSelfReport[key] + 1,
      },
    };
    pending = null;
  }

  function skipSelfReport(): void {
    if (pending?.phase === 'awaiting-self-report') pending = null;
  }

  function abandon(): void {
    pending = null;
  }

  function refreshPreview(): void {
    preview = createPreview(aggregate);
    notice = null;
    error = false;
  }

  async function share(): Promise<void> {
    if (!preview || sharing) return;
    sharing = true;
    try {
      const result = await sharePort.share({
        fileName: PILOT_AGGREGATE_FILE_NAME,
        json: preview.json,
      });
      notice =
        result.kind === 'shared'
          ? 'shared'
          : result.kind === 'dismissed'
            ? 'dismissed'
            : 'saved';
      if (result.kind !== 'dismissed') preview = null;
      error = false;
    } catch {
      notice = null;
      error = true;
    } finally {
      sharing = false;
    }
  }

  function reset(): void {
    aggregate = emptyAggregate();
    researchEnabled = false;
    pending = null;
    preview = null;
    sharing = false;
    notice = null;
    error = false;
  }

  return {
    view,
    setResearchEnabled,
    start,
    ready,
    outcome,
    selfReport,
    skipSelfReport,
    abandon,
    refreshPreview,
    share,
    reset,
  };
}
