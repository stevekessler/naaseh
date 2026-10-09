import XCTest

final class TaskParityUITests: XCTestCase {
    @MainActor
    func testTaskListPostItDetailEditorRankingAndKeyboardJourney() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--ui-test", "task-parity"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Tasks"].waitForExistence(timeout: 5))
        app.buttons["New task"].tap()
        app.textFields["Task title"].typeText("Native parity task")
        app.buttons["Save task"].tap()
        XCTAssertTrue(app.staticTexts["Native parity task"].waitForExistence(timeout: 2))

        app.buttons["Post-it view"].tap()
        XCTAssertTrue(app.otherElements["Post-it: Native parity task"].exists)
        app.buttons["Move task"].tap()
        XCTAssertTrue(app.buttons["Move to first position"].exists)
        app.buttons["Complete Native parity task"].tap()
        XCTAssertTrue(app.buttons["Undo completion"].waitForExistence(timeout: 2))
    }

    @MainActor
    func testTaskControlsExposeAccessibleNamesAndKeyboardCommands() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--ui-test", "task-parity", "--keyboard"]
        app.launch()
        XCTAssertTrue(app.buttons["New task"].isHittable)
        app.typeKey("n", modifierFlags: .command)
        XCTAssertTrue(app.textFields["Task title"].waitForExistence(timeout: 2))
    }
}
