import { isRunningInExpoGo } from 'expo';
import { distributionCapabilityForRuntime } from './distribution-capability';

export const DEFAULT_DISTRIBUTION_CAPABILITY = distributionCapabilityForRuntime(
  isRunningInExpoGo() ? 'expo-go' : 'native-build'
);
