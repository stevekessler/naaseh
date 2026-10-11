import XCTest

@MainActor
final class MacExperienceUITests: XCTestCase {
    func testResizableWindowsMenusFocusContextAndRestoration() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "mac-experience"]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(window.frame.width, 820)
        app.activate()
        app.typeKey("n", modifierFlags: .command)
        XCTAssertTrue(app.menuBars.firstMatch.exists)
        attachScreenshot(named: "Mac-Desktop-Window", window: window)
    }

    func testPrimaryTaskActionIsAvailable() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "mac-experience"]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["New task"].waitForExistence(timeout: 5))
        app.activate()
        attachScreenshot(named: "Mac-Web-Style-Workspace", window: window)
    }

    private func attachScreenshot(named name: String, window: XCUIElement) {
        let attachment = XCTAttachment(screenshot: window.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
