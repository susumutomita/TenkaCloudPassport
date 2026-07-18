declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_LOCAL_MODEL_PATH?: string;
    readonly EXPO_PUBLIC_LOCAL_MODEL_N_CTX?: string;
    readonly EXPO_PUBLIC_LOCAL_MODEL_GPU_LAYERS?: string;
    readonly EXPO_PUBLIC_LOCAL_MODEL_N_PREDICT?: string;
  }
}
