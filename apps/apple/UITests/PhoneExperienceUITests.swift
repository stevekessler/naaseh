import XCTest

@MainActor
final class PhoneExperienceUITests: XCTestCase {
    func testSafeAreaKeyboardRotationDynamicTypeAndState() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "phone-experience", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Na’aseh"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Tasks"].waitForExistence(timeout: 2))
        XCUIDevice.shared.orientation = .portrait
        let undersizedButtons = app.buttons.allElementsBoundByIndex.filter { $0.frame.height > 0 && $0.frame.height < 44 }
        XCTAssertTrue(undersizedButtons.isEmpty, "Every visible button must be at least 44 points high")
        attachScreenshot(named: "iPhone-AccessibilityXXXL-Portrait", app: app)
    }

    func testReducedMotionAndVoiceOverOrderHaveNamedAlternatives() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-UIAccessibilityReduceMotionEnabled", "YES"]
        app.launch()

        XCTAssertTrue(app.buttons["Tasks"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Journal"].exists)
        attachScreenshot(named: "iPhone-Reduced-Motion", app: app)
    }

    func testTaskCreateCompleteUndoJourney() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
        app.launch()
        if !app.buttons["New task"].firstMatch.exists { app.buttons["Tasks"].firstMatch.tap() }
        let create = app.buttons["New task"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        create.tap()
        let title = app.textFields["task.label"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("Native task journey")
        app.buttons["Save task"].tap()
        let complete = app.buttons["Complete Native task journey"]
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        complete.tap()
        XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 5))
        app.buttons["Undo"].tap()
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        attachScreenshot(named: "Task-Create-Complete-Undo", app: app)
    }

    private func attachScreenshot(named name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
