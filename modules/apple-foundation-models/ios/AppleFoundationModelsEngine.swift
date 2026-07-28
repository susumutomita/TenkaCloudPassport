import Foundation
import FoundationModels

/// JS 境界へ渡す Availability 判定結果。`SystemLanguageModel.Availability` /
/// `UnavailableReason`（iOS 26 SDK, `FoundationModels.swiftinterface` 参照）を
/// bounded な文字列へ正規化する。Apple が将来 `UnavailableReason` へケースを
/// 追加しても（`UnavailableReason` は `@frozen` ではない）`@unknown default` で
/// 未知理由として fail-closed に丸め、クラッシュしない。
enum AppleFoundationModelsAvailability: String {
  case available
  case unavailableDeviceNotEligible = "unavailable-device-not-eligible"
  case unavailableAppleIntelligenceNotEnabled = "unavailable-apple-intelligence-not-enabled"
  case unavailableModelNotReady = "unavailable-model-not-ready"
  case unavailableUnsupportedOS = "unavailable-unsupported-os"
  case unavailableUnknownReason = "unavailable-unknown"
}

/// Native 側で完結させる `complete` の失敗理由。JS 側は種別を区別せず、
/// 既存の `AgentModelProviderError`（LOAD_ERROR / SCHEMA_ERROR）へ一律正規化する
/// （`src/local-agent/apple-foundation-models-provider.ts` 参照）。
enum AppleFoundationModelsFailure: Error {
  case unavailable
  case invalidSchema(String)
  case generationFailed(String)
}

@available(iOS 26.0, *)
enum AppleFoundationModelsEngine {
  static func availability() -> AppleFoundationModelsAvailability {
    switch SystemLanguageModel.default.availability {
    case .available:
      return .available
    case .unavailable(let reason):
      switch reason {
      case .deviceNotEligible:
        return .unavailableDeviceNotEligible
      case .appleIntelligenceNotEnabled:
        return .unavailableAppleIntelligenceNotEnabled
      case .modelNotReady:
        return .unavailableModelNotReady
      @unknown default:
        return .unavailableUnknownReason
      }
    }
  }

  /// `LanguageModelSession` で 1 回だけ生成する。`schemaJson` が無ければ自由文、
  /// あれば Guided Generation（`DynamicGenerationSchema`）で構造化 Output を強制する。
  ///
  /// Session は呼び出しごとに新規作成する。`llama.rn` の Context と異なり、
  /// `SystemLanguageModel` は重み読み込みを伴わない OS 常駐サービスであり、
  /// 明示的な init/release lifecycle・execution lease を持たない
  /// （ADR-0057 参照）。
  ///
  /// レビュー指摘（high）: `temperature` を無視して常に `.greedy`（決定的）で
  /// 生成すると、会話例（`temperature: 0.7` を意図的に指定、ADR-0050）の多様性が
  /// 失われ、`assertNotRepeatingTranscript` の重複検出に引っかかりやすくなる。
  /// `temperature <= 0`（Bridge 判定の既定）はこれまでどおり `.greedy` の決定的
  /// 生成のまま、`temperature > 0` のときだけ `.random(probabilityThreshold:)`
  /// （nucleus sampling、閾値 0.9 は一般的な既定値）へ切り替える。`.greedy` は
  /// 常に argmax を選ぶため `temperature` を渡しても効果が無い（FoundationModels
  /// の仕様）。
  static func complete(
    systemPrompt: String,
    userPrompt: String,
    schemaJson: String?,
    temperature: Double
  ) async throws -> String {
    guard SystemLanguageModel.default.isAvailable else {
      throw AppleFoundationModelsFailure.unavailable
    }
    let session = LanguageModelSession(instructions: systemPrompt)
    let options = generationOptions(temperature: temperature)
    do {
      guard let schemaJson else {
        let response = try await session.respond(to: userPrompt, options: options)
        return response.content
      }
      let schema = try AppleFoundationModelsSchemaConverter.generationSchema(
        fromJSONSchema: schemaJson
      )
      let response = try await session.respond(
        to: userPrompt,
        schema: schema,
        options: options
      )
      return response.content.jsonString
    } catch let failure as AppleFoundationModelsFailure {
      throw failure
    } catch {
      throw AppleFoundationModelsFailure.generationFailed(String(describing: error))
    }
  }

  private static func generationOptions(temperature: Double) -> GenerationOptions {
    guard temperature > 0 else {
      return GenerationOptions(sampling: .greedy, temperature: 0)
    }
    return GenerationOptions(
      sampling: .random(probabilityThreshold: 0.9),
      temperature: temperature
    )
  }
}
