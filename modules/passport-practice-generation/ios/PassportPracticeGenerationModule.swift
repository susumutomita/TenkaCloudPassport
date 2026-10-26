import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
private enum PracticeKind: Sendable {
  case rsa
  case shares
  case field
}

@available(iOS 26.0, *)
@Generable
private struct PracticeParameters: Sendable {
  var kind: PracticeKind
  @Guide(.range(0...96)) var first: Int
  @Guide(.range(0...96)) var second: Int
}

@available(iOS 26.0, *)
private func modelAvailability() -> String {
  switch SystemLanguageModel.default.availability {
  case .available: return "available"
  case .unavailable(let reason):
    switch reason {
    case .deviceNotEligible: return "device-not-eligible"
    case .appleIntelligenceNotEnabled: return "apple-intelligence-not-enabled"
    case .modelNotReady: return "model-not-ready"
    @unknown default: return "unknown"
    }
  @unknown default: return "unknown"
  }
}

@available(iOS 26.0, *)
private struct PracticeOutput: Sendable {
  let kind: String
  let first: Int
  let second: Int
}

@available(iOS 26.0, *)
private actor PracticeGenerator {
  static let shared = PracticeGenerator()
  private var prepared: String?
  private var active: (id: String, task: Task<PracticeParameters, Error>)?
  private var reservationDeadline: Task<Void, Never>?

  func prepare(_ id: String) throws {
    guard !id.isEmpty, id.count <= 200, prepared == nil,
      modelAvailability() == "available" else { throw GenerationError.unavailable }
    prepared = id
    reservationDeadline = Task {
      do { try await Task.sleep(for: .seconds(30)) } catch { return }
      cancel(id)
    }
  }

  func cancel(_ id: String) {
    guard prepared == id else { return }
    if let task = active?.task { task.cancel() }
    else {
      reservationDeadline?.cancel()
      reservationDeadline = nil
      prepared = nil
    }
  }

  func generate(_ id: String) async throws -> PracticeOutput {
    guard prepared == id, active == nil else {
      throw GenerationError.unavailable
    }
    guard modelAvailability() == "available" else {
      cancel(id)
      throw GenerationError.unavailable
    }
    // Apple's on-device model only. No tools, network, learner data or history.
    let task = Task {
      let session = LanguageModelSession(model: SystemLanguageModel.default,
        instructions: "Choose parameters for a small arithmetic exercise. Select rsa (textbook modular exponentiation), shares (two-point linear secret sharing modulo 97), or field (addition modulo 97). Choose two integers from 0 through 96. Do not generate answers or executable code.")
      let response = try await session.respond(
        to: "Create a fresh practice exercise parameter set.",
        generating: PracticeParameters.self)
      try Task.checkCancellation()
      return response.content
    }
    active = (id, task)
    defer {
      reservationDeadline?.cancel()
      reservationDeadline = nil
      prepared = nil
      active = nil
    }
    let value = try await task.value
    guard (0...96).contains(value.first), (0...96).contains(value.second) else {
      throw GenerationError.invalidOutput
    }
    let kind: String
    switch value.kind {
    case .rsa: kind = "rsa"
    case .shares: kind = "shares"
    case .field: kind = "field"
    }
    return PracticeOutput(kind: kind, first: value.first, second: value.second)
  }
}
#endif

private enum GenerationError: Error {
  case unavailable
  case invalidOutput
}

public final class PassportPracticeGenerationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PassportPracticeGeneration")
    AsyncFunction("availability") { () -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) { return modelAvailability() }
      #endif
      return "unsupported-os"
    }
    AsyncFunction("generate") { (id: String) async throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let value = try await PracticeGenerator.shared.generate(id)
        return ["kind": value.kind, "first": value.first, "second": value.second]
      }
      #endif
      throw GenerationError.unavailable
    }
    AsyncFunction("prepare") { (id: String) async throws in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        try await PracticeGenerator.shared.prepare(id)
        return
      }
      #endif
      throw GenerationError.unavailable
    }
    AsyncFunction("cancel") { (id: String) async in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) { await PracticeGenerator.shared.cancel(id) }
      #endif
    }
  }
}
