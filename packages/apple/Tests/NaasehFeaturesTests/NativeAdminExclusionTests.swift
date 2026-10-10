import Foundation
import NaasehFeatures
import Testing

@Suite("Native administration exclusion") struct NativeAdminExclusionTests {
    @Test("routes and compiled feature sources exclude administrative and operator UI")
    func exclusion() throws {
        #expect(AppSection.allCases.map(\.rawValue).contains("admin") == false)
        #expect(AppSection.allCases.map(\.rawValue).contains("provisioning") == false)
        let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../Sources/NaasehFeatures").standardized
        let names = try FileManager.default.subpathsOfDirectory(atPath: sources.path).filter { $0.hasSuffix(".swift") }
        #expect(names.contains { $0.localizedCaseInsensitiveContains("admin") } == false)
        #expect(names.contains { $0.localizedCaseInsensitiveContains("recoveryoperator") } == false)
    }
}
