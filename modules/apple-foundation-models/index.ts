import { requireOptionalNativeModule } from 'expo-modules-core';

interface AppleFoundationModelsNativeModule {
  readonly availability: () => Promise<unknown>;
  readonly complete: (
    systemPrompt: string,
    userPrompt: string,
    schemaJson: string | undefined,
    temperature: number
  ) => Promise<unknown>;
}

const nativeModule =
  requireOptionalNativeModule<AppleFoundationModelsNativeModule>(
    'AppleFoundationModels'
  );

/**
 * Apple 以外のプラットフォーム・Expo Go では Native Module 自体が無いため `null` を返す
 * （`../../src/local-agent/apple-foundation-models-availability.ts` が unavailable へ丸める）。
 */
export function getNativeAppleFoundationModelsAvailability(): Promise<unknown> {
  return nativeModule?.availability() ?? Promise.resolve(null);
}

function nativeModuleUnavailableError(): Error {
  return new Error('AppleFoundationModels native module is unavailable.');
}

/**
 * Native Module 不在（Expo Go / Android / Web ビルド）では型付き失敗を投げ、
 * 呼び出し側（`../../src/local-agent/apple-foundation-models-provider.ts`）が
 * 既存の `LOAD_ERROR` 正規化へそのまま乗せる。`temperature` は Bridge 判定の
 * 既定 `0`（決定的）と会話例の `0.7`（多様性）を呼び出し元がそのまま転送する
 * （Native 側は `temperature > 0` のときだけ `.greedy` から抜ける。ADR-0057）。
 */
export function completeWithNativeAppleFoundationModels(
  systemPrompt: string,
  userPrompt: string,
  schemaJson: string,
  temperature: number
): Promise<unknown> {
  if (!nativeModule) return Promise.reject(nativeModuleUnavailableError());
  return nativeModule.complete(
    systemPrompt,
    userPrompt,
    schemaJson,
    temperature
  );
}
