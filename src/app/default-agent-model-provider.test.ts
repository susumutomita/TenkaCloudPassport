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

    const expoGo = createNativeAgentModelProvider({
      runningInExpoGo: true,
      environment,
      loadModule,
    });
    const developmentBuild = createNativeAgentModelProvider({
      runningInExpoGo: false,
      environment,
      loadModule,
    });

    expect(expoGo.kind).toBe('rules');
    expect(developmentBuild.kind).toBe('local-agent');
  });

  it('App Composition Root は Platform Provider を PassportApp へ明示的に渡す', async () => {
    const app = await source('../../App.tsx');

    expect(app).toContain('DEFAULT_AGENT_MODEL_PROVIDER');
    expect(app).toContain('agentModelProvider={DEFAULT_AGENT_MODEL_PROVIDER}');
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
