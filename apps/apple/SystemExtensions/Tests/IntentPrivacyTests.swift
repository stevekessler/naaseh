import XCTest

final class IntentPrivacyTests: XCTestCase {
    func testNoContentDonationSymbolsAreCompiled() throws {
        let forbidden = ["CSSearchableIndex", "INInteraction", "NSUserActivity"]
        let executable = try XCTUnwrap(Bundle.main.executableURL)
        let bytes = try Data(contentsOf: executable)
        let image = String(decoding: bytes, as: UTF8.self)
        for symbol in forbidden { XCTAssertFalse(image.contains(symbol), symbol) }
    }

    func testAppShortcutPhrasesDoNotInterpolateContentEntities() {
        let description = String(describing: NaasehShortcutsProvider.appShortcuts)
        XCTAssertFalse(description.contains("taskTitle"))
        XCTAssertFalse(description.contains("project.name"))
        XCTAssertFalse(description.contains("journal"))
    }
}
