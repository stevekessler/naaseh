import CryptoKit
import Foundation

public struct CompletedTaskReportRow: Codable, Equatable, Sendable { public let id: String; public let label: String; public let completedAt: Date; public let projectID: String?; public let categoryID: String?; public let credit: Decimal; public init(id: String, label: String, completedAt: Date, projectID: String? = nil, categoryID: String? = nil, credit: Decimal = 0) { self.id = id; self.label = label; self.completedAt = completedAt; self.projectID = projectID; self.categoryID = categoryID; self.credit = credit } }
public struct CompletedTaskReport: Equatable, Sendable {
    public let rows: [CompletedTaskReportRow]
    public let totalCredit: Decimal

    public init(rows: [CompletedTaskReportRow], totalCredit: Decimal) {
        self.rows = rows
        self.totalCredit = totalCredit
    }
}
public struct ExportReceipt: Codable, Equatable, Sendable { public let downloadURL: URL; public let sha256: String; public let expiresAt: Date; public init(downloadURL: URL, sha256: String, expiresAt: Date) { self.downloadURL = downloadURL; self.sha256 = sha256; self.expiresAt = expiresAt } }
public protocol ReportExportTransport: Sendable { func request(start: Date, end: Date) async throws -> ExportReceipt; func download(_ url: URL) async throws -> Data }
public enum ReportExportError: Error, Equatable, Sendable { case invalidRange, expired, integrityFailure }

public actor ReportExportService {
    private let transport: (any ReportExportTransport)?
    public init(transport: (any ReportExportTransport)? = nil) { self.transport = transport }
    public func report(rows: [CompletedTaskReportRow], start: Date, end: Date, projectID: String? = nil, categoryID: String? = nil) throws -> CompletedTaskReport { guard start <= end else { throw ReportExportError.invalidRange }; let selected = rows.filter { $0.completedAt >= start && $0.completedAt <= end && (projectID == nil || $0.projectID == projectID) && (categoryID == nil || $0.categoryID == categoryID) }; return .init(rows: selected.sorted { $0.completedAt > $1.completedAt }, totalCredit: selected.reduce(0) { $0 + $1.credit }) }
    public func export(start: Date, end: Date, destination: URL, now: Date = Date()) async throws -> URL { guard let transport else { throw ReportExportError.invalidRange }; let receipt = try await transport.request(start: start, end: end); guard receipt.expiresAt > now else { throw ReportExportError.expired }; let data = try await transport.download(receipt.downloadURL); let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(); guard digest == receipt.sha256.lowercased() else { throw ReportExportError.integrityFailure }; try data.write(to: destination, options: protectedWriteOptions); return destination }
    public func cleanup(_ url: URL, now: Date, expiresAt: Date) throws { if now >= expiresAt, FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) } }
    private var protectedWriteOptions: Data.WritingOptions {
        #if os(iOS)
        [.atomic, .completeFileProtection]
        #else
        [.atomic]
        #endif
    }
}
