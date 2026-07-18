import { RULES_MODEL_PROVIDER } from '../domain/agent-model-provider';

/** Web module graph は `llama.rn` を参照せず、常に Rules Provider を使う。 */
export const DEFAULT_AGENT_MODEL_PROVIDER = RULES_MODEL_PROVIDER;
