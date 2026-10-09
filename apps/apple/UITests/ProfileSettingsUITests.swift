import XCTest
final class ProfileSettingsUITests: XCTestCase {
    func testPersonalSettingsAutoFillOneTimeCodeValidationOfflineAndAccessibility() {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "profile-settings", "offline"]
        app.launch()

        app.buttons["Your Profile"].tap()
        XCTAssertTrue(app.staticTexts["Profile photo"].exists)
        app.buttons["Account security"].tap()
        XCTAssertTrue(app.secureTextFields["Current password"].exists)
        XCTAssertTrue(app.textFields["Authentication code"].exists)
        XCTAssertFalse(app.buttons["Create User"].exists)
        XCTAssertFalse(app.buttons["Create Project"].exists)
    }
}
