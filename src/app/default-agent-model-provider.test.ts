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

  it('Expo Config は New Architecture と再現可能な llama Plugin Option を固定する', async () => {
    const config = await source('../../app.json');

    expect(config).toContain('"newArchEnabled": true');
    expect(config).toContain('"llama.rn"');
    expect(config).toContain('"forceCxx20": true');
    expect(config).toContain('"enableOpenCLAndHexagon": true');
    expect(config).toContain('"expo-build-properties"');
  });
});
