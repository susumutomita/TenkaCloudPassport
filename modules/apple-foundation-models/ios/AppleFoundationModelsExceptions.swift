import ExpoModulesCore

/// この端末の iOS バージョンが Apple Intelligence（FoundationModels、iOS 26+）に
/// 対応していないときに `complete()` が投げる。`availability()` は同じ状態を
/// Exception にせず bounded な文字列（`unavailable-unsupported-os`）で返す
/// （Availability 判定そのものは失敗ではないため）。生成を実行できない
/// `complete()` だけを Exception にする。
internal final class AppleFoundationModelsUnsupportedOSException: Exception {
  override var reason: String {
    "この端末の iOS バージョンは Apple Intelligence に対応していません。"
  }
}

internal final class AppleFoundationModelsUnavailableException: Exception {
  override var reason: String {
    "この端末では Apple Intelligence を利用できません（端末非対応 / 無効 / モデル未準備のいずれか）。"
  }
}

internal final class AppleFoundationModelsInvalidSchemaException: GenericException<String> {
  override var reason: String {
    "Guided Generation Schema を解釈できませんでした: \(param)"
  }
}

internal final class AppleFoundationModelsGenerationFailedException: GenericException<String> {
  override var reason: String {
    "Apple Intelligence の生成に失敗しました: \(param)"
  }
}
