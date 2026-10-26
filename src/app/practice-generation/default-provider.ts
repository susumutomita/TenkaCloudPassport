import type { GenerationPort } from './provider';

export function createGenerationProvider(): GenerationPort {
  return {
    availability: async () => 'unsupported-platform',
    generate: async () => {
      throw new Error('Apple Intelligence requires an iOS native build.');
    },
  };
}
