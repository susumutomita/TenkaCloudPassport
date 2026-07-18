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
      val processCeiling = min(
        memoryInfo.totalMem,
        memoryInfo.availMem + residentMemoryBytes
      )

      mapOf(
        "physicalMemoryBytes" to positiveOrNull(memoryInfo.totalMem),
        "processMemoryLimitBytes" to positiveOrNull(processCeiling),
        "processMemoryBytes" to positiveOrNull(residentMemoryBytes),
        "thermalState" to thermalState(context),
        "batteryLevelPermille" to batteryLevelPermille(context)
      )
    }
  }

  private fun unavailableSnapshot(): Map<String, Any?> = mapOf(
    "physicalMemoryBytes" to null,
    "processMemoryLimitBytes" to null,
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
