import XCTest

final class JournalCrisisPlanPrivacyUITests: XCTestCase {
    func testJournalLocksAndRedactsWhenBackgrounded() {
        let app = XCUIApplication(); app.launchArguments += ["-ui-testing", "journal-fixture"]; app.launch()
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'synthetic private note'")).firstMatch.exists)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.secureTextFields["Journal PIN"].waitForExistence(timeout: 3) || app.staticTexts["Na’aseh Is Locked"].exists)
    }

    func testCrisisPlanTriggerPreservesDraftAndHasAccessibleLabels() {
        let app = XCUIApplication(); app.launchArguments += ["-ui-testing", "journal-unlocked-fixture"]; app.launch()
        let notes = app.textViews["General journal notes"]; notes.tap(); notes.typeText("Synthetic draft")
        app.buttons["Open Crisis Plan"].tap()
        XCTAssertTrue(app.navigationBars["My Crisis Plan"].exists)
        app.swipeDown()
        XCTAssertEqual(notes.value as? String, "Synthetic draft")
    }
}
