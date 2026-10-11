import XCTest

final class ProductParityUITests: XCTestCase {
    func testRepresentativePhoneTabletAndDesktopWorkspacesAreDiscoverable() {
        let app = XCUIApplication(); app.launchArguments += ["-ui-testing", "product-parity-fixture"]; app.launch()
        for section in ["Lists", "Directory", "Completed Tasks", "Your Profile"] { XCTAssertTrue(app.staticTexts[section].waitForExistence(timeout: 2), section) }
        XCTAssertFalse(app.buttons["Create Project"].exists)
        XCTAssertFalse(app.buttons["Create Category"].exists)
    }
}
