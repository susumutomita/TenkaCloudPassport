import type { LocalModelInspector } from './model-lifecycle';

/** llama.rn の GGUF parse だけを公開し、Model Context は初期化しない。 */
export function createLlamaModelInspector(): LocalModelInspector {
  return {
    async inspect(privateUri) {
      const llama = await import('llama.rn');
      return llama.loadLlamaModelInfo(privateUri);
    },
  };
}
