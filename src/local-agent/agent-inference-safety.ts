import {
  type AgentModelEvidence,
  type AgentModelInput,
  AgentModelProviderError,
  buildEncounterEvidence,
  type ConsentedOwnerAnswer,
} from '../domain/agent-model-provider';
import { clueById, isClueId, isLanguageCode } from '../domain/clue-catalog';
import type { PublicPassport } from '../domain/passport';
import { parsePublicPassport } from '../protocol/schema';
import {
  assertLiteral,
  assertOneOf,
  integerValue,
  parseBoundedJson,
  SchemaValidationError,
  schemaError,
  strictRecord,
  stringValue,
} from '../protocol/validation';

export const LOCAL_AGENT_PROMPT_MAX_BYTES = 4096;
export const LOCAL_AGENT_OUTPUT_MAX_BYTES = 4096;
export const LOCAL_AGENT_OUTPUT_MAX_DEPTH = 4;

const UNSAFE_UNICODE = /[\p{Cc}\p{Default_Ignorable_Code_Point}]/u;

export interface AgentInferenceRequest {
  readonly promptJson: string;
  readonly allowedEvidenceIds: readonly string[];
}

interface AgentInferencePrompt {
  readonly schemaVersion: 1;
  readonly allowedEvidence: readonly AgentModelEvidence[];
}

function normalizedDisplayText(value: string, path: string): string {
  if (UNSAFE_UNICODE.test(value)) {
    return schemaError(
      'INVALID_VALUE',
      path,
      `${path} に制御文字は指定できません。`
    );
  }
  return value.normalize('NFC');
}

function validatedPassport(value: unknown, path: string): PublicPassport {
  const passport = parsePublicPassport(value);
  const ownerAlias = passport.ownerAlias
    ? normalizedDisplayText(passport.ownerAlias, `${path}.ownerAlias`)
    : undefined;
  return {
    ...passport,
    petName: normalizedDisplayText(passport.petName, `${path}.petName`),
    ...(ownerAlias ? { ownerAlias } : {}),
  };
}

function validatedOwnerAnswer(
  value: unknown,
  path: string
): ConsentedOwnerAnswer {
  const record = strictRecord(value, path, ['candidateClue', 'answer']);
  const candidatePath = `${path}.candidateClue`;
  const candidate = strictRecord(record.candidateClue, candidatePath, [
    'value',
    'category',
    'source',
  ]);
  const clueIdCandidate = stringValue(
    candidate.value,
    `${candidatePath}.value`,
    96
  );
  if (!isClueId(clueIdCandidate)) {
    return schemaError(
      'INVALID_VALUE',
      `${candidatePath}.value`,
      `${candidatePath}.value は版管理済み Clue ではありません。`
    );
  }
  return {
    candidateClue: {
      value: clueIdCandidate,
      category: assertLiteral(
        candidate.category,
        clueById(clueIdCandidate).category,
        `${candidatePath}.category`
      ),
      source: assertLiteral(
        candidate.source,
        'owner-selected',
        `${candidatePath}.source`
      ),
    },
    answer: assertOneOf(
      record.answer,
      ['yes', 'no', 'decline'],
      `${path}.answer`
    ),
  };
}

function validatedAgentModelInput(value: unknown): AgentModelInput {
  const path = '$.agentModelInput';
  const record = strictRecord(
    value,
    path,
    ['ownerPassport', 'encounteredPassport', 'deadlineAtWallClockMs'],
    ['ownerAnswer', 'language']
  );
  const language = Object.hasOwn(record, 'language')
    ? stringValue(record.language, `${path}.language`, 8)
    : undefined;
  if (language !== undefined && !isLanguageCode(language)) {
    return schemaError(
      'INVALID_VALUE',
      `${path}.language`,
      `${path}.language は版管理済み Language ではありません。`
    );
  }
  return {
    ownerPassport: validatedPassport(
      record.ownerPassport,
      `${path}.ownerPassport`
    ),
    encounteredPassport: validatedPassport(
      record.encounteredPassport,
      `${path}.encounteredPassport`
    ),
    ...(Object.hasOwn(record, 'ownerAnswer')
      ? {
          ownerAnswer: validatedOwnerAnswer(
            record.ownerAnswer,
            `${path}.ownerAnswer`
          ),
        }
      : {}),
    ...(language ? { language } : {}),
    deadlineAtWallClockMs: integerValue(
      record.deadlineAtWallClockMs,
      `${path}.deadlineAtWallClockMs`,
      0,
      Number.MAX_SAFE_INTEGER
    ),
  };
}

function promptFromInput(input: AgentModelInput): AgentInferenceRequest {
  const allowedEvidence = buildEncounterEvidence(input);
  const prompt: AgentInferencePrompt = {
    schemaVersion: 1,
    allowedEvidence,
  };
  const promptJson = boundedAgentInferencePromptJson(JSON.stringify(prompt));
  return {
    promptJson,
    allowedEvidenceIds: allowedEvidence.map((evidence) => evidence.evidenceId),
  };
}

/** Prompt Projection の byte 上限。固定 Error だけを返し、Prompt 本文を反射しない。 */
export function boundedAgentInferencePromptJson(promptJson: string): string {
  if (
    new TextEncoder().encode(promptJson).byteLength >
    LOCAL_AGENT_PROMPT_MAX_BYTES
  ) {
    throw new AgentModelProviderError(
      'SCHEMA_ERROR',
      'Local Agent Prompt の byte 数が上限を超えています。'
    );
  }
  return promptJson;
}

/**
 * Native Model を初期化する前の Pure Boundary。外部由来 Input を再検証し、Model が必要とする
 * 列挙済み Evidence だけへ射影する。失敗本文に入力値を含めない。
 */
export function prepareAgentInferenceRequest(
  value: unknown
): AgentInferenceRequest {
  try {
    return promptFromInput(validatedAgentModelInput(value));
  } catch (error: unknown) {
    if (error instanceof SchemaValidationError) {
      throw new AgentModelProviderError(
        'SCHEMA_ERROR',
        'Local Agent の入力を安全境界で検証できませんでした。'
      );
    }
    throw error;
  }
}

/** GGUF が返す Text を byte・JSON depth の両方で制限し、入力本文を反射しない失敗へ変換する。 */
export function parseAgentInferenceOutputText(value: unknown): unknown {
  try {
    if (typeof value !== 'string') {
      return schemaError(
        'INVALID_TYPE',
        '$.localAgentOutput',
        '$.localAgentOutput は string である必要があります。'
      );
    }
    return parseBoundedJson(
      value,
      LOCAL_AGENT_OUTPUT_MAX_BYTES,
      LOCAL_AGENT_OUTPUT_MAX_DEPTH
    );
  } catch {
    throw new AgentModelProviderError(
      'SCHEMA_ERROR',
      'Local Agent の出力を安全境界で検証できませんでした。'
    );
  }
}
