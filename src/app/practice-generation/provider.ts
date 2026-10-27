import {
  type PracticeDraft,
  validateDraft,
} from '../../domain/crypto-practice/catalog';
import { createRoundId } from '../../domain/session-identifiers';
import { webCryptoRandomBytes } from '../../protocol/web-crypto-random';
import {
  boundedGeneration,
  type GenerationClock,
  generationClock,
} from './deadline';

export const GENERATION_AVAILABILITY = [
  'available',
  'unsupported-platform',
  'native-build-required',
  'unsupported-os',
  'device-not-eligible',
  'apple-intelligence-not-enabled',
  'model-not-ready',
  'unknown',
] as const;
export type GenerationAvailability = (typeof GENERATION_AVAILABILITY)[number];
export interface GenerationPort {
  availability(): Promise<GenerationAvailability>;
  generate(signal?: AbortSignal): Promise<PracticeDraft>;
}
export interface GenerationBridge {
  availability(): Promise<unknown>;
  prepare(requestID: string): Promise<void>;
  generate(requestID: string): Promise<unknown>;
  cancel(requestID: string): Promise<void>;
}
/** Reject unknown/native failures; never substitute cloud inference or fake success. */
export function generationProvider(
  bridge: GenerationBridge,
  clock: GenerationClock = generationClock
): GenerationPort {
  let active: {
    id: string;
    prepared: boolean;
    cancelled: boolean;
    cancellationUncertain: boolean;
  } | null = null;
  return {
    async availability() {
      if (active?.cancellationUncertain)
        throw new Error('Native cancellation has not been confirmed.');
      const value = await bridge.availability();
      return (
        GENERATION_AVAILABILITY.find((entry) => entry === value) ?? 'unknown'
      );
    },
    async generate(signal) {
      if (active) throw new Error('Generation is already running.');
      if (signal?.aborted) throw new Error('Generation cancelled.');
      const owner = {
        id: createRoundId(webCryptoRandomBytes),
        prepared: false,
        cancelled: false,
        cancellationUncertain: false,
      };
      active = owner;
      const operation = (async () => {
        if ((await bridge.availability()) !== 'available')
          throw new Error('Apple Intelligence is currently unavailable.');
        if (owner.cancelled || signal?.aborted)
          throw new Error('Generation cancelled.');
        await bridge.prepare(owner.id);
        owner.prepared = true;
        if (owner.cancelled || signal?.aborted) {
          await bridge.cancel(owner.id);
          throw new Error('Generation cancelled.');
        }
        return validateDraft(await bridge.generate(owner.id));
      })();
      const settle = () => {
        if (active === owner) active = null;
      };
      void operation.then(settle, settle);
      return boundedGeneration(
        operation,
        () => {
          owner.cancelled = true;
          return owner.prepared ? bridge.cancel(owner.id) : Promise.resolve();
        },
        () => {
          if (active === owner) owner.cancellationUncertain = true;
        },
        clock,
        signal
      );
    },
  };
}
