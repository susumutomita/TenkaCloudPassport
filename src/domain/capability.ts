export const RULES_PROVIDER_CAPABILITY = 'rules-provider-v1' as const;
export const LOCAL_LLM_CAPABILITY = 'local-llm-v1' as const;
export const CAPABILITY_MAX_SUPPORTED = 8;
export const CAPABILITY_MAX_REQUIRED = 4;
export const CAPABILITY_TOKEN_MAX_LENGTH = 32;

export type CapabilityToken = `${string}-v${number}`;

export function isCapabilityToken(value: string): value is CapabilityToken {
  return (
    value.length <= CAPABILITY_TOKEN_MAX_LENGTH &&
    /^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(value)
  );
}
