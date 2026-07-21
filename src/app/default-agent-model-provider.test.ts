import { describe, expect, it } from 'bun:test';
import { readSourceFile } from '../screens/accessibility-test-kit';
import { LocalModelContextLeaseRegistry } from './local-data-control';
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

  it('Native Composition は llama.rn を Top-level import せず関数内でだけ動的に読む', async () => {
    const composition = await source('default-agent-model-provider.native.ts');
    const loader = await source('../local-agent/llama-module-loader.native.ts');

    expect(composition).not.toContain("from 'llama.rn'");
    expect(composition).toContain('createNativeAgentModelProvider');
    expect(composition).toContain('isRunningInExpoGo()');
    expect(composition).toContain('process.env.EXPO_PUBLIC_LOCAL_MODEL_PATH');
    expect(composition).not.toContain('} = process.env');
    expect(loader).not.toContain("from 'llama.rn'");
    expect(loader).toContain("await import('llama.rn')");
  });

  it('Expo Go は Model 設定があっても Rules、Development Build は Local を選ぶ', () => {
    const environment = {
      modelPath: 'file:///data/model.gguf',
      nCtx: '2048',
      nGpuLayers: '0',
      nPredict: '96',
    } as const;
    const loadModule = async () => {
      throw new Error(
        'この Composition Test では Native Module を実行しません。'
      );
    };
    const modelContexts = new LocalModelContextLeaseRegistry(false);

    const expoGo = createNativeAgentModelProvider({
      runningInExpoGo: true,
      environment,
      loadModule,
      modelContexts,
    });
    const developmentBuild = createNativeAgentModelProvider({
      runningInExpoGo: false,
      environment,
      loadModule,
      modelContexts,
    });

    expect(expoGo.kind).toBe('rules');
    expect(developmentBuild.kind).toBe('local-agent');
  });

  it('App Composition Root は Platform Provider を PassportApp へ明示的に渡す', async () => {
    const app = await source('../../App.tsx');

    expect(app).toContain('createDefaultAgentModelProvider(localDataLeases)');
    expect(app).toContain('agentModelProvider={agentModelProvider}');
    expect(app).toContain('DEFAULT_DISTRIBUTION_CAPABILITY');
    expect(app).toContain(
      'distributionCapability={DEFAULT_DISTRIBUTION_CAPABILITY}'
    );
    expect(app).toContain('createDefaultLocalModelManagement(localDataLeases)');
    expect(app).toContain(
      'localModelManagement={localModelComposition?.management ?? null}'
    );
  });

  it('Issue 28: Web / Expo Go / Native Build の Runtime capability を Platform Composition で分離する', async () => {
    const fallback = await source('default-distribution-capability.ts');
    const web = await source('default-distribution-capability.web.ts');
    const native = await source('default-distribution-capability.native.ts');

    expect(fallback).toContain("distributionCapabilityForRuntime('expo-go')");
    expect(web).toContain("distributionCapabilityForRuntime('web')");
    expect(native).toMatch(
      /isRunningInExpoGo\(\)\s*\?\s*'expo-go'\s*:\s*'native-build'/
    );
    expect(native).not.toContain("'development-build'");
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
    expect(fileStore).toContain(
      "throw new Error('Managed model file is outside app-private storage.')"
    );
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
});
