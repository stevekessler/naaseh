import Foundation
import NaasehContracts

public struct AuthenticationHTTPRequest: Sendable, Equatable {
    public let path: String
    public let method: String
    public let body: String
    public let cookie: String?
    public let csrfToken: String?

    public init(
        path: String,
        method: String,
        body: String = "",
        cookie: String? = nil,
        csrfToken: String? = nil
    ) {
        self.path = path
        self.method = method
        self.body = body
        self.cookie = cookie
        self.csrfToken = csrfToken
    }
}

public struct AuthenticationHTTPResponse: Sendable {
    public let statusCode: Int
    public let headers: [String: String]
    public let body: Data
    public let setCookies: [String]

    public init(
        statusCode: Int,
        headers: [String: String],
        body: Data,
        setCookies: [String] = []
    ) {
        self.statusCode = statusCode
        self.headers = headers
        self.body = body
        self.setCookies = setCookies
    }
}

public protocol AuthenticationTransport: Sendable {
    func send(_ request: AuthenticationHTTPRequest) async throws -> AuthenticationHTTPResponse
}

public enum NativeUserRole: String, Codable, Sendable { case admin, user }

public struct NativeSessionUser: Codable, Equatable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String
    public let role: NativeUserRole

    public init(id: String, username: String, displayName: String, role: NativeUserRole) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.role = role
    }
}

public struct NativeAuthenticatedSession: Equatable, Sendable {
    public let user: NativeSessionUser
    public let csrfToken: String
    public let credential: NativeSessionCredential

    public init(user: NativeSessionUser, csrfToken: String, credential: NativeSessionCredential) {
        self.user = user
        self.csrfToken = csrfToken
        self.credential = credential
    }
}

public enum AuthenticationNextStep: Equatable, Sendable {
    case authenticated(NativeAuthenticatedSession)
    case tfaChallenge(expiresAt: Date)
    case tfaEnrollment(expiresAt: Date)
}

public enum NativeFactorMethod: String, Codable, Sendable { case totp, recoveryCode = "recovery_code" }

public enum AuthenticationError: Error, Equatable, Sendable {
    case redirectRejected
    case malformedResponse
    case authenticationFailed
    case sessionExpired
    case accountDisabled
    case server(code: String, correlationID: String)
    case missingPreAuthentication
    case noSession
}

public struct TFAEnrollment: Decodable, Sendable {
    public let secret: String
    public let otpauthUri: String
}

public struct RememberedDevice: Decodable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let lastUsedAt: String?
    public let current: Bool?
}

private struct SessionPayload: Decodable {
    let user: NativeSessionUser
    let csrfToken: String
}

private struct NextPayload: Decodable {
    let next: String
    let expiresAt: Date
}

public actor AuthenticationService {
    public private(set) var session: NativeAuthenticatedSession?
    public private(set) var isLocallyLocked = false
    private let transport: any AuthenticationTransport
    private var preAuthenticationCookie: String?

    public init(transport: any AuthenticationTransport) { self.transport = transport }

    public func restore(_ session: NativeAuthenticatedSession) { self.session = session }

    public func lockLocally() { isLocallyLocked = true }
    public func unlockLocally() throws {
        guard session != nil else { throw AuthenticationError.noSession }
        isLocallyLocked = false
    }

    public func login(username: String, password: String) async throws -> AuthenticationNextStep {
        let body = try encode(["username": username, "password": password])
        let response = try await transport.send(
            .init(path: "/api/v1/auth/login", method: "POST", body: body)
        )
        return try consumeLoginResponse(response)
    }

    public func completeChallenge(
        method: NativeFactorMethod,
        code: String,
        rememberDevice: Bool
    ) async throws -> NativeAuthenticatedSession {
        guard let preAuthenticationCookie else { throw AuthenticationError.missingPreAuthentication }
        let body = try encode([
            "method": method.rawValue,
            "code": code,
            "rememberDevice": rememberDevice,
        ] as [String: Any])
        let response = try await transport.send(
            .init(
                path: "/api/v1/auth/tfa/challenge",
                method: "POST",
                body: body,
                cookie: preAuthenticationCookie
            )
        )
        return try consumeSessionResponse(response)
    }

    public func startEnrollment() async throws -> TFAEnrollment {
        guard let preAuthenticationCookie else { throw AuthenticationError.missingPreAuthentication }
        let response = try await transport.send(
            .init(path: "/api/v1/auth/tfa/enrollment", method: "POST", cookie: preAuthenticationCookie)
        )
        try validateStatus(response)
        do { return try JSONDecoder().decode(TFAEnrollment.self, from: response.body) }
        catch { throw AuthenticationError.malformedResponse }
    }

    public func confirmEnrollment(code: String, rememberDevice: Bool) async throws -> NativeAuthenticatedSession {
        guard let preAuthenticationCookie else { throw AuthenticationError.missingPreAuthentication }
        let response = try await transport.send(
            .init(
                path: "/api/v1/auth/tfa/enrollment/confirm",
                method: "POST",
                body: try encode(["code": code, "rememberDevice": rememberDevice] as [String: Any]),
                cookie: preAuthenticationCookie
            )
        )
        return try consumeSessionResponse(response)
    }

    public func resetPassword(
        username: String,
        pin: String,
        newPassword: String,
        confirmation: String
    ) async throws {
        let response = try await transport.send(
            .init(
                path: "/api/v1/auth/password-reset",
                method: "POST",
                body: try encode([
                    "username": username, "pin": pin, "newPassword": newPassword,
                    "confirmPassword": confirmation,
                ])
            )
        )
        try validateStatus(response)
    }

    public func changePassword(
        currentPassword: String,
        method: NativeFactorMethod,
        code: String,
        newPassword: String,
        confirmation: String
    ) async throws {
        guard let session else { throw AuthenticationError.noSession }
        let response = try await transport.send(
            .init(
                path: "/api/v1/profile/security/password",
                method: "POST",
                body: try encode([
                    "password": currentPassword, "method": method.rawValue, "code": code,
                    "newPassword": newPassword, "confirmPassword": confirmation,
                ]),
                cookie: cookieHeader(session.credential),
                csrfToken: session.csrfToken
            )
        )
        try validateStatus(response)
    }

    public func rememberedDevices() async throws -> [RememberedDevice] {
        guard let session else { throw AuthenticationError.noSession }
        let response = try await transport.send(
            .init(
                path: "/api/v1/profile/security/trusted-devices",
                method: "GET",
                cookie: cookieHeader(session.credential)
            )
        )
        try validateStatus(response)
        struct Payload: Decodable { let devices: [RememberedDevice] }
        do { return try JSONDecoder().decode(Payload.self, from: response.body).devices }
        catch { throw AuthenticationError.malformedResponse }
    }

    public func forgetRememberedDevice(id: String) async throws {
        guard let session else { throw AuthenticationError.noSession }
        let response = try await transport.send(
            .init(
                path: "/api/v1/profile/security/trusted-devices/\(id)",
                method: "DELETE",
                cookie: cookieHeader(session.credential),
                csrfToken: session.csrfToken
            )
        )
        try validateStatus(response)
    }

    public func validateSession() async throws -> NativeAuthenticatedSession {
        guard let session else { throw AuthenticationError.noSession }
        let response = try await transport.send(
            .init(
                path: "/api/v1/auth/session",
                method: "GET",
                cookie: cookieHeader(session.credential)
            )
        )
        try validateStatus(response)
        if response.body.isEmpty { return session }
        if let payload = try? decoder.decode(SessionPayload.self, from: response.body) {
            let validated = NativeAuthenticatedSession(
                user: payload.user,
                csrfToken: payload.csrfToken,
                credential: .init(
                    cookieName: session.credential.cookieName,
                    cookieValue: session.credential.cookieValue,
                    csrfToken: payload.csrfToken
                )
            )
            self.session = validated
            return validated
        }
        if let object = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any],
           object["authenticated"] as? Bool == true
        {
            return session
        }
        throw AuthenticationError.malformedResponse
    }

    public func logout() async throws {
        guard let session else { return }
        let response = try await transport.send(
            .init(
                path: "/api/v1/auth/logout",
                method: "POST",
                cookie: cookieHeader(session.credential),
                csrfToken: session.csrfToken
            )
        )
        try validateStatus(response)
        self.session = nil
        preAuthenticationCookie = nil
        isLocallyLocked = false
    }

    private func consumeLoginResponse(_ response: AuthenticationHTTPResponse) throws -> AuthenticationNextStep {
        try validateStatus(response)
        if let payload = try? decoder.decode(SessionPayload.self, from: response.body) {
            return .authenticated(try session(from: payload, response: response))
        }
        let next: NextPayload
        do { next = try decoder.decode(NextPayload.self, from: response.body) } catch {
            throw AuthenticationError.malformedResponse
        }
        guard let cookie = response.setCookies.compactMap({ cookie(named: "__Host-naaseh-preauth", in: $0) }).first
        else { throw AuthenticationError.malformedResponse }
        preAuthenticationCookie = "__Host-naaseh-preauth=\(cookie)"
        switch next.next {
        case "tfa_challenge": return .tfaChallenge(expiresAt: next.expiresAt)
        case "tfa_enrollment": return .tfaEnrollment(expiresAt: next.expiresAt)
        default: throw AuthenticationError.malformedResponse
        }
    }

    private func consumeSessionResponse(_ response: AuthenticationHTTPResponse) throws -> NativeAuthenticatedSession {
        try validateStatus(response)
        let payload: SessionPayload
        do { payload = try decoder.decode(SessionPayload.self, from: response.body) } catch {
            throw AuthenticationError.malformedResponse
        }
        return try session(from: payload, response: response)
    }

    private func session(
        from payload: SessionPayload,
        response: AuthenticationHTTPResponse
    ) throws -> NativeAuthenticatedSession {
        guard let cookieValue = response.setCookies.compactMap({ cookie(named: "__Host-naaseh", in: $0) }).first
        else { throw AuthenticationError.malformedResponse }
        let authenticated = NativeAuthenticatedSession(
            user: payload.user,
            csrfToken: payload.csrfToken,
            credential: .init(cookieValue: cookieValue, csrfToken: payload.csrfToken)
        )
        session = authenticated
        preAuthenticationCookie = nil
        return authenticated
    }

    private func validateStatus(_ response: AuthenticationHTTPResponse) throws {
        if (300 ... 399).contains(response.statusCode) { throw AuthenticationError.redirectRejected }
        guard (200 ... 299).contains(response.statusCode) else {
            guard let problem = try? JSONDecoder().decode(APIProblem.self, from: response.body) else {
                throw AuthenticationError.malformedResponse
            }
            switch problem.code {
            case "session_expired", "unauthorized": throw AuthenticationError.sessionExpired
            case "account_disabled": throw AuthenticationError.accountDisabled
            case "authentication_failed": throw AuthenticationError.authenticationFailed
            default: throw AuthenticationError.server(code: problem.code, correlationID: problem.correlationId)
            }
        }
    }

    private func cookie(named name: String, in header: String) -> String? {
        let first = header.split(separator: ";", maxSplits: 1).first.map(String.init) ?? ""
        guard first.hasPrefix("\(name)=") else { return nil }
        return String(first.dropFirst(name.count + 1))
    }

    private func cookieHeader(_ credential: NativeSessionCredential) -> String {
        "\(credential.cookieName)=\(credential.cookieValue)"
    }

    private func encode(_ object: Any) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: object), as: UTF8.self)
    }

    private var decoder: JSONDecoder {
        let value = JSONDecoder()
        value.dateDecodingStrategy = .iso8601
        return value
    }
}
