import { isRunningInExpoGo } from 'expo';
import { loadLlamaModule } from '../local-agent/llama-module-loader.native';
import { createNativeAgentModelProvider } from './native-agent-model-provider-composition';

const modelPath = process.env.EXPO_PUBLIC_LOCAL_MODEL_PATH;
const nCtx = process.env.EXPO_PUBLIC_LOCAL_MODEL_N_CTX;
const nGpuLayers = process.env.EXPO_PUBLIC_LOCAL_MODEL_GPU_LAYERS;
const nPredict = process.env.EXPO_PUBLIC_LOCAL_MODEL_N_PREDICT;

export const DEFAULT_AGENT_MODEL_PROVIDER = createNativeAgentModelProvider({
  runningInExpoGo: isRunningInExpoGo(),
  environment: {
    ...(modelPath === undefined ? {} : { modelPath }),
    ...(nCtx === undefined ? {} : { nCtx }),
    ...(nGpuLayers === undefined ? {} : { nGpuLayers }),
    ...(nPredict === undefined ? {} : { nPredict }),
  },
  loadModule: loadLlamaModule,
});
