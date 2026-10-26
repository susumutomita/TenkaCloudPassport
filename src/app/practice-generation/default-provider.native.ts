import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { type GenerationBridge, generationProvider } from './provider';

export function createGenerationProvider() {
  // An Expo Go / older binary has no local module. No model call is attempted.
  const bridge =
    Platform.OS === 'ios'
      ? requireOptionalNativeModule<GenerationBridge>(
          'PassportPracticeGeneration'
        )
      : null;
  return generationProvider(
    bridge ?? {
      availability: async () =>
        Platform.OS === 'ios'
          ? 'native-build-required'
          : 'unsupported-platform',
      generate: async () => {
        throw new Error('Native generation module unavailable.');
      },
      prepare: async () => {
        throw new Error('Native generation module unavailable.');
      },
      cancel: async () => {
        throw new Error('Native generation module unavailable.');
      },
    }
  );
}
