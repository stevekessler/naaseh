import CryptoKit
import Foundation
import NaasehFeatures
import Testing

private actor ExportTransportFixture: ReportExportTransport {
    let data: Data
    init(data: Data) { self.data = data }
    func request(start: Date, end: Date) -> ExportReceipt { .init(downloadURL: URL(string: "https://example.invalid/export")!, sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), expiresAt: Date().addingTimeInterval(60)) }
    func download(_ url: URL) -> Data { data }
}

@Suite("Report and export parity") struct ReportExportTests {
    @Test("inclusive boundaries, filters, totals, integrity, expiry, and cleanup are explicit")
    func reportAndExport() async throws {
        let now = Date(), data = Data("id,total\n1,2".utf8)
        let service = ReportExportService(transport: ExportTransportFixture(data: data))
        let report = try await service.report(rows: [.init(id: "1", label: "Done", completedAt: now, projectID: "p", credit: 2), .init(id: "2", label: "Other", completedAt: now, projectID: "q", credit: 9)], start: now, end: now, projectID: "p")
        #expect(report.rows.count == 1); #expect(report.totalCredit == 2)
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        _ = try await service.export(start: now, end: now, destination: destination)
        #expect(try Data(contentsOf: destination) == data)
        try await service.cleanup(destination, now: now.addingTimeInterval(120), expiresAt: now)
        #expect(FileManager.default.fileExists(atPath: destination.path) == false)
    }
}
