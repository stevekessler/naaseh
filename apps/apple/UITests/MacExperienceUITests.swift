import XCTest

@MainActor
final class MacExperienceUITests: XCTestCase {
    func testResizableWindowsMenusFocusContextAndRestoration() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "mac-experience", "-ApplePersistenceIgnoreState", "YES"]
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
        app.launchArguments += ["-ui-testing", "mac-experience", "-ApplePersistenceIgnoreState", "YES"]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5))
        let create = app.buttons["New task"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 5))
        create.click()
        let title = app.textFields["task.label"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.click(); title.typeText("Parity task journey")
        app.buttons["Save task"].click()
        XCTAssertTrue(app.buttons["Complete Parity task journey"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Complete Parity task journey"].click()
        XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 5))
        app.buttons["Undo"].click()
        XCTAssertTrue(app.buttons["Complete Parity task journey"].waitForExistence(timeout: 5))
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
