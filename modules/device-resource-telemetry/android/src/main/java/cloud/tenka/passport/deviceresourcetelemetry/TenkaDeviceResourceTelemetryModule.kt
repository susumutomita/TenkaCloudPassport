package cloud.tenka.passport.deviceresourcetelemetry

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.min

class TenkaDeviceResourceTelemetryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TenkaDeviceResourceTelemetry")

    AsyncFunction("getSnapshot") {
      val context = appContext.reactContext
        ?: return@AsyncFunction unavailableSnapshot()
      val activityManager =
        context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memoryInfo)
      val residentMemoryBytes = Debug.getPss().toLong() * 1_024L
      // Issue 104 PR #132（Codex 指摘 major）: `memoryInfo.availMem` は端末全体の
      // 空き容量であり、この App 専用の割当上限ではない（他 App の状態次第で
      // 変動する。Android には iOS の `os_proc_available_memory()` に相当する
      // Process 単位の公開 API が無い）。TS 側（`local-model-manifest.ts` の
      // `evaluateModelResourceRisk`）へ `system-wide-available` として伝え、
      // iOS の `os-process-ceiling`（Process 単位の実測 Ceiling）と同じ信頼度
      // で扱わせない（保守的な割引はドメイン層の責務にし、Native 側の値自体は
      // 偽装しない）。
      val processCeiling = min(
        memoryInfo.totalMem,
        memoryInfo.availMem + residentMemoryBytes
      )

      mapOf(
        "physicalMemoryBytes" to positiveOrNull(memoryInfo.totalMem),
        "processMemoryLimitBytes" to positiveOrNull(processCeiling),
        "processMemoryLimitProvenance" to "system-wide-available",
        "processMemoryBytes" to positiveOrNull(residentMemoryBytes),
        "thermalState" to thermalState(context),
        "batteryLevelPermille" to batteryLevelPermille(context)
      )
    }
  }

  private fun unavailableSnapshot(): Map<String, Any?> = mapOf(
    "physicalMemoryBytes" to null,
    "processMemoryLimitBytes" to null,
    "processMemoryLimitProvenance" to "unavailable",
    "processMemoryBytes" to null,
    "thermalState" to "unknown",
    "batteryLevelPermille" to null
  )

  private fun positiveOrNull(value: Long): Long? = value.takeIf { it > 0L }

  private fun thermalState(context: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unknown"
    val powerManager =
      context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return when (powerManager.currentThermalStatus) {
      PowerManager.THERMAL_STATUS_NONE -> "nominal"
      PowerManager.THERMAL_STATUS_LIGHT -> "fair"
      PowerManager.THERMAL_STATUS_MODERATE -> "fair"
      PowerManager.THERMAL_STATUS_SEVERE -> "serious"
      PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
      PowerManager.THERMAL_STATUS_EMERGENCY -> "critical"
      PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
      else -> "unknown"
    }
  }

  private fun batteryLevelPermille(context: Context): Int? {
    val batteryManager =
      context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val percent = batteryManager.getIntProperty(
      BatteryManager.BATTERY_PROPERTY_CAPACITY
    )
    return percent.takeIf { it in 0..100 }?.times(10)
  }
}
