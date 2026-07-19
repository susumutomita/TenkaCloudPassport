import type { LlamaModulePort } from './llama-agent-model-provider';

/** `llama.rn` の Runtime import をこの関数内だけへ閉じ込める Native Platform 境界。 */
export async function loadLlamaModule(): Promise<LlamaModulePort> {
  const llama = await import('llama.rn');
  return {
    async initLlama(parameters) {
      const context = await llama.initLlama(parameters);
      return {
        completion(completionParameters, onToken) {
          return context.completion(
            {
              messages: completionParameters.messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
              n_predict: completionParameters.n_predict,
              temperature: completionParameters.temperature,
              response_format: completionParameters.response_format,
            },
            onToken
          );
        },
        stopCompletion() {
          return context.stopCompletion();
        },
        release() {
          return context.release();
        },
      };
    },
  };
}
