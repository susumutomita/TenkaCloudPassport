import { describe, expect, it } from 'bun:test';
import type { AgentModelInput } from '../domain/agent-model-provider';
import { publicPassportWithClues as passport } from '../domain/domain-test-kit';
import { readSourceFile } from '../screens/accessibility-test-kit';
import {
  createAgentProviderSessionRunner,
  INITIAL_PROVIDER_RUNTIME_STATE,
  type ProviderRuntimeState,
} from './agent-provider-session';
import { conversationExampleGeneratorForProvider } from './conversation-example-capability';
import {
  createNativeAgentModelProvider,
  resolveNativeAgentModelProviderAtStartup,
} from './native-agent-model-provider-composition';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

const SAMPLE_INPUT: AgentModelInput = {
  ownerPassport: passport(['open-source']),
  encounteredPassport: passport(['open-source']),
  language: 'ja',
  deadlineAtWallClockMs: 4_102_444_800_000,
};

describe('AgentModelProvider の Platform Composition', () => {
  it('Web は llama.rn を参照せず Rules Provider だけを公開する', async () => {
    const web = await source('default-agent-model-provider.web.ts');

    expect(web).toContain('rulesOnlyAgentModelProviderStartupResult');
    expect(web).not.toContain("from 'llama.rn'");
    expect(web).not.toContain("import('llama.rn')");
    expect(web).not.toContain('loadLlamaModule');
  });

  it('ADR-0057: Native Composition は Apple Foundation Models Native Module を使い、llama.rn には触れない', async () => {
    const composition = await source('default-agent-model-provider.native.ts');

    expect(composition).toContain('completeWithNativeAppleFoundationModels');
    expect(composition).toContain('resolveNativeAgentModelProviderAtStartup');
    expect(composition).toContain('getNativeAppleFoundationModelsAvailability');
    expect(composition).toContain('isRunningInExpoGo()');
    expect(composition).not.toContain("from 'llama.rn'");
    expect(composition).not.toContain('loadLlamaModule');
    expect(composition).not.toContain('process.env.EXPO_PUBLIC_LOCAL_MODEL');
  });

  it('llama.rn の動的 import loader は Model Lifecycle（残置コード）向けに引き続き Top-level import しない', async () => {
    const loader = await source('../local-agent/llama-module-loader.native.ts');

    expect(loader).not.toContain("from 'llama.rn'");
    expect(loader).toContain("await import('llama.rn')");
  });

  it('ADR-0057: Expo Go は Rules、Development Build は Apple Intelligence Provider を選び、選定時点では Native Module を呼ばない', () => {
    let completeCalls = 0;
    const appleFoundationModels = {
      complete: async () => {
        completeCalls += 1;
        throw new Error(
          'この Composition Test では Native Module を実行しません。'
        );
      },
    };

    const expoGo = createNativeAgentModelProvider({
      runningInExpoGo: true,
      appleFoundationModels,
    });
    const developmentBuild = createNativeAgentModelProvider({
      runningInExpoGo: false,
      appleFoundationModels,
    });

    expect(expoGo.kind).toBe('rules');
    expect(developmentBuild.kind).toBe('local-agent');
    // Provider の選定は Native Module を呼ばない。Apple Intelligence の
    // Availability 判定は実際に `provide()` が呼ばれたときの型付き失敗
    // （LOAD_ERROR）として現れ、`runProviderOnce` の Fallback-once が
    // Rules へ倒す。
    expect(completeCalls).toBe(0);
  });

  it('App Composition Root は Platform Provider を PassportApp へ明示的に渡す（Issue 118: distributionCapability は SettingsScreen が使わなくなり App Composition からも外した）', async () => {
    const app = await source('../../App.tsx');

    expect(app).toContain('createDefaultAgentModelProvider(localDataLeases)');
    expect(app).toContain(
      'agentModelProvider={agentModelProviderStartup.provider}'
    );
    expect(app).not.toContain('DEFAULT_DISTRIBUTION_CAPABILITY');
    expect(app).not.toContain('distributionCapability');
    expect(app).toContain('createDefaultLocalModelManagement(localDataLeases)');
    expect(app).toContain(
      'localModelManagement={localModelComposition?.management ?? null}'
    );
  });

  it('Follow-up F-983000: App Composition Root は Provider を Promise で受け取り、解決するまで PassportApp をマウントしない', async () => {
    const app = await source('../../App.tsx');

    expect(app).toContain('AgentModelProviderStartupResult');
    expect(app).toContain(
      'const [agentModelProviderStartup, setAgentModelProviderStartup] ='
    );
    expect(app).toMatch(/agentModelProviderStartup \? \(/);
    expect(app).toContain('appleIntelligenceUnavailable={');
    expect(app).toContain(
      'agentModelProviderStartup.appleIntelligenceUnavailable'
    );
  });

  describe('Follow-up F-983000: 起動時 Availability Gate（resolveNativeAgentModelProviderAtStartup）', () => {
    it('Expo Go では Availability を問い合わせず、常に Rules Provider を返す', async () => {
      let checkCalls = 0;
      const result = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: true,
        appleFoundationModels: { complete: async () => ({}) },
        checkAvailability: async () => {
          checkCalls += 1;
          return 'available';
        },
      });

      expect(result.provider.kind).toBe('rules');
      expect(result.appleIntelligenceUnavailable).toBe(true);
      expect(checkCalls).toBe(0);
    });

    it.each([
      'unavailable-device-not-eligible',
      'unavailable-apple-intelligence-not-enabled',
      'unavailable-model-not-ready',
      'unavailable-unsupported-os',
      'unavailable-unknown',
      'garbage-value-that-does-not-parse',
    ])('Development Build かつ Availability が %s のとき Rules Provider へ倒す（通知フラッシュを起こさないため kind を最初から rules にする）', async (rawAvailability) => {
      const result = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: false,
        appleFoundationModels: { complete: async () => ({}) },
        checkAvailability: async () => rawAvailability,
      });

      expect(result.provider.kind).toBe('rules');
      expect(result.appleIntelligenceUnavailable).toBe(true);
    });

    it('Development Build かつ Availability が available のとき Apple Intelligence Provider（local-agent）を返し、この時点では Native complete() を呼ばない', async () => {
      let completeCalls = 0;
      const result = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: false,
        appleFoundationModels: {
          complete: async () => {
            completeCalls += 1;
            throw new Error('この Composition Test では呼ばれないはずです。');
          },
        },
        checkAvailability: async () => 'available',
      });

      expect(result.provider.kind).toBe('local-agent');
      expect(result.appleIntelligenceUnavailable).toBe(false);
      expect(completeCalls).toBe(0);
    });

    it('Native Availability の読み取り自体が例外を投げても fail-closed に Rules Provider へ倒す', async () => {
      const result = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: false,
        appleFoundationModels: { complete: async () => ({}) },
        checkAvailability: async () => {
          throw new Error('Native Module でエラーが発生しました。');
        },
      });

      expect(result.provider.kind).toBe('rules');
      expect(result.appleIntelligenceUnavailable).toBe(true);
    });
  });

  describe('Follow-up F-983000: 起動時 Gate が実際の Encounter 実行へ与える効果（受入基準 a・b の実行検証）', () => {
    it('(a) 非対応端末: 起動時 Gate が返す Provider を渡すと、Encounter を実行しても onStateChange が一度も呼ばれない（loading-local-model への遷移＝通知フラッシュが起きない）', async () => {
      const { provider } = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: false,
        appleFoundationModels: { complete: async () => ({}) },
        checkAvailability: async () => 'unavailable-device-not-eligible',
      });
      const stateChanges: ProviderRuntimeState[] = [];
      const runner = createAgentProviderSessionRunner();

      const result = await runner.run({
        state: INITIAL_PROVIDER_RUNTIME_STATE,
        encounterKey: 'encounter-unavailable-device',
        provider,
        input: SAMPLE_INPUT,
        onStateChange: (state) => stateChanges.push(state),
      });

      expect(stateChanges).toEqual([]);
      expect(result.outcome.settledBy).toBe('primary');
      expect(result.outcome.providerKind).toBe('rules');
    });

    it('(b) 対応端末: 起動時 Gate が返す Provider は会話例 Generator を持ち、AI 同士の会話（settledBy === "primary"）に使える', async () => {
      const { provider } = await resolveNativeAgentModelProviderAtStartup({
        runningInExpoGo: false,
        appleFoundationModels: {
          complete: async () => JSON.stringify({ kind: 'no-signal' }),
        },
        checkAvailability: async () => 'available',
      });

      expect(conversationExampleGeneratorForProvider(provider)).not.toBeNull();

      const runner = createAgentProviderSessionRunner();
      const result = await runner.run({
        state: INITIAL_PROVIDER_RUNTIME_STATE,
        encounterKey: 'encounter-available-device',
        provider,
        input: SAMPLE_INPUT,
      });

      expect(result.outcome.settledBy).toBe('primary');
      expect(result.outcome.providerKind).toBe('local-agent');
    });
  });

  it('Issue 18: Web / Expo Go は管理を無効化し、Development Build だけが private lifecycle を組み立てる', async () => {
    const fallback = await source('default-local-model-management.ts');
    const native = await source('default-local-model-management.native.ts');

    expect(fallback).toContain('createDefaultLocalModelManagement');
    expect(native).toContain('isRunningInExpoGo()');
    expect(native).toContain('createExpoModelFileStore()');
    expect(native).toContain('createLlamaModelInspector()');
    expect(native).toContain('createDeviceResourceTelemetry()');
    expect(native).toContain('createLocalModelLifecycle({');
    expect(native).toContain(
      'createLocalModelLifecycleStorageAdapter(lifecycle, fileStore)'
    );
    expect(native).not.toContain("from 'llama.rn'");
  });

  it('Issue 18: Picker は Owner 確定前に cache copy せず、Telemetry は端末識別 API を参照しない', async () => {
    const fileStore = await source(
      '../local-agent/expo-model-file-store.native.ts'
    );
    const apple = await source(
      '../../modules/device-resource-telemetry/ios/TenkaDeviceResourceTelemetryModule.swift'
    );
    const android = await source(
      '../../modules/device-resource-telemetry/android/src/main/java/cloud/tenka/passport/deviceresourcetelemetry/TenkaDeviceResourceTelemetryModule.kt'
    );

    expect(fileStore).toContain('copyToCacheDirectory: false');
    expect(fileStore).toContain('Paths.document');
    expect(fileStore).toContain('atomicWriteManifest');
    expect(fileStore).toContain('exactManagedFile(privateUri');
    // ADR-0045（Issue 152）: app-private data container の UUID は再インストール・
    // Clean Build・App 更新のたびに変わるため、絶対 URI の一致で境界を判定しない。
    // file 名の allow-list pattern 検証（`resolveManagedFileName`）だけを境界にし、
    // 常に現在の `modelDirectory()` から Path を再構築する。
    expect(fileStore).toContain('resolveManagedFileName(privateUri, pattern)');
    expect(fileStore).not.toContain('outside app-private storage');
    expect(fileStore).toContain('resolveManagedModelUri(sha256)');
    expect(fileStore).toContain('matchingDeletionFiles(stagedUri, privateUri)');
    for (const sourceText of [apple, android]) {
      expect(sourceText).not.toMatch(
        /identifierForVendor|ANDROID_ID|Build\.SERIAL|AdvertisingId|deviceName/
      );
    }
  });

  it('Issue 18: Local Telemetry module は Apple Pod と Android Library の両方を autolink できる構成を持つ', async () => {
    const config = await source(
      '../../modules/device-resource-telemetry/expo-module.config.json'
    );
    const gitignore = await source('../../.gitignore');
    const podspec = await source(
      '../../modules/device-resource-telemetry/ios/TenkaDeviceResourceTelemetry.podspec'
    );
    const gradle = await source(
      '../../modules/device-resource-telemetry/android/build.gradle'
    );
    const manifest = await source(
      '../../modules/device-resource-telemetry/android/src/main/AndroidManifest.xml'
    );

    expect(config).toContain('TenkaDeviceResourceTelemetryModule');
    expect(gitignore).toContain('/ios/');
    expect(gitignore).toContain('/android/');
    expect(gitignore).not.toMatch(/^ios\/$/m);
    expect(gitignore).not.toMatch(/^android\/$/m);
    expect(podspec).toContain("spec.dependency 'ExpoModulesCore'");
    expect(podspec).toContain(
      "spec.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'"
    );
    expect(gradle).toContain("id 'expo-module-gradle-plugin'");
    expect(gradle).toContain(
      "namespace 'cloud.tenka.passport.deviceresourcetelemetry'"
    );
    expect(manifest).toContain('<manifest');
  });

  it('Expo Config は New Architecture と再現可能な llama Plugin Option を固定する', async () => {
    const config = await source('../../app.json');

    expect(config).toContain('"newArchEnabled": true');
    expect(config).toContain('"llama.rn"');
    expect(config).toContain('"forceCxx20": true');
    expect(config).toContain('"enableOpenCLAndHexagon": true');
    expect(config).toContain('"expo-build-properties"');
  });

  it('Issue 94: Expo Config は Cloudflare Workers の /app/ サブパス配信用 baseUrl を固定する', async () => {
    const config = await source('../../app.json');
    const parsed = JSON.parse(config) as {
      expo?: { experiments?: { baseUrl?: string } };
    };

    expect(config).toContain('"baseUrl": "/app"');
    expect(parsed.expo?.experiments?.baseUrl).toBe('/app');
    expect(parsed.expo?.experiments?.baseUrl?.endsWith('/')).toBe(false);
  });

  it('stageModelDeletion の move 後整合チェックは旧パスの新しい File で行う（Issue 152: File.move は成功時に instance の uri を移動先へ付け替えるため、source.exists を見ると成功でも常に incomplete と誤判定して削除が必ず失敗していた）', async () => {
    const store = await source(
      '../local-agent/expo-model-file-store.native.ts'
    );

    expect(store).toContain(
      'const original = new File(modelDirectory(), `${sha256}.gguf`);'
    );
    expect(store).toContain('if (original.exists || !staged.exists)');
    expect(store).not.toContain('if (source.exists || !staged.exists)');
  });
});
