import XCTest

final class AccessAndSyncUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testPhoneSignInLockOfflinePendingConflictAndSignOutWarning() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-fixture", "access-sync", "-device-class", "phone"]
        app.launch()
        completeAccessAndSyncJourney(in: app)
    }

    func testPadSignInLockOfflinePendingConflictAndSignOutWarning() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-fixture", "access-sync", "-device-class", "pad"]
        app.launch()
        completeAccessAndSyncJourney(in: app)
    }

    func testMacSignInLockOfflinePendingConflictAndSignOutWarning() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-fixture", "access-sync", "-device-class", "mac"]
        app.launch()
        completeAccessAndSyncJourney(in: app)
    }

    private func completeAccessAndSyncJourney(in app: XCUIApplication) {
        XCTAssertTrue(app.otherElements["authentication.signIn"].waitForExistence(timeout: 5))
        app.textFields["authentication.username"].tap()
        app.textFields["authentication.username"].typeText("smoke-user")
        app.secureTextFields["authentication.password"].tap()
        app.secureTextFields["authentication.password"].typeText("fixture-password")
        app.buttons["authentication.submit"].tap()
        XCTAssertTrue(app.otherElements["workspace.ready"].waitForExistence(timeout: 5))

        app.buttons["workspace.lock"].tap()
        XCTAssertTrue(app.otherElements["authentication.locked"].exists)
        app.buttons["authentication.unlock"].tap()

        app.buttons["testing.toggleOffline"].tap()
        XCTAssertTrue(app.otherElements["sync.offline"].exists)
        app.buttons["testing.createPendingTask"].tap()
        XCTAssertTrue(app.otherElements["sync.pending"].exists)
        app.buttons["testing.toggleOffline"].tap()
        XCTAssertTrue(app.buttons["sync.reviewConflicts"].waitForExistence(timeout: 5))
        app.buttons["sync.reviewConflicts"].tap()
        app.buttons["sync.keepLocal"].tap()

        app.buttons["account.signOut"].tap()
        XCTAssertTrue(app.sheets["account.pendingWorkWarning"].exists)
        app.sheets["account.pendingWorkWarning"].buttons["Cancel"].tap()
    }
}
