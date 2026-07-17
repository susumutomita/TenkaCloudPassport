import type {
  EncounterInput,
  ParticipantOutcome,
} from '../domain/rules-provider';

export interface LocalAgentModule {
  decide(input: EncounterInput): Promise<ParticipantOutcome>;
}

export type LocalAgentModuleLoader = () => Promise<LocalAgentModule>;

export interface LocalAgent {
  readonly kind: 'local-agent';
  decide(input: EncounterInput): Promise<ParticipantOutcome>;
}

export type LocalAgentErrorCode = 'MODULE_LOAD_FAILED' | 'DECISION_FAILED';

export class LocalAgentError extends Error {
  readonly code: LocalAgentErrorCode;

  constructor(code: LocalAgentErrorCode, message: string) {
    super(message);
    this.name = 'LocalAgentError';
    this.code = code;
  }
}

export function createLazyLocalAgent(
  loadModule: LocalAgentModuleLoader
): LocalAgent {
  let modulePromise: Promise<LocalAgentModule> | undefined;
  return {
    kind: 'local-agent',
    async decide(input) {
      let module: LocalAgentModule;
      try {
        modulePromise ??= loadModule();
        module = await modulePromise;
      } catch {
        modulePromise = undefined;
        throw new LocalAgentError(
          'MODULE_LOAD_FAILED',
          'Development Build の Local Agent module を読み込めませんでした。'
        );
      }
      try {
        return await module.decide(input);
      } catch {
        throw new LocalAgentError(
          'DECISION_FAILED',
          'Local Agent は検証可能な判定結果を返せませんでした。'
        );
      }
    },
  };
}
