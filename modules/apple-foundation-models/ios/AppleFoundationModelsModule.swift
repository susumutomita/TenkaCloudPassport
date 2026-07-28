import ExpoModulesCore

/// Apple Intelligence（FoundationModels、iOS 26+）を Expo Modules API で包む薄い Glue。
/// FoundationModels 依存のロジックは `AppleFoundationModelsEngine` /
/// `AppleFoundationModelsSchemaConverter`（`@available(iOS 26.0, *)`、
/// ExpoModulesCore 非依存で単体 typecheck 可能）に閉じ込め、この Module は
/// iOS バージョン判定と Exception への正規化だけを担う（ADR-0057）。
///
/// `FoundationModels.framework` は iOS 26 未満に存在しないため、Podspec 側で
/// `weak_frameworks` として弱リンクする（そうしないと iOS 26 未満の端末で
/// 起動時に Dynamic Linker が解決できず即クラッシュする）。
public final class AppleFoundationModelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleFoundationModels")

    AsyncFunction("availability") { () -> String in
      guard #available(iOS 26.0, *) else {
        return AppleFoundationModelsAvailability.unavailableUnsupportedOS.rawValue
      }
      return AppleFoundationModelsEngine.availability().rawValue
    }

    AsyncFunction("complete") {
      (
        systemPrompt: String,
        userPrompt: String,
        schemaJson: String?,
        temperature: Double
      ) -> String in
      guard #available(iOS 26.0, *) else {
        throw AppleFoundationModelsUnsupportedOSException()
      }
      do {
        return try await AppleFoundationModelsEngine.complete(
          systemPrompt: systemPrompt,
          userPrompt: userPrompt,
          schemaJson: schemaJson,
          temperature: temperature
        )
      } catch AppleFoundationModelsFailure.unavailable {
        throw AppleFoundationModelsUnavailableException()
      } catch AppleFoundationModelsFailure.invalidSchema(let detail) {
        throw AppleFoundationModelsInvalidSchemaException(detail)
      } catch AppleFoundationModelsFailure.generationFailed(let detail) {
        throw AppleFoundationModelsGenerationFailedException(detail)
      }
    }
  }
}
