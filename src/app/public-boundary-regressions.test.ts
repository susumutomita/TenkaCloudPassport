import { describe, expect, it } from 'bun:test';
import {
  BUNDLED_CATALOGS,
  emptyLearningState,
} from '../../tests/fixtures/learning/catalogs';
import {
  AgentModelProviderError,
  buildAgentModelDecisionFromEvidence,
  normalizeAgentModelFailureCode,
  validateAgentModelProviderOutput,
} from '../domain/agent-model-provider';
import { CLUE_IDS } from '../domain/clue-catalog';
import { publicPassportWithClues } from '../domain/domain-test-kit';
import { lessonKey } from '../domain/learning/model';
import { advance, answer, startLesson } from '../domain/learning/transitions';
import { importCatalog } from '../domain/learning/validation';
import {
  createLocalPrivateProfile,
  PROFILE_MAX_CLUES,
} from '../domain/passport';
import {
  beginInteraction,
  INTERACTION_DEADLINE_MS,
  reducePetInteraction,
} from '../domain/pet-interaction';
import { decodeQrPayload, QR_PROTOCOL_PREFIX } from '../protocol/qr-payload';
import { parsePublicPassport } from '../protocol/schema';
import {
  booleanValue,
  integerValue,
  SchemaValidationError,
} from '../protocol/validation';
import { isOwnedImportCopy } from './learning/import-ownership';
import {
  createDefaultPassportShareSelection,
  createPassportShare,
} from './passport-share';

describe('public boundary regression cases', () => {
  it.each([undefined, null, 'unexpected', {}, 42])(
    'normalizes unknown legacy provider failure codes safely: %j',
    (value) => {
      expect(normalizeAgentModelFailureCode(value)).toBe('LOAD_ERROR');
    }
  );
  it.each(
    [
      null,
      [],
      { kind: 'bridge', evidenceIds: 'not-an-array' },
      { kind: 'bridge', evidenceIds: [42] },
      { kind: 'bridge', evidenceIds: ['x'.repeat(161)] },
    ].map((value) => ({ value }))
  )(
    'rejects malformed legacy provider output without rendering its content',
    ({ value }) => {
      const input = {
        ownerPassport: publicPassportWithClues(['open-source']),
        encounteredPassport: publicPassportWithClues(['open-source']),
        deadlineAtWallClockMs: 1000,
      };
      expect(() => validateAgentModelProviderOutput(input, value)).toThrow(
        AgentModelProviderError
      );
    }
  );
  it('renders verified offer/need and owner-confirmed evidence in English', () => {
    const complement = buildAgentModelDecisionFromEvidence(
      [
        {
          kind: 'offer-need-complement',
          evidenceId: 'activity-complement',
          category: 'activity',
          offerClueId: 'regional-event-operations',
          seekClueId: 'local-tournament',
        },
      ],
      'en'
    );
    const confirmed = buildAgentModelDecisionFromEvidence(
      [
        {
          kind: 'owner-confirmed',
          evidenceId: 'owner-open-source',
          clueId: 'open-source',
        },
      ],
      'en'
    );
    expect(complement.kind).toBe('bridge');
    expect(confirmed.kind).toBe('bridge');
    if (complement.kind === 'bridge' && confirmed.kind === 'bridge') {
      expect(complement.reason).toContain('One side can offer');
      expect(confirmed.reason).toContain('Owner agreed');
      expect(complement.evidenceIds).toEqual(['activity-complement']);
      expect(confirmed.evidenceIds).toEqual(['owner-open-source']);
    }
  });
  it.each([null, 0, 'false', {}, []].map((value) => ({ value })))(
    'does not coerce boolean input %j',
    ({ value }) => {
      expect(() => booleanValue(value, 'enabled')).toThrow(
        SchemaValidationError
      );
    }
  );
  it.each([NaN, Infinity, 1.5, '1'])(
    'rejects a non-safe-integer sequence %j',
    (value) => {
      expect(() => integerValue(value, 'sequence', 0, 100)).toThrow(
        SchemaValidationError
      );
    }
  );
  it.each([
    'https://example.invalid/source.json',
    'file://other-host/Documents/Inbox/card.json',
    'file:///Documents/Inbox/card.json?copy=1',
    'file:///Documents/Inbox/card.json#selected',
  ])(
    'never owns an import source outside the clean local file boundary: %s',
    (uri) => {
      expect(isOwnedImportCopy(uri, 'file:///Documents/')).toBe(false);
    }
  );
  it('accepts a plain legacy catalog without a download envelope', () => {
    const original = BUNDLED_CATALOGS[0];
    if (!original) throw new Error('Missing test catalog');
    const imported = importCatalog(JSON.stringify(original));
    expect(imported.catalogID).toBe(original.catalogID);
    expect(imported.lessons).toEqual(original.lessons);
  });
  it('records a positive self-assessment and allows the next learning step', () => {
    const catalog = BUNDLED_CATALOGS[0];
    const lesson = catalog?.lessons.find((item) =>
      item.steps.some((step) => step.choices.length === 0)
    );
    if (!catalog || !lesson) throw new Error('Missing self-assessment fixture');
    const index = lesson.steps.findIndex((step) => step.choices.length === 0);
    const step = lesson.steps[index];
    if (!step) throw new Error('Missing self-assessment step');
    const key = lessonKey(catalog, lesson);
    const state = startLesson(emptyLearningState(), key, 'positive-self');
    const current = {
      ...state,
      progress: [
        {
          key,
          index,
          session: 'positive-self',
          completed: false,
          review: false,
        },
      ],
    };
    const next = answer(current, {
      key,
      session: 'positive-self',
      stepID: step.id,
      choiceID: null,
      selfReady: true,
      timestamp: 123,
    });
    expect(next.attempts[0]?.result).toBe('self-ready');
    expect(next.progress[0]?.review).toBe(false);
    expect(
      advance(next, key, 'positive-self', step.id).progress[0]?.index
    ).toBe(index + 1);
  });
  it('projects optional share fields only when selected and parses their absence', () => {
    const profile = createLocalPrivateProfile({
      petName: 'Synthetic',
      petEmoji: '🐾',
      ownerAlias: 'Sample',
      candidateClueIds: ['open-source'],
      selectedForPassportClueIds: ['open-source'],
      languageCodes: ['en'],
    });
    const selection = createDefaultPassportShareSelection(profile);
    const visible = createPassportShare(profile, selection);
    expect(
      visible.preview.items.find((item) => item.key === 'petEmoji')?.value
    ).toBe('🐾');
    expect(
      visible.preview.items.find((item) => item.key === 'ownerAlias')?.value
    ).toBe('Sample');
    const hidden = createPassportShare(profile, {
      ...selection,
      includePetEmoji: false,
      includeOwnerAlias: false,
    });
    expect(
      hidden.preview.items.some(
        (item) => item.key === 'petEmoji' || item.key === 'ownerAlias'
      )
    ).toBe(false);
    expect(parsePublicPassport(hidden.qrProjection).petEmoji).toBeUndefined();
  });
  it('rejects too many excluded topics rather than storing an invalid profile', () => {
    expect(() =>
      createLocalPrivateProfile({
        petName: 'Synthetic',
        petEmoji: '🐾',
        ownerAlias: '',
        candidateClueIds: ['open-source'],
        selectedForPassportClueIds: ['open-source'],
        languageCodes: ['en'],
        excludedTopicIds: CLUE_IDS.slice(0, PROFILE_MAX_CLUES + 1),
      })
    ).toThrow('除外トピック');
  });
  it('dispatches a deadline tick through the public reducer', () => {
    const clock = { wallClockMs: 1000, monotonicMs: 1000 };
    const state = beginInteraction(clock);
    const result = reducePetInteraction(state, {
      type: 'tick',
      clock: {
        wallClockMs: 1000 + INTERACTION_DEADLINE_MS,
        monotonicMs: 1000 + INTERACTION_DEADLINE_MS,
      },
    });
    expect(result).toEqual({ phase: 'no-signal', reason: 'timeout' });
  });
  it('rejects an excessively deep QR JSON before treating it as a card', () => {
    let nested: unknown = null;
    for (let depth = 0; depth < 50; depth += 1) nested = { child: nested };
    expect(() =>
      decodeQrPayload(QR_PROTOCOL_PREFIX + JSON.stringify(nested), new Set())
    ).toThrow('QR Payload が上限を超えています。');
  });
});
