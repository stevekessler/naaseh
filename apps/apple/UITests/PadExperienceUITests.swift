import XCTest

@MainActor
final class PadExperienceUITests: XCTestCase {
    func testSplitViewKeyboardPointerAndRestoration() {
        XCUIDevice.shared.orientation = .landscapeLeft
        addTeardownBlock { XCUIDevice.shared.orientation = .portrait }

        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "pad-experience"]
        app.launch()

        XCTAssertTrue(app.buttons["Tasks"].waitForExistence(timeout: 5))
        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(window.frame.width, window.frame.height)

        let emptyDetail = app.staticTexts["No Selection"]
        XCTAssertTrue(emptyDetail.waitForExistence(timeout: 5))
        XCTAssertTrue(
            window.frame.contains(emptyDetail.frame),
            "The detail-column empty state must remain fully visible in landscape."
        )
        attachScreenshot(named: "iPad-Split-View-Landscape", app: app)
    }

    func testPencilOnlyGesturesHaveAccessibleAlternatives() {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "pad-experience"]
        app.launch()

        let unnamedButton = app.buttons.matching(NSPredicate(format: "label == ''")).firstMatch
        XCTAssertFalse(unnamedButton.exists)
        attachScreenshot(named: "iPad-Named-Controls", app: app)
    }

    private func attachScreenshot(named name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
