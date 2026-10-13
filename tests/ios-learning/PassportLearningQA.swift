import XCTest

final class PassportLearningQA: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "cloud.tenka.passport")
  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launch()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let open = springboard.alerts.buttons["開く"].firstMatch
    if open.waitForExistence(timeout: 2) { open.tap() }
    let reload = app.buttons["Reload"].firstMatch
    if reload.waitForExistence(timeout: 2) { reload.tap() }
    let continueButton = app.buttons["Continue"].firstMatch
    if continueButton.waitForExistence(timeout: 5) { continueButton.tap() }
    let closeMenu = app.buttons["Close"].firstMatch
    if closeMenu.waitForExistence(timeout: 2) { closeMenu.tap() }
    if app.staticTexts["Runtime version: exposdk:57.0.0"].exists { app.coordinate(withNormalizedOffset: CGVector(dx: 0.91, dy: 0.096)).tap() }
  }
  override func tearDownWithError() throws {
    let error = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Text strings must be rendered")).firstMatch
    XCTAssertFalse(error.exists, "React Native render error must not be ignored")
  }
  func findButton(_ label: String, maximumSwipes: Int = 35) -> XCUIElement {
    let button = app.buttons[label].firstMatch
    for _ in 0..<maximumSwipes {
      if button.exists && button.isHittable { return button }
      let scroll = app.scrollViews.firstMatch
      if scroll.exists { if button.exists && button.frame.maxY < scroll.frame.minY { scroll.swipeDown() } else { scroll.swipeUp() } } else { app.swipeUp() }
    }
    return button
  }
  func tap(_ label: String) { let button = findButton(label); XCTAssertTrue(button.exists, "Missing \(label)"); XCTAssertTrue(button.isHittable, "Not tappable \(label)"); button.tap() }
  func screenshot(_ name: String) { let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment) }
  func openLearning() {
    let entry = app.buttons["学習・面接の練習"].firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 60), app.debugDescription)
    tap("学習・面接の練習")
    XCTAssertTrue(app.staticTexts["考え方を組み立てる"].waitForExistence(timeout: 15))
  }
  func testExternalCatalogManagementNavigation() {
    openLearning()
    tap("JSON 管理")
    let manifest = app.textFields["Catalog manifest URL"].firstMatch
    for _ in 0..<12 { if manifest.isHittable { break }; if manifest.exists && manifest.frame.minY < 20 { app.scrollViews.firstMatch.swipeDown() } else { app.scrollViews.firstMatch.swipeUp() } }
    XCTAssertTrue(manifest.isHittable, app.debugDescription)
    screenshot("19-external-catalog-manager-small")
    XCTAssertTrue(app.buttons["取得元を登録・更新 / Fetch manifest"].firstMatch.isEnabled)
    tap("Passport に戻る")
    XCTAssertTrue(app.buttons["学習・面接の練習"].firstMatch.exists)
  }
  func testPublishedCatalogDownloadAndPersistedReload() {
    openLearning(); tap("JSON 管理")
    tap("取得元を登録・更新 / Fetch manifest")
    XCTAssertTrue(app.staticTexts["取得・保存しました。オフラインで利用できます。"].firstMatch.waitForExistence(timeout: 30), app.debugDescription)
    tap("v2026.10.1301 を取得・固定 / Download pinned version")
    let download = app.buttons["v2026.10.1301 を取得・固定 / Download pinned version"].firstMatch
    for _ in 0..<30 { if download.isEnabled { break }; Thread.sleep(forTimeInterval: 1) }
    XCTAssertTrue(download.isEnabled, app.debugDescription)
    for _ in 0..<20 { if app.buttons["教材"].firstMatch.isHittable { break }; app.scrollViews.firstMatch.swipeDown() }
    tap("教材")
    let version = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "2026.10.1301")).firstMatch
    for _ in 0..<20 { if version.exists { break }; app.scrollViews.firstMatch.swipeUp() }
    XCTAssertTrue(version.exists, app.debugDescription); screenshot("20-published-catalog-downloaded")
    tap("Passport に戻る"); app.terminate(); app.launch(); openLearning()
    for _ in 0..<20 { if version.exists { break }; app.scrollViews.firstMatch.swipeUp() }
    XCTAssertTrue(version.exists, app.debugDescription); screenshot("21-published-catalog-persisted-reload")
  }
  func testLearningNavigationWrongCorrectResumeReviewAndShare() {
    openLearning(); screenshot("01-learning-library-small")
    tap("2つの値を組み合わせる"); screenshot("02-study-small")
    tap("最初と最後だけを足す")
    XCTAssertFalse(findButton("次へ / Next").isEnabled)
    screenshot("03-incorrect-small")
    app.swipeDown(); app.swipeDown()
    tap("各要素と、それより後ろの全要素の組を調べる")
    XCTAssertTrue(findButton("次へ / Next").isEnabled)
    screenshot("04-correct-small"); tap("次へ / Next")
    tap("教材一覧へ / Back to lessons"); tap("Passport に戻る")
    app.terminate(); app.launch(); openLearning(); tap("2つの値を組み合わせる · 2/5")
    screenshot("05-resumed-small")
    tap("target − 今の値 が存在するかの検索"); tap("次へ / Next")
    app.swipeDown(); app.swipeDown(); tap("Map：値から位置を引く"); tap("次へ / Next")
    app.swipeDown(); app.swipeDown(); tap("[0,1]"); tap("次へ / Next")
    app.swipeDown(); app.swipeDown(); screenshot("06-self-assessment-small")
    tap("ヒント・参考解答を開く / Reveal guidance"); screenshot("07-guidance-small")
    tap("復習したい（自己評価） / Self: review"); tap("次へ / Next")
    screenshot("08-complete-small"); tap("教材一覧へ / Back to lessons"); tap("復習")
    screenshot("09-review-small"); tap("履歴"); screenshot("10-history-small")
    tap("JSON 管理"); screenshot("11-json-small")
    tap("学習 JSON を書き出す / Export backup")
    let sharedFile = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "tenkacloud-learning-backup")).firstMatch
    XCTAssertTrue(sharedFile.waitForExistence(timeout: 10), app.debugDescription)
    screenshot("12-native-file-share")
  }
  func testReturnToExistingCardDraft() {
    let entry = app.buttons["学習・面接の練習"].firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 30))
    for _ in 0..<12 { app.scrollViews.firstMatch.swipeDown() }
    let name = app.textFields["例: 田中太郎"].firstMatch
    XCTAssertTrue(name.exists, app.debugDescription)
    name.tap()
    let previous = name.value as? String ?? ""
    if previous != "例: 田中太郎" { name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count)) }
    name.typeText("QA local card\n")
    let done = app.keyboards.buttons["完了"].firstMatch
    if done.exists { done.tap() }
    screenshot("13-before-learning-keyboard")
    tap("学習・面接の練習"); tap("Passport に戻る")
    for _ in 0..<12 { app.scrollViews.firstMatch.swipeDown() }
    XCTAssertEqual(name.value as? String, "QA local card")
    screenshot("13-existing-draft-preserved-small")
    tap("保存")
    XCTAssertTrue(app.staticTexts["自己紹介カード"].waitForExistence(timeout: 10))
    screenshot("14-existing-card-qr-small")
    tap("学習・面接の練習"); tap("Passport に戻る")
    XCTAssertTrue(app.staticTexts["自己紹介カード"].exists)
  }
  func testZDeleteAllDedicatedTestDataIncludesLearning() {
    tap("設定"); tap("この端末のすべてのデータを削除")
    screenshot("15-delete-confirmation-test-data")
    tap("削除する")
    XCTAssertTrue(app.buttons["学習・面接の練習"].firstMatch.waitForExistence(timeout: 10))
    openLearning(); tap("履歴")
    XCTAssertTrue(app.staticTexts["まだ履歴がありません。 / No attempts yet."].exists)
    screenshot("16-deleted-history-test-data")
    tap("Passport に戻る")
    app.terminate(); app.launch()
    for _ in 0..<12 { app.scrollViews.firstMatch.swipeDown() }
    let name = app.textFields["例: 田中太郎"].firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 15))
    XCTAssertTrue((name.value as? String) == "例: 田中太郎" || (name.value as? String) == "")
  }
  func testLargeTextLearningScreens() {
    openLearning(); screenshot("17-learning-library-accessibility-xxxl")
    let foundation = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "仕様を論理式からテストへ")).firstMatch
    for _ in 0..<35 { if foundation.isHittable { break }; app.scrollViews.firstMatch.swipeUp() }
    XCTAssertTrue(foundation.isHittable); foundation.tap(); screenshot("18-foundation-accessibility-xxxl")
    tap("ある i で a[i]≥a[i+1]")
    XCTAssertTrue(findButton("次へ / Next").isEnabled)
    screenshot("19-correct-accessibility-xxxl")
    tap("教材一覧へ / Back to lessons"); tap("Passport に戻る")
  }
}
