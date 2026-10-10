import Foundation
import NaasehFeatures
import Testing

@Suite("Protected-content-safe feedback") struct FeedbackDiagnosticsTests {
    @Test("export contains only the closed safe diagnostic fields")
    func safeExport() throws {
        let diagnostics = SafeFeedbackDiagnostics(
            appVersion: "0.1.0", buildNumber: 1, platform: "ios",
            compatibilityState: "supported", pendingCountBucket: "oneToTen",
            correlationIDs: [UUID()]
        )
        let object = try #require(JSONSerialization.jsonObject(with: diagnostics.exportData()) as? [String: Any])
        #expect(Set(object.keys) == ["appVersion", "buildNumber", "platform", "compatibilityState", "pendingCountBucket", "correlationIDs"])
        for forbidden in ["task", "journal", "crisisPlan", "email", "account", "attachment", "token"] {
            #expect(object[forbidden] == nil)
        }
    }
}
