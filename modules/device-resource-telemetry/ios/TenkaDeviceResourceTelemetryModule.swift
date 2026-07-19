import ExpoModulesCore
import MachO
import UIKit

public final class TenkaDeviceResourceTelemetryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenkaDeviceResourceTelemetry")

    AsyncFunction("getSnapshot") { () -> [String: Any?] in
      let resident = self.residentMemoryBytes()
      let physical = Int64(ProcessInfo.processInfo.physicalMemory)
      let device = UIDevice.current
      device.isBatteryMonitoringEnabled = true
      let batteryLevel = device.batteryLevel

      return [
        "physicalMemoryBytes": physical,
        // iOS の public Swift API から取得できない hard limit を推測値で偽装しない。
        "processMemoryLimitBytes": nil,
        "processMemoryBytes": resident,
        "thermalState": self.thermalState(),
        "batteryLevelPermille": batteryLevel < 0
          ? nil
          : Int((batteryLevel * 1_000).rounded())
      ]
    }.runOnQueue(.main)
  }

  private func residentMemoryBytes() -> Int64? {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(
          mach_task_self_,
          task_flavor_t(MACH_TASK_BASIC_INFO),
          $0,
          &count
        )
      }
    }
    return result == KERN_SUCCESS ? Int64(info.resident_size) : nil
  }

  private func thermalState() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal:
      return "nominal"
    case .fair:
      return "fair"
    case .serious:
      return "serious"
    case .critical:
      return "critical"
    @unknown default:
      return "unknown"
    }
  }
}
