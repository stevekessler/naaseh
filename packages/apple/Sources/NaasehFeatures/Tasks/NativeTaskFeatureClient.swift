import CryptoKit
import NaasehCrypto
import Foundation
import NaasehContracts
import NaasehServices

public enum NativeTaskFeatureError: Error, LocalizedError, Sendable {
    case unavailable, invalidFile, unverifiedDownload, expired, permission, changed
    public var errorDescription: String? {
        switch self {
        case .unavailable: "The service is unavailable. Connect and try again."
        case .invalidFile: "Choose a supported file of 25 MB or less."
        case .unverifiedDownload: "The downloaded file could not be verified."
        case .expired: "This download expired. Request it again."
        case .permission: "This item is no longer available to your account."
        case .changed: "This item changed elsewhere. Refresh before trying again."
        }
    }
}

public struct TaskAttachmentRecord: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let parentType: String
    public let parentId: String
    public let originalFilename: String
    public let mediaType: String
    public let sizeBytes: Int
    public let checksumSha256: String
    public var status: String
    public var version: Int
}

public struct NativeCompletionReport: Codable, Sendable {
    public struct Bucket: Codable, Identifiable, Sendable {
        public let key: String
        public let count: Int
        public var id: String { key }
    }
    public let asOf: String
    public let total: Int
    public let buckets: [Bucket]
    public let urgencyCounts: [String: Int]
}

public struct NativeCompletionDetail: Codable, Identifiable, Sendable {
    public let eventId: String
    public let workId: String
    public let urgencyAtCompletion: String
    public let completedAt: String?
    public var id: String { eventId }
}

public actor NativeTaskFeatureClient {
    let client: APIClient
    let credential: @Sendable () async throws -> NativeSessionCredential
    private let resourceProtocols: [AnyClass]?
    public init(client: APIClient, resourceProtocols: [AnyClass]? = nil, credential: @escaping @Sendable () async throws -> NativeSessionCredential) {
        self.client = client; self.resourceProtocols = resourceProtocols; self.credential = credential
    }
    func data(_ path: String, method: String = "GET", body: Data? = nil, headers: [String: String] = [:]) async throws -> Data {
        let response = try await client.request(path: path, method: method, body: body, session: try await credential(),
                                                idempotencyKey: method == "GET" ? nil : headers["x-client-mutation-id"], headers: headers)
        try response.requireValidSession()
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 409 { throw NativeTaskFeatureError.changed }
            if [403, 404].contains(response.statusCode) { throw NativeTaskFeatureError.permission }
            throw NativeTaskFeatureError.unavailable
        }
        return response.body
    }
    func json<T: Decodable & Sendable>(_ path: String, as type: T.Type, method: String = "GET", body: Data? = nil,
                                        headers: [String: String] = [:]) async throws -> T {
        try JSONDecoder().decode(type, from: await data(path, method: method, body: body, headers: headers))
    }
    public func currentServerTime() async -> Date { await client.currentServerTime() }
    public func task(_ id: String) async throws -> TaskRecord {
        try await json("/api/v1/tasks/\(component(id))", as: TaskRecord.self)
    }
    public func bootstrapRegistry() async throws -> JSONValue {
        let value = try await json("/api/v1/sync/bootstrap", as: JSONValue.self)
        guard case let .object(fields) = value, let registry = fields["keyRegistry"] else { throw NativeTaskFeatureError.unavailable }
        return registry
    }
    public func directory() async throws -> [TaskReferenceOption] {
        struct Person: Decodable { let id: String; let displayName: String; let username: String }
        struct Page: Decodable { let items: [Person] }
        return try await json("/api/v1/users/directory", as: Page.self).items.map {
            TaskReferenceOption(id: $0.id, name: $0.displayName.isEmpty ? $0.username : $0.displayName)
        }
    }
    public func attachment(_ id: String) async throws -> TaskAttachmentRecord {
        try await json("/api/v1/attachments/\(component(id))", as: TaskAttachmentRecord.self)
    }
    public func removeAttachment(_ id: String) async throws {
        _ = try await data("/api/v1/attachments/\(component(id))", method: "DELETE", headers: ["x-client-mutation-id": NativeULID.make()])
    }
    public func retryAttachment(_ id: String) async throws -> TaskAttachmentRecord {
        try await json("/api/v1/attachments/\(component(id))/retry", as: TaskAttachmentRecord.self, method: "POST",
                       headers: ["x-client-mutation-id": NativeULID.make()])
    }
    public func upload(_ source: URL, taskID: String, progress: @Sendable (Double) -> Void) async throws -> TaskAttachmentRecord {
        let access = source.startAccessingSecurityScopedResource()
        defer { if access { source.stopAccessingSecurityScopedResource() } }
        let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        let types = ["pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "txt": "text/plain",
                     "csv": "text/csv", "md": "text/markdown", "markdown": "text/markdown", "doc": "application/msword",
                     "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "xls": "application/vnd.ms-excel",
                     "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ppt": "application/vnd.ms-powerpoint",
                     "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"]
        guard size > 0, size <= 25 * 1024 * 1024, let type = types[source.pathExtension.lowercased()] else { throw NativeTaskFeatureError.invalidFile }
        // Take one bounded snapshot. The bytes hashed here are exactly those uploaded.
        let bytes = try Data(contentsOf: source)
        guard bytes.count == size else { throw NativeTaskFeatureError.invalidFile }
        let checksum = Data(SHA256.hash(data: bytes)).base64EncodedString()
        struct Grant: Decodable { let attachment: TaskAttachmentRecord; let uploadSessionId: String; let uploadUrl: URL; let requiredHeaders: [String: String]; let expiresAt: String }
        let body: [String: JSONValue] = ["parentType": .string("task"), "parentId": .string(taskID),
            "originalFilename": .string(source.lastPathComponent), "mediaType": .string(type), "sizeBytes": .number(Decimal(size)), "checksumSha256": .string(checksum)]
        let grant = try await json("/api/v1/attachments/uploads", as: Grant.self, method: "POST", body: JSONEncoder().encode(body),
                                   headers: ["x-client-mutation-id": NativeULID.make()])
        guard NativeAccountTaskTimer.date(grant.expiresAt) ?? .distantPast > Date() else { throw NativeTaskFeatureError.expired }
        progress(0.1)
        let response = try await signedRequest(grant.uploadUrl, method: "PUT", body: bytes, headers: grant.requiredHeaders, maximumBytes: 64 * 1024)
        guard let version = response.1.value(forHTTPHeaderField: "x-amz-version-id"), let etag = response.1.value(forHTTPHeaderField: "etag") else {
            throw NativeTaskFeatureError.unverifiedDownload
        }
        progress(0.9)
        let completed = try await json("/api/v1/attachments/\(component(grant.attachment.id))/complete", as: TaskAttachmentRecord.self,
            method: "POST", body: JSONEncoder().encode(["objectVersionId": version, "etag": etag]),
            headers: ["x-upload-session-id": grant.uploadSessionId, "x-client-mutation-id": NativeULID.make()])
        progress(1)
        return completed
    }
    public func download(_ attachment: TaskAttachmentRecord) async throws -> Data {
        struct Grant: Decodable { let url: URL; let expiresAt: String }
        let fresh = try await self.attachment(attachment.id)
        guard fresh.status == "available" else { throw NativeTaskFeatureError.permission }
        let grant = try await json("/api/v1/attachments/\(component(attachment.id))/download", as: Grant.self)
        guard NativeAccountTaskTimer.date(grant.expiresAt) ?? .distantPast > Date() else { throw NativeTaskFeatureError.expired }
        let bytes = try await signedRequest(grant.url, maximumBytes: 25 * 1024 * 1024).0
        let digest = Data(SHA256.hash(data: bytes))
        guard bytes.count == fresh.sizeBytes,
              fresh.checksumSha256 == digest.base64EncodedString() || fresh.checksumSha256.lowercased() == digest.map({ String(format: "%02x", $0) }).joined() else {
            throw NativeTaskFeatureError.unverifiedDownload
        }
        return bytes
    }
    public func completionReport(query: String) async throws -> NativeCompletionReport {
        try await json("/api/v1/reporting/completion-report?\(query)", as: NativeCompletionReport.self)
    }
    public func completionDetails(query: String) async throws -> [NativeCompletionDetail] {
        struct Page: Decodable { let items: [NativeCompletionDetail]; let nextCursor: String? }
        var result: [NativeCompletionDetail] = [], cursor: String?, seen: Set<String> = []
        repeat {
            let extra = cursor.map { "&cursor=\(component($0))" } ?? ""
            let page = try await json("/api/v1/reporting/completion-report/drilldown?\(query)\(extra)", as: Page.self)
            result += page.items; cursor = page.nextCursor
            if let cursor, !seen.insert(cursor).inserted { throw NativeTaskFeatureError.changed }
        } while cursor != nil
        return result
    }
    public func completionCSV(filters: JSONValue, asOf: String) async throws -> Data {
        struct Job: Decodable {
            let id: String; let status: String; let schemaVersion: String; let rowCount: Int?
            let checksum: String?; let downloadAvailable: Bool; let downloadUrl: URL?
        }
        let payload: JSONValue = .object(["filters": filters, "browserTimeZone": .string(TimeZone.current.identifier),
            "asOf": .string(asOf), "idempotencyKey": .string(NativeULID.make()), "scope": .string("self"), "adminConfirmed": .bool(false)])
        var job = try await json("/api/v1/reporting/completion-export", as: Job.self, method: "POST", body: JSONEncoder().encode(payload))
        for _ in 0..<150 {
            if ["completed", "failed"].contains(job.status) { break }
            try await Task.sleep(for: .seconds(2))
            job = try await json("/api/v1/reporting/completion-export/\(component(job.id))", as: Job.self)
        }
        guard job.status == "completed", job.schemaVersion == "naaseh.completed-tasks/v1", job.downloadAvailable,
              let url = job.downloadUrl, let checksum = job.checksum, let rows = job.rowCount else { throw NativeTaskFeatureError.unavailable }
        let bytes = try await signedRequest(url, maximumBytes: 100 * 1024 * 1024).0
        try NativeCompletionCSV.validate(bytes, checksum: checksum, rowCount: rows)
        return bytes
    }
    func component(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
    /// Signed S3 grants travel in an isolated session, without account cookies or authorization headers.
    private func signedRequest(_ url: URL, method: String = "GET", body: Data? = nil,
                               headers: [String: String] = [:], maximumBytes: Int) async throws -> (Data, HTTPURLResponse) {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              let host = url.host?.lowercased(), host.hasSuffix(".amazonaws.com"), host.contains(".s3."),
              URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name.lowercased() == "x-amz-signature" }) == true else {
            throw NativeTaskFeatureError.permission
        }
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.urlCache = nil; config.httpShouldSetCookies = false
        if let resourceProtocols { config.protocolClasses = resourceProtocols }
        let session = URLSession(configuration: config, delegate: NativeSignedRedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body
        for (key, value) in headers {
            guard key.lowercased() == "content-type" || key.lowercased().hasPrefix("x-amz-") else { throw NativeTaskFeatureError.permission }
            request.setValue(value, forHTTPHeaderField: key)
        }
        let (stream, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
              response.expectedContentLength <= maximumBytes else { throw NativeTaskFeatureError.unavailable }
        var data = Data()
        for try await byte in stream {
            guard data.count < maximumBytes else { throw NativeTaskFeatureError.invalidFile }
            data.append(byte)
        }
        return (data, response)
    }
}

private final class NativeSignedRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

public enum NativeCompletionCSV {
    public static let headers = "schema_version,export_as_of,record_kind,task_id,parent_task_id,root_task_id,label,link,memo_text,memo_document_json,memo_protected,created_at,updated_at,due_kind,due_date,due_at,due_time_precision,completed_at,completion_event_id,completed_by_user_id,completion_reversed_at,archived_at,archive_reason,status,lifecycle,completion_state,priority,owner_user_id,assignee_user_id,category_id,category_label,project_id,project_label,group_id,group_label,visibility,shared_with_json,lock_state,locked_by_user_id,recurrence_json,reminders_json,list_id,list_item_id,list_amount_minor,post_it_color,post_it_effective_color,google_task_id,google_task_list_id,google_sync_state,google_last_synced_at,attachments_json,task_version,completion_version,sync_state,viewer_overall_rank,viewer_project_rank"
    public static func validate(_ data: Data, checksum: String, rowCount: Int) throws {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard digest == checksum.lowercased(), let text = String(data: data, encoding: .utf8), text.hasPrefix(headers + "\r\n") else {
            throw NativeTaskFeatureError.unverifiedDownload
        }
        let bytes = Array(data); var quoted = false, records = 0, i = 0
        while i < bytes.count {
            if bytes[i] == 34 {
                if quoted && i + 1 < bytes.count && bytes[i + 1] == 34 { i += 1 }
                else { quoted.toggle() }
            } else if !quoted && bytes[i] == 13 && i + 1 < bytes.count && bytes[i + 1] == 10 { records += 1; i += 1 }
            i += 1
        }
        guard !quoted, records == rowCount + 1 else { throw NativeTaskFeatureError.unverifiedDownload }
    }
}

public extension NativeTaskFeatureClient {
    func recoverHiddenMemo(_ package: HiddenMemoPackage, password: String, reason: String) async throws -> Data {
        struct Recovery: Decodable { let region: String; let authority: String; let algorithm: String; let encryptedDek: String }
        let pair = try NativeRSAKeys.ephemeral()
        let body = ["password": password, "reason": reason,
                    "ephemeralPublicKeySpki": NaasehCrypto.base64URLEncode(pair.spki)]
        let result = try await json("/api/v1/tasks/\(component(package.taskId))/hidden-memo/recovery", as: Recovery.self,
                                   method: "POST", body: JSONEncoder().encode(body))
        guard result.region == "us-west-2", result.authority == "recovery", result.algorithm == "RSA-OAEP-256" else {
            throw HiddenMemoError.recoveryUnavailable
        }
        return try NaasehCrypto.rsaOAEPUnwrap(NaasehCrypto.base64URLDecode(result.encryptedDek), privateKey: pair.privateKey)
    }
}

public extension NativeTaskFeatureClient {
    func currentValue(kind: String, id: String, projectID: String? = nil) async throws -> (value: JSONValue, version: Int) {
        let value: JSONValue
        if kind == "task" { value = try await json("/api/v1/tasks/\(component(id))", as: JSONValue.self) }
        else if kind == "timer" {
            let bootstrap = try await json("/api/v1/sync/bootstrap", as: JSONValue.self)
            guard case let .object(fields) = bootstrap, let timer = fields["taskTimer"] else { throw NativeTaskFeatureError.permission }
            value = timer
        } else if kind == "stack" {
            let stack = try await NativeTaskStackClient(client: client, credential: credential).load(ownerID: id.hasSuffix(":overall") ? String(id.dropLast(8)) : "", projectID: projectID)
            value = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(stack))
        } else { throw NativeTaskFeatureError.unavailable }
        guard case let .object(fields) = value, case let .number(version) = fields["version"] else { throw NativeTaskFeatureError.unavailable }
        return (value, NSDecimalNumber(decimal: version).intValue)
    }
}

public struct NativeTaskGroup: Codable, Sendable { public let id: String; public let name: String; public let joined: Bool }
public extension NativeTaskFeatureClient {
    func groups() async throws -> [NativeTaskGroup] {
        struct Page: Decodable { let items: [NativeTaskGroup] }
        return try await json("/api/v1/groups", as: Page.self).items
    }
}
