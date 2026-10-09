import XCTest

final class TestFlightUpgradeUITests: XCTestCase {
    private func launch(_ fixture: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", fixture]
        app.launch()
        return app
    }

    func testCleanInstallAndUpgradePreservePendingWork() {
        let app = launch("testflight-upgrade-with-pending-work")
        XCTAssertTrue(app.staticTexts["Pending changes preserved"].waitForExistence(timeout: 5))
    }

    func testInterruptedMigrationResumesReadOnly() {
        let app = launch("testflight-interrupted-migration")
        XCTAssertTrue(app.staticTexts["Securing Your Local Data"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Save"].isEnabled)
    }

    func testLowStorageMissingKeyAndExpiredBetaFailClosed() {
        for fixture in ["testflight-low-storage", "testflight-missing-key", "testflight-beta-expired"] {
            let app = launch(fixture)
            XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'unchanged' OR label CONTAINS[c] 'expired' OR label CONTAINS[c] 'recover'")).firstMatch.waitForExistence(timeout: 5))
            app.terminate()
        }
    }
}
