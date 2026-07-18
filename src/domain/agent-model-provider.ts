import type { BridgeConfidence } from './bridge-selection';
import {
  firstOfferNeedComplementMatch,
  sharedLanguage,
} from './bridge-selection';
import {
  type ClueCategory,
  type ClueId,
  clueById,
  LANGUAGE_CATALOG,
  type LanguageCode,
} from './clue-catalog';
import { confidenceFromEvidence } from './evidence-confidence';
import type { OwnerAnswerValue } from './match-evidence';
import type { ConfirmedClue, PublicPassport } from './passport';
import { findFirstSharedConfirmedClue } from './shared-clue-match';

/**
 * Issue 13: Rules Provider を「劣化 Demo」ではなく、Local LLM 未導入端末・Expo Go・Web・
 * Model Error 時でも同じ Privacy Contract と Encounter Outcome を保証する基準実装へ引き上げる、
 * Rules Provider と将来の Local Agent（`llama.rn`, Issue 17）が共有する Provider Contract。
 * 詳細は `docs/design/agent-model-provider-contract.md` を正本とする。既存の 2 者間 Live 経路
 * （`rules-provider.ts` / `interaction-discovery-provider.ts`）は変更しない。
 */

export const DEFAULT_AGENT_MODEL_LANGUAGE: LanguageCode = 'ja';

export interface ConsentedOwnerAnswer {
  readonly candidateClue: ConfirmedClue;
  readonly answer: OwnerAnswerValue;
}

export interface AgentModelInput {
  readonly ownerPassport: PublicPassport;
  readonly encounteredPassport: PublicPassport;
  readonly ownerAnswer?: ConsentedOwnerAnswer;
  readonly language?: LanguageCode;
  readonly deadlineAtWallClockMs: number;
}

export interface SharedTopicEvidence {
  readonly kind: 'shared-topic';
  readonly evidenceId: string;
  readonly clueId: ClueId;
}

export interface OfferNeedComplementEvidence {
  readonly kind: 'offer-need-complement';
  readonly evidenceId: string;
  readonly category: ClueCategory;
  readonly offerClueId: ClueId;
  readonly seekClueId: ClueId;
}

export interface SharedLanguageEvidence {
  readonly kind: 'shared-language';
  readonly evidenceId: string;
  readonly language: LanguageCode;
}

export interface OwnerConfirmedEvidence {
  readonly kind: 'owner-confirmed';
  readonly evidenceId: string;
  readonly clueId: ClueId;
}

export type AgentModelEvidence =
  | SharedTopicEvidence
  | OfferNeedComplementEvidence
  | SharedLanguageEvidence
  | OwnerConfirmedEvidence;

export type AgentModelDecision =
  | {
      readonly kind: 'bridge';
      readonly reason: string;
      readonly opener: string;
      readonly evidenceIds: readonly string[];
      readonly confidence: BridgeConfidence;
    }
  | { readonly kind: 'no-signal' };

/**
 * Native / Model 境界から受け取る唯一の Output Schema。自由記述、URL、Contact、Tool Call、
 * Action、人物 ID を Field として表現できない。表示文と Confidence は Validator が
 * 検証済み Evidence から再構築する。
 */
export type AgentModelProviderOutput =
  | {
      readonly kind: 'bridge';
      readonly evidenceIds: readonly string[];
    }
  | { readonly kind: 'no-signal' };

export type AgentModelFailureCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SCHEMA_ERROR'
  | 'LOAD_ERROR';

/**
 * Primary Provider（将来の Local Agent）だけが投げてよい型付き失敗。Rules 実装は
 * `RulesAgentModelProvider` という同期・例外なしの狭い型で公開するため、絶対に投げない。
 */
export class AgentModelProviderError extends Error {
  readonly code: AgentModelFailureCode;

  constructor(code: AgentModelFailureCode, message: string) {
    super(message);
    this.name = 'AgentModelProviderError';
    this.code = code;
  }
}

export interface AgentModelProvider {
  readonly kind: 'rules' | 'local-agent';
  /** Native 境界の実値は TypeScript の型を信用せず、必ず Runtime Validator へ渡す。 */
  provide(input: AgentModelInput): unknown | Promise<unknown>;
}

/**
 * Rules 実装専用の狭い型。`provide()` が同期・例外なしであることを型で保証する
 * （`RulesInteractionDiscoveryProvider` と同じパターン）。
 */
export interface RulesAgentModelProvider {
  readonly kind: 'rules';
  provide(input: AgentModelInput): AgentModelProviderOutput;
}

/**
 * `owner-confirmed` の対象 Clue が、既に Topic / Offer-Need の一部として計上済みかを判定する。
 * 同じ事実を二重に数えて Confidence を水増ししないための去重ガード
 * （`bridge-selection.ts` の 3 人 Bridge 去重と同じ原則）。
 */
function isAlreadyCounted(
  evidence: readonly AgentModelEvidence[],
  clueId: ClueId
): boolean {
  return evidence.some(
    (item) =>
      (item.kind === 'shared-topic' && item.clueId === clueId) ||
      (item.kind === 'offer-need-complement' &&
        (item.offerClueId === clueId || item.seekClueId === clueId))
  );
}

/**
 * Topic 共通・Offer/Need 相互補完・共通 Language・Owner Answer を組み合わせて Evidence を
 * 作る。前 3 種は `bridge-selection.ts` の Layer 1 純粋関数をそのまま再利用し重複実装しない。
 * Owner Answer は `answer === 'yes'` のときだけ加算し、`'no'` / `'decline'`（Owner Pass）は
 * 何も加算しない代わりに他の Evidence も打ち消さない
 * （`docs/design/agent-model-provider-contract.md` の「加算方式」参照）。
 */
export function buildEncounterEvidence(
  input: AgentModelInput
): readonly AgentModelEvidence[] {
  const evidence: AgentModelEvidence[] = [];

  const topic = findFirstSharedConfirmedClue({
    ownerPassport: input.ownerPassport,
    encounteredPassport: input.encounteredPassport,
  });
  if (topic) {
    evidence.push({
      kind: 'shared-topic',
      evidenceId: `topic:${topic.value}`,
      clueId: topic.value,
    });
  }

  const complement = firstOfferNeedComplementMatch(
    input.ownerPassport,
    input.encounteredPassport
  );
  if (complement) {
    evidence.push({
      kind: 'offer-need-complement',
      evidenceId: `complement:${complement.category}:${complement.offerClue.value}:${complement.seekClue.value}`,
      category: complement.category,
      offerClueId: complement.offerClue.value,
      seekClueId: complement.seekClue.value,
    });
  }

  const language = sharedLanguage(
    input.ownerPassport,
    input.encounteredPassport
  );
  if (language) {
    evidence.push({
      kind: 'shared-language',
      evidenceId: `language:${language}`,
      language,
    });
  }

  if (input.ownerAnswer?.answer === 'yes') {
    const clueId = input.ownerAnswer.candidateClue.value;
    if (!isAlreadyCounted(evidence, clueId)) {
      evidence.push({
        kind: 'owner-confirmed',
        evidenceId: `owner-confirmed:${clueId}`,
        clueId,
      });
    }
  }

  return evidence;
}

/** 単独でも `promising` になる Evidence 種別。Offer/Need 相互補完（双方が動ける具体的な
 * 理由）と Owner Confirmed（Owner が明示的に同意した具体的な理由）が該当し、Topic
 * 共通・共通 Language 単独は `possible` に留める。 */
const PROMISING_SOLO_EVIDENCE_KINDS = new Set<AgentModelEvidence['kind']>([
  'offer-need-complement',
  'owner-confirmed',
]);

/**
 * Evidence 種別と件数から `promising | possible` の定性的 Confidence を導く。数値の人物
 * Score は一切扱わない。規則本体は `bridge-selection.ts` と共有する
 * `evidence-confidence.ts` の `confidenceFromEvidence` に集約する（Issue 12 の
 * `bridgeConfidence` と同じ規則を 4 種別へ拡張する）。
 */
export function agentModelConfidence(
  evidence: readonly AgentModelEvidence[]
): BridgeConfidence {
  return confidenceFromEvidence(evidence, PROMISING_SOLO_EVIDENCE_KINDS);
}

function languageLabel(code: LanguageCode): string {
  return LANGUAGE_CATALOG[code].label;
}

/**
 * Evidence 1 件分の理由・最初の一言を、`language`（既定 `ja`）に応じた固定表現で組み立てる。
 * カタログの label 自体はまだ日本語のみのため、`en` の文でも label は日本語のまま埋め込まれる
 * （Issue 15 の Known follow-up、`docs/design/agent-model-provider-contract.md` 参照）。
 */
function evidenceNarrative(
  evidence: AgentModelEvidence,
  language: LanguageCode
): { readonly reason: string; readonly opener: string } {
  if (evidence.kind === 'shared-topic') {
    const label = clueById(evidence.clueId).label;
    return language === 'en'
      ? {
          reason: `You both have published the confirmed shared topic "${label}".`,
          opener: `Try opening with "${label}".`,
        }
      : {
          reason: `お互いが「${label}」という確認済みの共通点を公開しています。`,
          opener: `「${label}」について話しかけてみましょう。`,
        };
  }
  if (evidence.kind === 'offer-need-complement') {
    const offerLabel = clueById(evidence.offerClueId).label;
    const seekLabel = clueById(evidence.seekClueId).label;
    return language === 'en'
      ? {
          reason: `One side can offer "${offerLabel}", and the other is looking for exactly that.`,
          opener: `Try opening with "${offerLabel}".`,
        }
      : {
          reason: `一方が提供できる「${offerLabel}」と、もう一方が探している「${seekLabel}」が結び付きます。`,
          opener: `「${offerLabel}」を手掛かりに話しかけてみましょう。`,
        };
  }
  if (evidence.kind === 'shared-language') {
    const label = languageLabel(evidence.language);
    return language === 'en'
      ? {
          reason: `You share a common language: "${label}".`,
          opener: `Try opening in ${label}.`,
        }
      : {
          reason: `共通して使える言語「${label}」があります。`,
          opener: `「${label}」で話しかけてみましょう。`,
        };
  }
  const label = clueById(evidence.clueId).label;
  return language === 'en'
    ? {
        reason: `The Owner agreed to use the clue "${label}" for this Lounge.`,
        opener: `Try opening with "${label}".`,
      }
    : {
        reason: `Owner がこの手掛かり「${label}」を今回の Lounge で使うことに同意しました。`,
        opener: `「${label}」について話しかけてみましょう。`,
      };
}

/**
 * Evidence の集合から `AgentModelDecision`（`kind: 'bridge'`）を組み立てる、この Contract
 * 専用の唯一の構成関数。全 Claim は `evidenceIds` に挙げた Evidence の内容だけから作り、
 * 参加者の自由記述は一切参照しない。1 件以上の Evidence が必要な公開関数として、空 Evidence
 * は直接テストする（`agentModelConfidence` と同じ理由）。
 */
/**
 * 複数 Evidence の reason 文を 1 つに連結するときの区切り文字。日本語の文は「。」で
 * 文末が区切られるため区切り文字なしで自然に読めるが、英語の文は「.」の直後に空白が
 * 無いと 2 文が串刺しになる（例: `...topic "X".You share...`）。この区切り文字だけを
 * 言語ごとに変え、文面そのものは `evidenceNarrative` の既存テンプレートを変更しない。
 */
function reasonJoiner(language: LanguageCode): string {
  return language === 'en' ? ' ' : '';
}

export function buildAgentModelDecisionFromEvidence(
  evidence: readonly AgentModelEvidence[],
  language: LanguageCode
): AgentModelDecision {
  const narratives = evidence.map((item) => evidenceNarrative(item, language));
  const [firstNarrative] = narratives;
  if (!firstNarrative) {
    throw new Error('Bridge の生成には 1 件以上の Evidence が必要です。');
  }
  return {
    kind: 'bridge',
    reason: narratives
      .map((narrative) => narrative.reason)
      .join(reasonJoiner(language)),
    opener: firstNarrative.opener,
    evidenceIds: evidence.map((item) => item.evidenceId),
    confidence: agentModelConfidence(evidence),
  };
}

function providerOutputSchemaError(message: string): never {
  throw new AgentModelProviderError(
    'SCHEMA_ERROR',
    `Provider Output Schema が不正です。${message}`
  );
}

function providerOutputMap(value: unknown): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return providerOutputSchemaError('Object が必要です。');
  }
  return new Map(Object.entries(value));
}

function assertExactProviderFields(
  fields: ReadonlyMap<string, unknown>,
  expected: readonly string[]
): void {
  const actual = [...fields.keys()].sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((field, index) => field !== sortedExpected[index])
  ) {
    providerOutputSchemaError(
      `許可 Field は ${sortedExpected.join(', ')} だけです。`
    );
  }
}

/**
 * Rules / Local Agent 共通の Runtime Validator。Provider が返した `evidenceIds` を Input から
 * 再導出できる Evidence と照合し、Domain が管理する固定文だけを `AgentModelDecision` として
 * 返す。Model の自由記述を表示・Log・Error Message へ反射しない。
 */
export function validateAgentModelProviderOutput(
  input: AgentModelInput,
  value: unknown
): AgentModelDecision {
  const fields = providerOutputMap(value);
  if (fields.get('kind') === 'no-signal') {
    assertExactProviderFields(fields, ['kind']);
    return { kind: 'no-signal' };
  }
  if (fields.get('kind') !== 'bridge') {
    return providerOutputSchemaError(
      'kind は bridge または no-signal である必要があります。'
    );
  }
  assertExactProviderFields(fields, ['kind', 'evidenceIds']);
  const evidenceIds = fields.get('evidenceIds');
  if (!Array.isArray(evidenceIds)) {
    return providerOutputSchemaError(
      'evidenceIds は配列である必要があります。'
    );
  }
  const availableEvidence = buildEncounterEvidence(input);
  if (evidenceIds.length < 1 || evidenceIds.length > availableEvidence.length) {
    return providerOutputSchemaError(
      'Bridge には 1 件以上かつ入力から導出できる件数以内の Evidence が必要です。'
    );
  }
  const selectedIds = new Set<string>();
  for (const candidate of evidenceIds) {
    if (typeof candidate !== 'string' || candidate.length > 160) {
      return providerOutputSchemaError(
        'Evidence ID は 160 文字以下の文字列である必要があります。'
      );
    }
    if (selectedIds.has(candidate)) {
      return providerOutputSchemaError('Evidence ID は重複できません。');
    }
    selectedIds.add(candidate);
  }
  const selectedEvidence = availableEvidence.filter((item) =>
    selectedIds.has(item.evidenceId)
  );
  if (selectedEvidence.length !== selectedIds.size) {
    return providerOutputSchemaError(
      '入力に存在しない Evidence は Bridge の根拠にできません。'
    );
  }
  return buildAgentModelDecisionFromEvidence(
    selectedEvidence,
    input.language ?? DEFAULT_AGENT_MODEL_LANGUAGE
  );
}

/**
 * Rules 基準実装。端末外へ通信せず、Network / Clock / Randomness を直接参照しない
 * 決定的な Provider。同一 Input からは常に同じ `AgentModelProviderOutput` を返し、
 * `AgentModelProviderError` を絶対に投げない。`rulesAgentModelDecision` が共通 Validator を通す。
 */
export const RULES_MODEL_PROVIDER: RulesAgentModelProvider = {
  kind: 'rules',
  provide(input) {
    const evidence = buildEncounterEvidence(input);
    if (evidence.length === 0) return { kind: 'no-signal' };
    return {
      kind: 'bridge',
      evidenceIds: evidence.map((item) => item.evidenceId),
    };
  },
};

/** Rules も Local Agent と同じ Runtime Validator を通す基準実装 Entry Point。 */
export function rulesAgentModelDecision(
  input: AgentModelInput
): AgentModelDecision {
  return validateAgentModelProviderOutput(
    input,
    RULES_MODEL_PROVIDER.provide(input)
  );
}
