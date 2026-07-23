import ExpoModulesCore
import MachO
import UIKit
import os

public final class TenkaDeviceResourceTelemetryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenkaDeviceResourceTelemetry")

    AsyncFunction("getSnapshot") { () -> [String: Any?] in
      let footprint = self.physFootprintBytes()
      let physical = Int64(ProcessInfo.processInfo.physicalMemory)
      let device = UIDevice.current
      device.isBatteryMonitoringEnabled = true
      let batteryLevel = device.batteryLevel

      return [
        "physicalMemoryBytes": physical,
        // Issue 104 Priority 2（Bonsai-ready 化）: `os_proc_available_memory()`
        // （iOS の public C API、`<os/proc.h>`）で実測する。以前はここを常に
        // `nil` にしていた（推測値で偽装しないため）が、Bonsai 27B 級の大きな
        // Model を起動可否ゲート（`evaluateModelResourceRisk`）へ接続するには
        // 実測値が要る。code-reviewer 指摘: `os_proc_available_memory()` 単体は
        // 「あと確保できる残り」であり、Android 実装（`processCeiling = min(
        // totalMem, availMem + residentMemoryBytes)`）が返す「現在の使用量を
        // 含めた到達可能上限」とは意味が異なる（同じ effectiveMemoryBytes 計算
        // 式で分母として扱われるため、意味を揃える）。`phys_footprint`（現在の
        // 使用量）を足し戻し、`physicalMemoryBytes` を上限に丸めて Android と
        // 同じ「到達しうる Ceiling」を返す。
        "processMemoryLimitBytes": self.processMemoryCeilingBytes(
          footprint: footprint,
          physicalMemoryBytes: physical
        ),
        // Issue 104 PR #132（Codex 指摘 major）: この値は `os_proc_available_memory()`
        // （Process 単位の実測 Ceiling）由来であり、Android の `system-wide-available`
        // （端末全体の空き容量、Process 専用の割当上限ではない）とは信頼度が異なる。
        // TS 側（`local-model-manifest.ts` の `evaluateModelResourceRisk`）がこの
        // provenance を見て Android 値だけを保守的に割り引く。
        "processMemoryLimitProvenance": "os-process-ceiling",
        "processMemoryBytes": footprint,
        "thermalState": self.thermalState(),
        "batteryLevelPermille": batteryLevel < 0
          ? nil
          : Int((batteryLevel * 1_000).rounded())
      ]
    }.runOnQueue(.main)
  }

  /**
   * Issue 104 Priority 2（Bonsai-ready 化）: `task_info(MACH_TASK_BASIC_INFO)` の
   * `resident_size` は compressed memory を含まないため、Xcode の Memory Gauge・
   * Apple 自身が「実際のメモリ使用量」の指標として推奨する `phys_footprint`
   * （`task_info(TASK_VM_INFO)`）へ置き換える。
   */
  private func physFootprintBytes() -> Int64? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(
          mach_task_self_,
          task_flavor_t(TASK_VM_INFO),
          $0,
          &count
        )
      }
    }
    guard result == KERN_SUCCESS, count >= TASK_VM_INFO_REV1_COUNT else {
      return nil
    }
    return Int64(info.phys_footprint)
  }

  /**
   * この Process が OOM Kill されるまでにあと確保できる概算 byte 数
   * （iOS の public C API、`os_proc_available_memory()`）。呼び出しごとの
   * 瞬間値であり、キャッシュしない（Apple のドキュメント上の注意事項）。
   */
  private func availableMemoryBytes() -> Int64? {
    let available = os_proc_available_memory()
    return available > 0 ? Int64(available) : nil
  }

  /**
   * 「現在の使用量（`phys_footprint`）+ あと確保できる残り
   * （`os_proc_available_memory()`）」を、Android 実装
   * （`TenkaDeviceResourceTelemetryModule.kt` の `processCeiling`）と同じ
   * 「この Process が到達しうる Memory の上限」という意味に揃える。
   * `physicalMemoryBytes` を超えないよう丸める（Android の `min(totalMem, ...)`
   * と同じ安全策）。どちらかを実測できない場合は `nil`（推測値で埋めない）。
   */
  private func processMemoryCeilingBytes(
    footprint: Int64?,
    physicalMemoryBytes: Int64
  ) -> Int64? {
    guard let footprint = footprint,
          let available = availableMemoryBytes() else {
      return nil
    }
    return min(physicalMemoryBytes, footprint + available)
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
