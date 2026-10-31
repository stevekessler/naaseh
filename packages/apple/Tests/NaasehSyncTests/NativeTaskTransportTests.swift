import Foundation
import NaasehServices
@testable import NaasehSync
import Testing

@Suite("Native task transport contracts")
struct NativeTaskTransportTests {
    @Test("bootstrap retains the account timer")
    func timerBootstrap() throws {
        let body = Data(#"{"tasks":[],"taskTimer":{"id":"owner","version":4},"cursor":{"owner":7}}"#.utf8)
        let page = try APINativeSyncTransport.page(from: body, bootstrap: true)
        #expect(page.records.count == 1 && page.records[0].kind == "taskTimer")
        #expect(page.records[0].id == "owner" && page.records[0].version == 4)
    }
    @Test("push supplies client identity and maps timer and stack wire entities")
    func mappedPush() async throws {
        let client = try APIClient(baseURL: URL(string: "http://localhost")!,
                                   identity: .init(platform: .macos, buildNumber: 1, contractVersion: 4),
                                   clientID: "native-installation", allowLocalDevelopment: true, maximumAttempts: 1,
                                   protocolClasses: [TaskSyncURLProtocol.self])
        let transport = APINativeSyncTransport(client: client, credential: {
            NativeSessionCredential(cookieValue: "test", csrfToken: "csrf")
        })
        let operations = ["timer", "stack"].enumerated().map { index, kind in
            NativeSyncOperation(id: "mutation-\(index)", targetKind: kind, targetID: "owner",
                                operation: kind == "timer" ? "timerCommand" : "reorder", baseVersion: 0,
                                payload: Data("{}".utf8), createdAt: Date())
        }
        let results = try await transport.push(operations)
        #expect(results.map(\.mutationID) == ["mutation-0", "mutation-1"])
    }
}

private final class TaskSyncURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let mutations = body?["mutations"] as? [[String: Any]]
        let types = mutations?.compactMap { $0["entityType"] as? String } ?? []
        let version = body?["contractVersion"] as? Int
        let valid = request.value(forHTTPHeaderField: "X-Client-ID") == "native-installation"
            && ((types == ["taskTimer"] && version == 5) || (types == ["personalStackOperation"] && version == 4))
        let response = HTTPURLResponse(url: request.url!, statusCode: valid ? 200 : 400, httpVersion: "HTTP/1.1", headerFields: nil)!
        let results = (mutations ?? []).map { ["mutationId": $0["id"] as? String ?? "", "status": "applied"] }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: (try? JSONSerialization.data(withJSONObject: ["results": results])) ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
