import Foundation
import UserNotifications

public enum NativeNotificationAuthorization: String, Codable, Sendable {
    case notDetermined, denied, provisional, authorized, ephemeral
}

public enum NativePushEnvironment: String, Codable, Sendable { case sandbox, production }
public enum NativeNotificationPreviewPolicy: String, Codable, Sendable { case generic, `private` }
public enum NativeNotificationPlatform: String, Codable, Sendable { case ios, ipados, macos }

public struct NativeInstallationRegistration: Codable, Equatable, Sendable {
    public let kind: String
    public let clientID: String
    public let platform: NativeNotificationPlatform
    public let environment: NativePushEnvironment
    public let token: String
    public let topic: String
    public let previewPolicy: NativeNotificationPreviewPolicy

    private enum CodingKeys: String, CodingKey {
        case kind, clientID = "clientId", platform, environment, token, topic, previewPolicy
    }

    public init(
        clientID: String,
        platform: NativeNotificationPlatform,
        environment: NativePushEnvironment,
        token: String,
        topic: String,
        previewPolicy: NativeNotificationPreviewPolicy
    ) {
        kind = "apple"
        self.clientID = clientID
        self.platform = platform
        self.environment = environment
        self.token = token
        self.topic = topic
        self.previewPolicy = previewPolicy
    }
}

public protocol NativeNotificationTransport: Sendable {
    func register(_ registration: NativeInstallationRegistration) async throws
    func unregister(clientID: String) async throws
}

public enum NativeNotificationServiceError: Error, Equatable, Sendable {
    case permissionDenied, invalidToken, invalidTopic
}

public actor NativeNotificationService {
    private let transport: any NativeNotificationTransport
    private let platform: NativeNotificationPlatform
    private let topic: String
    public private(set) var authorization: NativeNotificationAuthorization = .notDetermined
    public private(set) var previewPolicy: NativeNotificationPreviewPolicy = .generic

    public init(transport: any NativeNotificationTransport, platform: NativeNotificationPlatform, topic: String) {
        self.transport = transport; self.platform = platform; self.topic = topic
    }

    public func updateAuthorization(_ value: NativeNotificationAuthorization) { authorization = value }
    public func updatePreviewPolicy(_ value: NativeNotificationPreviewPolicy) { previewPolicy = value }

    public func register(token: Data, clientID: String, environment: NativePushEnvironment) async throws {
        guard authorization == .authorized || authorization == .provisional else {
            throw NativeNotificationServiceError.permissionDenied
        }
        guard token.count == 32 else { throw NativeNotificationServiceError.invalidToken }
        guard topic == "link.thepandas.naaseh" || topic == "link.thepandas.naaseh.macos" else {
            throw NativeNotificationServiceError.invalidTopic
        }
        try await transport.register(.init(
            clientID: clientID,
            platform: platform,
            environment: environment,
            token: token.map { String(format: "%02x", $0) }.joined(),
            topic: topic,
            previewPolicy: previewPolicy
        ))
    }

    public func unregister(clientID: String) async throws {
        try await transport.unregister(clientID: clientID)
    }
}

public actor RecordingNotificationTransport: NativeNotificationTransport {
    public private(set) var registrations: [NativeInstallationRegistration] = []
    public private(set) var unregistered: [String] = []
    public init() {}
    public func register(_ registration: NativeInstallationRegistration) { registrations.append(registration) }
    public func unregister(clientID: String) { unregistered.append(clientID) }
}
