import Foundation
import NaasehContracts

public actor APIAuthenticationTransport: AuthenticationTransport {
    private let client: APIClient

    public init(client: APIClient) { self.client = client }

    public func send(_ request: AuthenticationHTTPRequest) async throws -> AuthenticationHTTPResponse {
        let credential = request.cookie.flatMap { cookie -> NativeSessionCredential? in
            let pair = cookie.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2 else { return nil }
            return NativeSessionCredential(
                cookieName: pair[0],
                cookieValue: pair[1],
                csrfToken: request.csrfToken ?? ""
            )
        }
        let response = try await client.request(
            path: request.path,
            method: request.method,
            body: request.body.isEmpty ? nil : Data(request.body.utf8),
            session: credential
        )
        let cookies = response.headers["set-cookie"].map { [$0] } ?? []
        return .init(
            statusCode: response.statusCode,
            headers: response.headers,
            body: response.body,
            setCookies: cookies
        )
    }
}

public struct APICompatibilityDecision: Decodable, Sendable {
    public let mode: String
    public let minimumBuild: Int
    public let latestBuild: Int
    public let supportedContractVersions: [Int]
    public let messageCode: String

    public init(
        mode: String,
        minimumBuild: Int,
        latestBuild: Int,
        supportedContractVersions: [Int],
        messageCode: String
    ) {
        self.mode = mode
        self.minimumBuild = minimumBuild
        self.latestBuild = latestBuild
        self.supportedContractVersions = supportedContractVersions
        self.messageCode = messageCode
    }
}

public actor APICompatibilityClient {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func check() async throws -> APICompatibilityDecision {
        let response = try await client.request(
            path: "/api/client/compatibility",
            maximumResponseBytes: 64 * 1024
        )
        guard response.statusCode == 200 else { throw APIClientError.invalidResponse }
        return try JSONDecoder().decode(APICompatibilityDecision.self, from: response.body)
    }
}

public actor APINativeTelemetryTransport: NativeTelemetryTransport {
    private let client: APIClient
    private let credential: @Sendable () async throws -> NativeSessionCredential

    public init(
        client: APIClient,
        credential: @escaping @Sendable () async throws -> NativeSessionCredential
    ) {
        self.client = client
        self.credential = credential
    }

    public func send(events: [NativeDiagnosticEvent]) async throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(["events": events])
        guard body.count <= 32 * 1024 else { throw APIClientError.responseTooLarge }
        let response = try await client.request(
            path: "/api/client/telemetry",
            method: "POST",
            body: body,
            session: try await credential(),
            idempotencyKey: UUID().uuidString,
            maximumResponseBytes: 4 * 1024
        )
        guard response.statusCode == 204 else { throw APIClientError.invalidResponse }
    }
}

public actor APINativeNotificationTransport: NativeNotificationTransport {
    private let client: APIClient
    private let credential: @Sendable () async throws -> NativeSessionCredential

    public init(
        client: APIClient,
        credential: @escaping @Sendable () async throws -> NativeSessionCredential
    ) {
        self.client = client
        self.credential = credential
    }

    public func register(_ registration: NativeInstallationRegistration) async throws {
        let response = try await client.request(
            path: "/api/v1/push-subscriptions",
            method: "POST",
            body: try JSONEncoder().encode(registration),
            session: try await credential(),
            idempotencyKey: "push:\(registration.clientID)"
        )
        guard response.statusCode == 204 else { throw APIClientError.invalidResponse }
    }

    public func unregister(clientID: String) async throws {
        guard let escaped = clientID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            throw APIClientError.invalidResponse
        }
        let response = try await client.request(
            path: "/api/v1/push-subscriptions?kind=apple&clientId=\(escaped)",
            method: "DELETE",
            session: try await credential(),
            idempotencyKey: "push-delete:\(clientID)"
        )
        guard response.statusCode == 204 else { throw APIClientError.invalidResponse }
    }
}
