import XCTest

final class PassportStoreScreenshots: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "cloud.tenka.passport")
  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launchArguments = ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
    app.launch()
    XCTAssertTrue(app.textFields["名前"].waitForExistence(timeout: 60), app.debugDescription)
  }
  func button(_ label: String) -> XCUIElement {
    let found = app.buttons[label].firstMatch
    for _ in 0..<30 {
      if found.exists && found.isHittable { return found }
      let scroll = app.scrollViews.firstMatch
      if scroll.exists {
        if found.exists && found.frame.maxY < scroll.frame.minY { scroll.swipeDown() }
        else { scroll.swipeUp() }
      } else { app.swipeUp() }
    }
    XCTFail("Missing button: \(label)"); return found
  }
  func tap(_ label: String) {
    let target = button(label)
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: target)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
    button(label).tap()
  }
  func top() { let scroll = app.scrollViews.firstMatch; if scroll.exists { for _ in 0..<8 { scroll.swipeDown() } } }
  func capture(_ name: String) {
    XCTAssertFalse(app.buttons["会話のきっかけを AI と見つける"].exists)
    XCTAssertFalse(app.staticTexts["端末内会話エージェント"].exists)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
  }
  func testCurrentStoreScreens() throws {
    let name = app.textFields["名前"]; name.tap(); name.typeText("Sample Creator")
    app.staticTexts["自己紹介カードを作る。"].tap()
    top(); capture("01-intro-card-edit")
    tap("保存"); XCTAssertTrue(app.buttons["編集する"].waitForExistence(timeout: 30))
    top(); capture("02-intro-card-qr")
    tap("アルゴリズム・設計を学ぶ")
    tap("ダウンロードして保存")
    let start = app.buttons["保存した教材で学習を始める"].firstMatch
    XCTAssertTrue(start.waitForExistence(timeout: 180), app.debugDescription)
    tap("保存した教材で学習を始める")
    top(); capture("03-learning-library")
    let lesson = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "学習を始める：")).firstMatch
    for _ in 0..<20 { if lesson.exists && lesson.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
    XCTAssertTrue(lesson.exists && lesson.isHittable)
    let lessonTitle = String(lesson.label.dropFirst("学習を始める：".count))
    lesson.tap()
    XCTAssertTrue(app.staticTexts[lessonTitle].waitForExistence(timeout: 20))
    top(); capture("04-learning-study")
    tap("Passport に戻る")
    let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "設定")).firstMatch
    for _ in 0..<20 { if settings.exists && settings.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
    XCTAssertTrue(settings.exists && settings.isHittable); settings.tap()
    XCTAssertTrue(app.staticTexts["設定を確認する。"].waitForExistence(timeout: 20))
    top(); capture("05-settings")
  }
}
