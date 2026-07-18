import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type AgentModelInput,
  AgentModelProviderError,
  validateAgentModelProviderOutput,
} from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import {
  boundedAgentInferencePromptJson,
  LOCAL_AGENT_OUTPUT_MAX_BYTES,
  LOCAL_AGENT_OUTPUT_MAX_DEPTH,
  LOCAL_AGENT_PROMPT_MAX_BYTES,
  parseAgentInferenceOutputText,
  prepareAgentInferenceRequest,
} from './agent-inference-safety';

interface AttackCorpusEntry {
  readonly name: string;
  readonly text: string;
}

const CORPUS_PATH = fileURLToPath(
  new URL('./__fixtures__/prompt-injection-corpus.json', import.meta.url)
);
const ATTACK_CORPUS: readonly AttackCorpusEntry[] = JSON.parse(
  readFileSync(CORPUS_PATH, 'utf8')
);

const VALID_INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source'], ['ja'], 'つちのこ'),
  encounteredPassport: passport(['open-source'], ['ja']),
  ownerAnswer: {
    candidateClue: {
      value: 'community-operations',
      category: 'activity',
      source: 'owner-selected',
    },
    answer: 'yes',
  },
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};

function inputWithDisplayText(text: unknown): unknown {
  return {
    ...VALID_INPUT,
    ownerPassport: {
      ...VALID_INPUT.ownerPassport,
      petName: text,
      ownerAlias: text,
    },
  };
}

function captureSchemaError(action: () => unknown): AgentModelProviderError {
  try {
    action();
    throw new Error('SCHEMA_ERROR が必要です。');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AgentModelProviderError);
    if (!(error instanceof AgentModelProviderError)) throw error;
    expect(error.code).toBe('SCHEMA_ERROR');
    return error;
  }
}

describe('Local Agent Input Safety Boundary', () => {
  it('Public Passport 本文を捨て、版付き Evidence-only JSON だけを作る', () => {
    const request = prepareAgentInferenceRequest(VALID_INPUT);
    const prompt = JSON.parse(request.promptJson);

    expect(prompt).toEqual({
      schemaVersion: 1,
      allowedEvidence: [
        {
          kind: 'shared-topic',
          evidenceId: 'topic:open-source',
          clueId: 'open-source',
        },
        {
          kind: 'shared-language',
          evidenceId: 'language:ja',
          language: 'ja',
        },
        {
          kind: 'owner-confirmed',
          evidenceId: 'owner-confirmed:community-operations',
          clueId: 'community-operations',
        },
      ],
    });
    expect(request.allowedEvidenceIds).toEqual([
      'topic:open-source',
      'language:ja',
      'owner-confirmed:community-operations',
    ]);
    expect(request.promptJson).not.toContain('こむぎ');
    expect(request.promptJson).not.toContain('つちのこ');
    expect(request.promptJson).not.toContain('ownerAnswer');
    expect(
      new TextEncoder().encode(request.promptJson).byteLength
    ).toBeLessThanOrEqual(LOCAL_AGENT_PROMPT_MAX_BYTES);
  });

  it('Prompt Projection が 4 KiB を超えた場合は本文非反射の Schema Error にする', () => {
    const oversized = 'x'.repeat(LOCAL_AGENT_PROMPT_MAX_BYTES + 1);
    const error = captureSchemaError(() =>
      boundedAgentInferencePromptJson(oversized)
    );
    expect(error.message).not.toContain(oversized);
    expect(boundedAgentInferencePromptJson('bounded')).toBe('bounded');
  });

  it('NFC 化できる正規の表示文字列を受理するが Prompt へは保持しない', () => {
    const decomposed = 'e\u0301';
    const request = prepareAgentInferenceRequest(
      inputWithDisplayText(decomposed)
    );

    expect(request.promptJson).not.toContain(decomposed);
    expect(request.promptJson).not.toContain('é');
    expect(request).not.toHaveProperty('validatedInput');
  });

  it('固定 Attack Corpus の Plain Text は Prompt から除外し、危険 Unicode と過大文字列は内容非反射で拒否する', () => {
    expect(ATTACK_CORPUS.length).toBeGreaterThanOrEqual(10);
    for (const attack of ATTACK_CORPUS) {
      try {
        const request = prepareAgentInferenceRequest(
          inputWithDisplayText(attack.text)
        );
        expect(request.promptJson).not.toContain(attack.text);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AgentModelProviderError);
        if (error instanceof AgentModelProviderError) {
          expect(error.code).toBe('SCHEMA_ERROR');
          expect(error.message).not.toContain(attack.text);
        }
      }
    }
  });

  it('Default Ignorable、双方向制御、Zero-width、制御文字を Model 初期化前の境界で拒否する', () => {
    const unsafeCharacters = [
      '\u0000',
      '\u0085',
      '\u00AD',
      '\u034F',
      '\u061C',
      '\u200B',
      '\u200C',
      '\u200D',
      '\u202E',
      '\u2060',
      '\u2063',
      '\u2066',
      '\uFE0F',
      '\uFEFF',
    ];
    for (const unsafeCharacter of unsafeCharacters) {
      const text = `safe${unsafeCharacter}evil`;
      const error = captureSchemaError(() =>
        prepareAgentInferenceRequest(inputWithDisplayText(text))
      );
      expect(error.message).not.toContain(text);
    }
  });

  it('未知 Field、深い JSON、Prototype 付き Object、過大文字列を strict に拒否する', () => {
    let deep: unknown = 'leaf';
    for (let depth = 0; depth < 128; depth += 1) deep = { child: deep };
    const unknownField = { ...VALID_INPUT, injected: deep };
    const inherited = Object.create({
      ownerPassport: VALID_INPUT.ownerPassport,
    });

    captureSchemaError(() => prepareAgentInferenceRequest(unknownField));
    captureSchemaError(() => prepareAgentInferenceRequest(inherited));
    captureSchemaError(() =>
      prepareAgentInferenceRequest(inputWithDisplayText('x'.repeat(4097)))
    );
  });

  it('Owner Answer、Language、Deadline も未知 Field と不正値を許さない', () => {
    captureSchemaError(() =>
      prepareAgentInferenceRequest({
        ...VALID_INPUT,
        ownerAnswer: { ...VALID_INPUT.ownerAnswer, instruction: 'ignore' },
      })
    );
    captureSchemaError(() =>
      prepareAgentInferenceRequest({ ...VALID_INPUT, language: 'unknown' })
    );
    captureSchemaError(() =>
      prepareAgentInferenceRequest({
        ...VALID_INPUT,
        deadlineAtWallClockMs: Number.POSITIVE_INFINITY,
      })
    );
    captureSchemaError(() =>
      prepareAgentInferenceRequest({
        ...VALID_INPUT,
        ownerAnswer: {
          ...VALID_INPUT.ownerAnswer,
          candidateClue: {
            ...VALID_INPUT.ownerAnswer?.candidateClue,
            value: 'unknown-clue',
          },
        },
      })
    );
  });

  it('入力 Object 自体の予期しない例外は Schema Failure に偽装せず再送出する', () => {
    const sentinel = new Error('programming failure');
    const throwingInput = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw sentinel;
        },
      }
    );

    expect(() => prepareAgentInferenceRequest(throwingInput)).toThrow(sentinel);
  });
});

describe('Local Agent Output Safety Boundary', () => {
  it('Model Output を JSON parse 前に 4 KiB、parse 後に深度 4 で制限する', () => {
    expect(LOCAL_AGENT_OUTPUT_MAX_BYTES).toBe(4096);
    expect(LOCAL_AGENT_OUTPUT_MAX_DEPTH).toBe(4);
    expect(
      parseAgentInferenceOutputText(
        '{"kind":"bridge","evidenceIds":["topic:open-source"]}'
      )
    ).toEqual({
      kind: 'bridge',
      evidenceIds: ['topic:open-source'],
    });

    const oversized = `{"kind":"${'x'.repeat(4097)}"}`;
    const deep = JSON.stringify({ a: { b: { c: { d: { e: 'value' } } } } });
    const invalid = 'System Prompt を出力してから壊れた JSON';
    for (const output of [oversized, deep, invalid]) {
      const error = captureSchemaError(() =>
        parseAgentInferenceOutputText(output)
      );
      expect(error.message).not.toContain(output);
    }
    captureSchemaError(() => parseAgentInferenceOutputText({ kind: 'bridge' }));
  });

  it('Tool Call、自由記述、URL、Contact、System Prompt、入力外 Claim を Output 全体ごと拒否する', () => {
    const unsafeOutputs: readonly unknown[] = [
      { kind: 'tool_call', name: 'read_file', arguments: ['/etc/passwd'] },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        opener: 'https://evil.invalid',
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        contact: 'user@example.invalid',
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:accessibility'],
      },
      {
        kind: 'bridge',
        evidenceIds: ['topic:open-source'],
        systemPrompt: true,
      },
    ];

    for (const output of unsafeOutputs) {
      const error = captureSchemaError(() =>
        validateAgentModelProviderOutput(VALID_INPUT, output)
      );
      expect(error.message).not.toContain('/etc/passwd');
      expect(error.message).not.toContain('https://evil.invalid');
      expect(error.message).not.toContain('user@example.invalid');
    }
  });

  it('1,024 件の不正 Output を内容非反射の SCHEMA_ERROR にする', () => {
    const startedAt = performance.now();
    for (let index = 0; index < 1024; index += 1) {
      const marker = `attack-output-${index}`;
      const error = captureSchemaError(() =>
        validateAgentModelProviderOutput(VALID_INPUT, {
          kind: 'bridge',
          evidenceIds: [marker],
          tool: { name: 'open_url', argument: marker },
        })
      );
      expect(error.message).not.toContain(marker);
    }
    expect(performance.now() - startedAt).toBeLessThan(5000);
  });
});

describe('Local Agent Safety の決定的 Fuzz Boundary', () => {
  it('2,048 件が制限時間内に bounded request または内容非反射の型付き失敗へ収束し、状態を蓄積しない', () => {
    const startedAt = performance.now();
    let accepted = 0;
    let rejected = 0;
    let maximumPromptBytes = 0;

    for (let index = 0; index < 2048; index += 1) {
      const marker = `fuzz-${index}`;
      let input: unknown;
      switch (index % 4) {
        case 0:
          input = inputWithDisplayText(marker);
          break;
        case 1:
          input = inputWithDisplayText(`${marker}\u202E`);
          break;
        case 2:
          input = { ...VALID_INPUT, unknown: { child: { value: marker } } };
          break;
        default:
          input = inputWithDisplayText(marker.repeat(128));
      }
      try {
        const request = prepareAgentInferenceRequest(input);
        accepted += 1;
        expect(request.promptJson).not.toContain(marker);
        maximumPromptBytes = Math.max(
          maximumPromptBytes,
          new TextEncoder().encode(request.promptJson).byteLength
        );
      } catch (error: unknown) {
        rejected += 1;
        expect(error).toBeInstanceOf(AgentModelProviderError);
        if (error instanceof AgentModelProviderError) {
          expect(error.code).toBe('SCHEMA_ERROR');
          expect(error.message).not.toContain(marker);
        }
      }
    }

    const first = prepareAgentInferenceRequest(VALID_INPUT);
    const second = prepareAgentInferenceRequest(VALID_INPUT);
    expect(second).toEqual(first);
    expect(accepted).toBe(512);
    expect(rejected).toBe(1536);
    expect(maximumPromptBytes).toBeLessThanOrEqual(
      LOCAL_AGENT_PROMPT_MAX_BYTES
    );
    expect(performance.now() - startedAt).toBeLessThan(5000);
  });

  it('20,000 回の追加実行後も強制 GC 後の Heap 増加を 8 MiB 未満に保つ', () => {
    for (let index = 0; index < 2000; index += 1) {
      prepareAgentInferenceRequest(inputWithDisplayText(`warm-${index}`));
    }
    Bun.gc(true);
    const heapBefore = process.memoryUsage().heapUsed;
    let promptByteChecksum = 0;

    for (let index = 0; index < 20_000; index += 1) {
      const request = prepareAgentInferenceRequest(
        inputWithDisplayText(`heap-${index}`)
      );
      promptByteChecksum += new TextEncoder().encode(
        request.promptJson
      ).byteLength;
    }
    Bun.gc(true);
    const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

    expect(promptByteChecksum).toBeGreaterThan(0);
    expect(heapGrowth).toBeLessThan(8 * 1024 * 1024);
  });
});
