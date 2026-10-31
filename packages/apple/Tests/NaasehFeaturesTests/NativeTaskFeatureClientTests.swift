import Foundation
import CryptoKit
import NaasehFeatures
import NaasehServices
import Testing

@Suite("Native task service integrations")
struct NativeTaskFeatureClientTests {
    private func client() throws -> NativeTaskFeatureClient {
        let api = try APIClient(baseURL: URL(string: "http://localhost")!, identity: .init(platform: .macos, buildNumber: 1, contractVersion: 4),
                                allowLocalDevelopment: true, maximumAttempts: 1, protocolClasses: [TaskFeatureProtocol.self])
        return NativeTaskFeatureClient(client: api, resourceProtocols: [TaskFeatureProtocol.self], credential: {
            NativeSessionCredential(cookieValue: "session", csrfToken: "csrf")
        })
    }
    @Test("attachment download refreshes authorization and verifies the bytes without leaking cookies to S3")
    func verifiedAttachment() async throws {
        let client = try client()
        let attachment = try await client.attachment("file")
        #expect(try await client.download(attachment) == Data("abc".utf8))
        let blocked = try await client.attachment("blocked")
        await #expect(throws: NativeTaskFeatureError.permission) { try await client.download(blocked) }
        let changed = try await client.attachment("altered")
        await #expect(throws: NativeTaskFeatureError.unverifiedDownload) { try await client.download(changed) }
    }
    @Test("attachment upload preserves the required signed headers and completes the server session")
    func attachmentUpload() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("native-fixture-\(UUID().uuidString).txt")
        defer { try? FileManager.default.removeItem(at: url) }
        try Data("abc".utf8).write(to: url)
        let client = try client()
        let attachment = try await client.upload(url, taskID: "task") { _ in }
        #expect(attachment.id == "file" && attachment.status == "available")
    }
    @Test("reports use the server completion history and verify CSV jobs")
    func reportsAndDirectory() async throws {
        let client = try client()
        let report = try await client.completionReport(query: "period=day")
        #expect(report.total == 2 && report.buckets[0].count == 2)
        let serverDate = try #require(ISO8601DateFormatter().date(from: "2026-10-30T12:00:00Z"))
        #expect(abs(await client.currentServerTime().timeIntervalSince(serverDate)) < 2)
        #expect(try await client.directory().first?.name == "A Person")
        let csv = try await client.completionCSV(filters: .object([:]), asOf: "2026-10-30T12:00:00.000Z")
        #expect(String(decoding: csv, as: UTF8.self) == NativeCompletionCSV.headers + "\r\n")
    }
}

private final class TaskFeatureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        let external = request.url!.host != "localhost"
        let checksum = Data(SHA256.hash(data: Data("abc".utf8))).base64EncodedString()
        func attachment(_ id: String, status: String = "available") -> [String: Any] {
            ["id": id, "parentType": "task", "parentId": "task", "originalFilename": "file.txt", "mediaType": "text/plain",
             "sizeBytes": 3, "checksumSha256": id == "altered" ? String(repeating: "0", count: 64) : checksum,
             "status": status, "version": 1]
        }
        var status = 200
        var headers: [String: String] = ["Date": "Fri, 30 Oct 2026 12:00:00 GMT"]
        var object: Any = [:]
        var raw: Data?
        if external {
            if request.value(forHTTPHeaderField: "Cookie") != nil || request.value(forHTTPHeaderField: "X-CSRF-Token") != nil { status = 403 }
            if request.httpMethod == "PUT" {
                if request.value(forHTTPHeaderField: "x-amz-checksum-sha256") != checksum { status = 400 }
                headers = ["x-amz-version-id": "version", "etag": "etag"]
            } else if path == "/report" { raw = Data((NativeCompletionCSV.headers + "\r\n").utf8) }
            else { raw = Data("abc".utf8) }
        } else if request.value(forHTTPHeaderField: "Cookie") != "__Host-naaseh=session" { status = 401 }
        else if path == "/api/v1/attachments/uploads" {
            object = ["attachment": attachment("file", status: "pending_upload"), "uploadSessionId": "upload",
                "uploadUrl": "https://test.s3.us-west-2.amazonaws.com/file?X-Amz-Signature=test", "expiresAt": "2099-01-01T00:00:00Z",
                "requiredHeaders": ["content-type": "text/plain", "x-amz-checksum-sha256": checksum, "x-amz-server-side-encryption": "aws:kms"]]
        } else if path.hasSuffix("/complete") {
            if request.value(forHTTPHeaderField: "X-Upload-Session-ID") != "upload" { status = 400 }
            object = attachment("file")
        } else if path.contains("/attachments/") && path.hasSuffix("/download") {
            object = ["url": "https://test.s3.us-west-2.amazonaws.com/file?X-Amz-Signature=test", "expiresAt": "2099-01-01T00:00:00Z"]
        } else if path.contains("/attachments/") { object = attachment(request.url!.lastPathComponent, status: path.hasSuffix("blocked") ? "scanning" : "available") }
        else if path == "/api/v1/users/directory" { object = ["items": [["id": "person", "displayName": "A Person", "username": "person"]]] }
        else if path == "/api/v1/reporting/completion-report" {
            object = ["asOf": "2026-10-30T12:00:00.000Z", "total": 2, "buckets": [["key": "2026-10-30", "count": 2]], "urgencyCounts": ["medium": 2]]
        } else if path == "/api/v1/reporting/completion-export" {
            let csv = Data((NativeCompletionCSV.headers + "\r\n").utf8)
            object = ["id": "job", "status": "completed", "schemaVersion": "naaseh.completed-tasks/v1", "rowCount": 0,
                "checksum": SHA256.hash(data: csv).map { String(format: "%02x", $0) }.joined(), "downloadAvailable": true,
                "downloadUrl": "https://test.s3.us-west-2.amazonaws.com/report?X-Amz-Signature=test"]
        } else { status = 404 }
        let bytes = raw ?? (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
        headers["Content-Length"] = "\(bytes.count)"
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
