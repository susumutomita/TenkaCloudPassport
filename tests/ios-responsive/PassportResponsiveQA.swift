import XCTest

final class PassportResponsiveQA: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "cloud.tenka.passport")

  // Duo can report the application frame in a different orientation from its window.
  var windowFrame: CGRect { app.windows.firstMatch.frame }

  func reveal(_ element: XCUIElement) {
    for _ in 0..<40 {
      // The Japanese keyboard's candidate bar is also a ScrollView. Select the
      // main content area rather than whichever scroll view XCTest lists first.
      guard let scroll = app.scrollViews.allElementsBoundByIndex.max(by: {
        $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height
      }) else { XCTFail("Missing content ScrollView"); return }
      // Docked actions belong to the window, while inline actions and fields
      // must fit entirely inside the content viewport.
      let inContent = scroll.descendants(matching: element.elementType)[element.label].firstMatch.exists
      let viewport = inContent ? scroll.frame.intersection(windowFrame) : windowFrame
      if element.exists && element.isHittable && viewport.contains(element.frame) { return }
      // A full flick overshoots short controls in landscape at maximum text size.
      // Drag a bounded distance and hold before releasing to avoid momentum.
      let delta = element.exists ? element.frame.midY - scroll.frame.midY : scroll.frame.height
      let distance = min(scroll.frame.height * 0.6, max(CGFloat(30), abs(delta)))
      let direction: CGFloat = delta < 0 ? 1 : -1
      let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: direction < 0 ? 0.8 : 0.2))
      start.press(forDuration: 0.05,
                  thenDragTo: start.withOffset(CGVector(dx: 0, dy: direction * distance)),
                  withVelocity: .slow, thenHoldForDuration: 0.15)
    }
    capture("unreachable-control")
    XCTFail("Unreachable control: \(element.label)\n\(app.debugDescription)")
  }

  func capture(_ name: String) {
    for (index, screen) in XCUIScreen.screens.enumerated() {
      let attachment = XCTAttachment(screenshot: screen.screenshot())
      attachment.name = "\(name)-screen\(index)"
      attachment.lifetime = .keepAlways
      add(attachment)
    }
  }

  func assertFitsWindow(_ element: XCUIElement) {
    XCTAssertGreaterThanOrEqual(element.frame.minX, windowFrame.minX)
    XCTAssertLessThanOrEqual(element.frame.maxX, windowFrame.maxX)
  }

  func waitForStableFrame(_ element: XCUIElement) {
    var previous: CGRect?
    var stableSamples = 0
    let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      let current = element.frame
      stableSamples = previous == current ? stableSamples + 1 : 0
      previous = current
      return element.isHittable && stableSamples >= 2
    }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 10), .completed)
  }

  func testEditorAcrossOrientationsAndKeyboard() {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .portrait
    app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
    app.launch()
    // A previous text-size pass may have saved its synthetic card.
    let edit = app.buttons["編集する"].firstMatch
    let name = app.textFields["名前"].firstMatch
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in name.exists || edit.exists }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 60), .completed)
    if edit.exists { reveal(edit); edit.tap() }
    XCTAssertTrue(name.waitForExistence(timeout: 60), app.debugDescription)
    reveal(name)
    if (name.value as? String ?? "").isEmpty { name.tap(); name.typeText("Sample Resize") }
    for orientation in [UIDeviceOrientation.portrait, .landscapeLeft, .portrait] {
      XCUIDevice.shared.orientation = orientation
      reveal(name)
      waitForStableFrame(name)
      assertFitsWindow(name)
      XCTAssertEqual(name.value as? String, "Sample Resize")
      // A second tap on the already focused field opens the edit menu on Duo.
      // Keep the existing focus instead of turning the submit check into a
      // text-selection-menu interaction.
      if !app.keyboards.firstMatch.exists || app.keyboards.firstMatch.frame.intersection(windowFrame).height <= 1 { name.tap() }
      XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
      let visibleKeyboard = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
        self.app.keyboards.firstMatch.frame.intersection(self.windowFrame).height > 1
      }, object: nil)
      XCTAssertEqual(XCTWaiter.wait(for: [visibleKeyboard], timeout: 10), .completed)
      capture("editor-keyboard-\(orientation.rawValue)")
      // Exercise the visible submit key. Synthesized newline input does not
      // dismiss the keyboard on the Duo runtime, while this user action does.
      let done = app.keyboards.buttons.matching(NSPredicate(format: "label MATCHES[c] %@", "完了|done|return|改行")).firstMatch
      XCTAssertTrue(done.exists)
      done.tap()
      let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
      XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed)
    }
    let save = app.buttons["保存"].firstMatch
    reveal(save)
    assertFitsWindow(save)
    XCTAssertTrue(save.isEnabled)
    save.tap()
    XCTAssertTrue(edit.waitForExistence(timeout: 30))
    capture("saved-card")
  }
}
