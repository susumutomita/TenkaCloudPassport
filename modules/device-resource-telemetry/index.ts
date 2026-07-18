import { requireOptionalNativeModule } from 'expo-modules-core';

interface DeviceResourceTelemetryNativeModule {
  readonly getSnapshot: () => Promise<unknown>;
}

const nativeModule =
  requireOptionalNativeModule<DeviceResourceTelemetryNativeModule>(
    'TenkaDeviceResourceTelemetry'
  );

/** Expo Go では null、Development Build では内容を持たない資源 snapshot を返す。 */
export function getNativeDeviceResourceSnapshot(): Promise<unknown> {
  return nativeModule?.getSnapshot() ?? Promise.resolve(null);
}
