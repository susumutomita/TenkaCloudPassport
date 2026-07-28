import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';
import { createNativeAgentModelProvider } from './native-agent-model-provider-composition';

function source(fileName: string): Promise<string> {
  return readSourceFile(import.meta.url, fileName);
}

describe('AgentModelProvider の Platform Composition', () => {
  it('Web は llama.rn を参照せず Rules Provider だけを公開する', async () => {
    const web = await source('default-agent-model-provider.web.ts');

    expect(web).toContain('RULES_MODEL_PROVIDER');
    expect(web).not.toContain("from 'llama.rn'");
    expect(web).not.toContain("import('llama.rn')");
    expect(web).not.toContain('loadLlamaModule');
  });

  it('ADR-0057: Native Composition は Apple Foundation Models Native Module を使い、llama.rn には触れない', async () => {
    const composition = await source('default-agent-model-provider.native.ts');

    expect(composition).toContain('completeWithNativeAppleFoundationModels');
    expect(composition).toContain('createNativeAgentModelProvider');
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
    expect(app).toContain('agentModelProvider={agentModelProvider}');
    expect(app).not.toContain('DEFAULT_DISTRIBUTION_CAPABILITY');
    expect(app).not.toContain('distributionCapability');
    expect(app).toContain('createDefaultLocalModelManagement(localDataLeases)');
    expect(app).toContain(
      'localModelManagement={localModelComposition?.management ?? null}'
    );
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
