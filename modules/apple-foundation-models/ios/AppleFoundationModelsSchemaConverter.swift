import Foundation
import FoundationModels

/// `src/local-agent/model-safety-boundary.ts` の `responseFormatForEvidenceIds` が
/// 生成する、限定された JSON Schema の部分集合（root `oneOf` / `object` /
/// `string`(`const`|`enum`) / `array`(`items`: string 系)）だけを
/// `DynamicGenerationSchema` へ変換する。想定外の形は
/// `AppleFoundationModelsFailure.invalidSchema` で fail-closed にする
/// （知らない Schema を「たぶんこう」で解釈して silent に緩めない）。
@available(iOS 26.0, *)
enum AppleFoundationModelsSchemaConverter {
  static func generationSchema(fromJSONSchema jsonSchema: String) throws -> GenerationSchema {
    guard let data = jsonSchema.data(using: .utf8) else {
      throw AppleFoundationModelsFailure.invalidSchema("UTF-8 として解釈できません。")
    }
    let parsed: Any
    do {
      parsed = try JSONSerialization.jsonObject(with: data)
    } catch {
      throw AppleFoundationModelsFailure.invalidSchema("JSON として解析できません。")
    }
    let root = try dynamicSchema(named: "AgentModelProviderOutput", from: parsed)
    do {
      return try GenerationSchema(root: root, dependencies: [])
    } catch {
      throw AppleFoundationModelsFailure.invalidSchema(
        "GenerationSchema へ変換できません: \(error)"
      )
    }
  }

  private static func dynamicSchema(
    named name: String,
    from value: Any
  ) throws -> DynamicGenerationSchema {
    guard let object = value as? [String: Any] else {
      throw AppleFoundationModelsFailure.invalidSchema("Schema は object である必要があります。")
    }
    if let oneOf = object["oneOf"] as? [[String: Any]] {
      guard !oneOf.isEmpty else {
        throw AppleFoundationModelsFailure.invalidSchema("oneOf は 1 件以上必要です。")
      }
      let branches = try oneOf.enumerated().map { index, branch -> DynamicGenerationSchema in
        try dynamicSchema(
          named: branchName(from: branch, fallback: "\(name)Variant\(index)"),
          from: branch
        )
      }
      return DynamicGenerationSchema(name: name, anyOf: branches)
    }
    // レビュー指摘（blocker）: 標準 JSON Schema では `const` / `enum` 単体で型が
    // 確定するため `type` を省略できる（本番の `kind: { const: 'no-signal' }` 等が
    // まさにこの形）。`type` 必須の判定より先にこの形を判定しないと、判別子
    // property の変換で必ず `invalidSchema` に落ちる（`model-safety-boundary.ts` の
    // 全 Schema が判別子に `type` を持たない）。
    if isBareStringLiteralSchema(object) {
      return try stringSchema(named: name, from: object)
    }
    guard let type = object["type"] as? String else {
      throw AppleFoundationModelsFailure.invalidSchema("type field が必要です。")
    }
    switch type {
    case "object":
      return try objectSchema(named: name, from: object)
    case "string":
      return try stringSchema(named: name, from: object)
    case "array":
      return try arraySchema(named: name, from: object)
    default:
      throw AppleFoundationModelsFailure.invalidSchema("未対応の type です: \(type)")
    }
  }

  private static func objectSchema(
    named name: String,
    from object: [String: Any]
  ) throws -> DynamicGenerationSchema {
    guard let properties = object["properties"] as? [String: Any] else {
      throw AppleFoundationModelsFailure.invalidSchema("properties field が必要です。")
    }
    let required = Set(object["required"] as? [String] ?? [])
    let dynamicProperties = try orderedPropertyNames(properties.keys).map {
      key -> DynamicGenerationSchema.Property in
      guard let propertyValue = properties[key] else {
        throw AppleFoundationModelsFailure.invalidSchema("property が見つかりません: \(key)")
      }
      let propertySchema = try dynamicSchema(named: "\(name).\(key)", from: propertyValue)
      return DynamicGenerationSchema.Property(
        name: key,
        schema: propertySchema,
        isOptional: !required.contains(key)
      )
    }
    return DynamicGenerationSchema(name: name, properties: dynamicProperties)
  }

  /// `type` を省略した `const` / `enum` 単体の Schema（`{ const: 'no-signal' }` 等）かを
  /// 判定する。`type: 'string'` を明示した通常の string Schema は、この判定を経由せず
  /// `dynamicSchema` の `switch type` から直接 `stringSchema` へ渡る。
  private static func isBareStringLiteralSchema(_ object: [String: Any]) -> Bool {
    if object["type"] != nil { return false }
    if object["const"] is String { return true }
    if let enumValues = object["enum"] as? [String], !enumValues.isEmpty { return true }
    return false
  }

  /// レビュー指摘（altitude）: `const`/`enum` が「無い」（プレーンな string）場合と
  /// 「あるが型が違う」場合を区別する。後者を無言で「制約なしの string」へ
  /// フォールバックさせると、Guided Generation が判別子・enum 制約を静かに失う
  /// （blocker で見つかった fail-closed 抜けと同じ種類の欠陥のため、ここも
  /// 「有るが解釈できない」を必ず `invalidSchema` にする）。
  ///
  /// 既知の制約: `minLength`/`maxLength`（`ownerQuote`/`peerQuote`/`text` が持つ）は
  /// この変換器では強制できない（iOS 26.5 SDK の `GenerationGuide<String>` は
  /// `.constant`/`.anyOf`/`.pattern` だけを提供し、長さ上限の Guide が無い）。
  /// この責務は TS 側の再検証（`verifyGroundedQuoteBridge` /
  /// `parseConversationExampleTurn`）に委ねる。
  private static func stringSchema(
    named name: String,
    from object: [String: Any]
  ) throws -> DynamicGenerationSchema {
    if let constRaw = object["const"] {
      guard let constValue = constRaw as? String else {
        throw AppleFoundationModelsFailure.invalidSchema("const は string である必要があります。")
      }
      return DynamicGenerationSchema(name: name, anyOf: [constValue])
    }
    if let enumRaw = object["enum"] {
      guard let enumValues = enumRaw as? [String], !enumValues.isEmpty else {
        throw AppleFoundationModelsFailure.invalidSchema(
          "enum は 1 件以上の string 配列である必要があります。"
        )
      }
      return DynamicGenerationSchema(name: name, anyOf: enumValues)
    }
    return DynamicGenerationSchema(type: String.self)
  }

  private static func arraySchema(
    named name: String,
    from object: [String: Any]
  ) throws -> DynamicGenerationSchema {
    guard let items = object["items"] as? [String: Any] else {
      throw AppleFoundationModelsFailure.invalidSchema("items field が必要です。")
    }
    let itemSchema = try dynamicSchema(named: "\(name)Item", from: items)
    return DynamicGenerationSchema(
      arrayOf: itemSchema,
      minimumElements: try optionalIntBound(object["minItems"], field: "minItems"),
      maximumElements: try optionalIntBound(object["maxItems"], field: "maxItems")
    )
  }

  /// `minItems`/`maxItems` は「無い」（無制限）と「あるが整数でない」を区別する。
  /// 後者を無言で `nil`（無制限）へ丸めると、配列長の上限制約を静かに失う
  /// （`stringSchema` の `const`/`enum` と同じ fail-closed 方針）。
  private static func optionalIntBound(_ value: Any?, field: String) throws -> Int? {
    guard let value else { return nil }
    guard let intValue = value as? Int else {
      throw AppleFoundationModelsFailure.invalidSchema("\(field) は整数である必要があります。")
    }
    return intValue
  }

  /// JSON の Key 順は `JSONSerialization` が保証しないため、`kind` を先頭に固定し
  /// 残りを辞書順にする決定的な並びへ正規化する（Generation 順の再現性のためだけで、
  /// Schema としての妥当性には影響しない）。`"kind"` は
  /// `model-safety-boundary.ts` の判別子 field 名と直接結び付いた決め打ちであり、
  /// 将来 TS 側が別名へ変えても、この関数は無言で辞書順へ戻るだけで壊れない
  /// （`branchName` の `properties["kind"]` 読み取りも同じ結び付き）。
  private static func orderedPropertyNames(
    _ keys: Dictionary<String, Any>.Keys
  ) -> [String] {
    keys.sorted { lhs, rhs in
      if lhs == rhs { return false }
      if lhs == "kind" { return true }
      if rhs == "kind" { return false }
      return lhs < rhs
    }
  }

  private static func branchName(from branch: [String: Any], fallback: String) -> String {
    guard
      let properties = branch["properties"] as? [String: Any],
      let kindSchema = properties["kind"] as? [String: Any],
      let constValue = kindSchema["const"] as? String
    else {
      return fallback
    }
    return constValue
  }
}
