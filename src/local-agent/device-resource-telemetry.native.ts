import { getNativeDeviceResourceSnapshot } from '../../modules/device-resource-telemetry';
import { parseDeviceResourceSnapshot } from './device-resource-snapshot';
import type { DeviceResourceTelemetry } from './model-lifecycle';

export function createDeviceResourceTelemetry(): DeviceResourceTelemetry {
  return {
    async snapshot() {
      return parseDeviceResourceSnapshot(
        await getNativeDeviceResourceSnapshot()
      );
    },
  };
}
