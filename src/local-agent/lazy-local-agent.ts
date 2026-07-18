import {
  type AgentModelFailureCode,
  AgentModelProviderError,
  normalizeAgentModelFailureCode,
} from '../domain/agent-model-provider';
import {
  createSafetyBoundLocalModelProvider,
  type LocalModelCompletionPort,
  type LocalModelRequest,
} from './model-safety-boundary';

/** Development Build の Native module が実装する最小 Port。Passport は受け取れない。 */
export interface LocalAgentModule {
  complete(request: LocalModelRequest): unknown | Promise<unknown>;
}

export type LocalAgentModuleLoader = () => Promise<LocalAgentModule>;
export type LocalAgent = ReturnType<typeof createSafetyBoundLocalModelProvider>;

function safeLocalAgentError(
  code: AgentModelFailureCode = 'LOAD_ERROR'
): AgentModelProviderError {
  return new AgentModelProviderError(
    code,
    'Local Agent は安全に完了できませんでした。'
  );
}

/**
 * Native module の遅延読込を Safety Boundary の Completion Port に閉じ込める。
 * module は canonical Evidence Request だけを受け、AgentModelInput / Passport を参照できない。
 */
export function createLazyLocalAgent(
  loadModule: LocalAgentModuleLoader
): LocalAgent {
  let modulePromise: Promise<LocalAgentModule> | undefined;
  const completionPort: LocalModelCompletionPort = {
    async complete(request) {
      let module: LocalAgentModule;
      try {
        modulePromise ??= loadModule();
        module = await modulePromise;
      } catch {
        modulePromise = undefined;
        throw safeLocalAgentError();
      }
      try {
        return await module.complete(request);
      } catch (error: unknown) {
        if (error instanceof AgentModelProviderError) {
          throw safeLocalAgentError(normalizeAgentModelFailureCode(error.code));
        }
        throw safeLocalAgentError();
      }
    },
  };
  return createSafetyBoundLocalModelProvider(completionPort);
}
