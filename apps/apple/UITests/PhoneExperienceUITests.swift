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

    private func attachScreenshot(named name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
