import Foundation
import NaasehServices
import Testing

@Suite("Native authentication orchestration")
struct AuthenticationServiceTests {
    @Test("login preserves pre-auth state and completes TFA with CSRF")
    func tfaFlow() async throws {
        let transport = AuthenticationTransportStub(responses: [
            .json(200, #"{"next":"tfa_challenge","expiresAt":"2026-10-07T13:00:00Z"}"#,
                  cookies: ["__Host-naaseh-preauth=preauth; Secure; HttpOnly; Path=/"]),
            .json(200, #"{"user":{"id":"u1","username":"alex","displayName":"Alex","role":"user"},"csrfToken":"csrf"}"#,
                  cookies: ["__Host-naaseh=session; Secure; HttpOnly; Path=/"]),
        ])
        let service = AuthenticationService(transport: transport)

        let next = try await service.login(username: "alex", password: "secret")
        #expect(next == .tfaChallenge(expiresAt: try #require(ISO8601DateFormatter().date(from: "2026-10-07T13:00:00Z"))))
        let session = try await service.completeChallenge(method: .totp, code: "123456", rememberDevice: true)
        #expect(session.csrfToken == "csrf")
        #expect(session.credential.cookieValue == "session")
        let requests = await transport.requests
        #expect(requests[1].cookie?.contains("__Host-naaseh-preauth=preauth") == true)
        #expect(requests[1].body.contains(#""rememberDevice":true"#))
    }

    @Test("remembered-device login can return a session immediately")
    func rememberedDevice() async throws {
        let transport = AuthenticationTransportStub(responses: [
            .json(200, #"{"user":{"id":"u1","username":"alex","displayName":"Alex","role":"user"},"csrfToken":"csrf"}"#,
                  cookies: ["__Host-naaseh=session; Secure; HttpOnly; Path=/"]),
        ])
        let result = try await AuthenticationService(transport: transport)
            .login(username: "alex", password: "secret")
        guard case let .authenticated(session) = result else {
            Issue.record("Expected an authenticated session")
            return
        }
        #expect(session.user.username == "alex")
    }

    @Test("expiry, redirects, disabled accounts, and malformed errors fail closed")
    func failuresFailClosed() async {
        for response in [
            AuthenticationHTTPResponse(statusCode: 302, headers: ["location": "https://evil.example"], body: Data()),
            .problem(401, code: "session_expired"),
            .problem(403, code: "account_disabled"),
            AuthenticationHTTPResponse(statusCode: 500, headers: [:], body: Data("not-json".utf8)),
        ] {
            let service = AuthenticationService(transport: AuthenticationTransportStub(responses: [response]))
            await #expect(throws: AuthenticationError.self) {
                _ = try await service.validateSession()
            }
        }
    }

    @Test("logout is a CSRF-protected mutation and clears local credentials")
    func logout() async throws {
        let transport = AuthenticationTransportStub(responses: [.empty(204)])
        let service = AuthenticationService(transport: transport)
        await service.restore(
            NativeAuthenticatedSession(
                user: .init(id: "u1", username: "alex", displayName: "Alex", role: .user),
                csrfToken: "csrf",
                credential: .init(cookieValue: "session", csrfToken: "csrf")
            )
        )
        try await service.logout()
        #expect(await service.session == nil)
        let request = await transport.requests.first
        #expect(request?.csrfToken == "csrf")
        #expect(request?.method == "POST")
    }
}

private actor AuthenticationTransportStub: AuthenticationTransport {
    private var responses: [AuthenticationHTTPResponse]
    private(set) var requests: [AuthenticationHTTPRequest] = []

    init(responses: [AuthenticationHTTPResponse]) { self.responses = responses }

    func send(_ request: AuthenticationHTTPRequest) throws -> AuthenticationHTTPResponse {
        requests.append(request)
        guard !responses.isEmpty else { throw URLError(.badServerResponse) }
        return responses.removeFirst()
    }
}

private extension AuthenticationHTTPResponse {
    static func json(_ status: Int, _ body: String, cookies: [String] = []) -> Self {
        .init(statusCode: status, headers: [:], body: Data(body.utf8), setCookies: cookies)
    }

    static func problem(_ status: Int, code: String) -> Self {
        .json(status, #"{"type":"urn:naaseh:problem:\#(code)","title":"Rejected","status":\#(status),"code":"\#(code)","message":"Request rejected.","correlationId":"corr"}"#)
    }

    static func empty(_ status: Int) -> Self { .init(statusCode: status, headers: [:], body: Data()) }
}
