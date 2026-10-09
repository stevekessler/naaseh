import Foundation
import NaasehServices

public enum NativeClientAvailability: Equatable, Sendable {
    case ready
    case ordinaryOffline
    case temporaryOutage
    case updateRequired
    case betaExpired
    case unsupportedHardware
}

public enum SiriAIAvailability: Equatable, Sendable {
    case available
    case unavailable(reason: String)
}

public struct CompatibilitySnapshot: Equatable, Sendable {
    public let client: NativeClientAvailability
    public let siriAI: SiriAIAvailability
    public let mutationsAllowed: Bool
    public let pendingWorkPreserved: Bool

    public init(
        client: NativeClientAvailability,
        siriAI: SiriAIAvailability,
        mutationsAllowed: Bool,
        pendingWorkPreserved: Bool
    ) {
        self.client = client
        self.siriAI = siriAI
        self.mutationsAllowed = mutationsAllowed
        self.pendingWorkPreserved = pendingWorkPreserved
    }
}

public actor CompatibilityCoordinator {
    private var lastSupportedDecision: APICompatibilityDecision?

    public init() {}

    public func evaluate(
        response: APICompatibilityDecision?,
        networkReachable: Bool,
        supportedHardware: Bool,
        siriAI: SiriAIAvailability,
        hasEncryptedPendingWork: Bool
    ) -> CompatibilitySnapshot {
        guard supportedHardware else {
            return blocked(.unsupportedHardware, siriAI: siriAI, pending: hasEncryptedPendingWork)
        }
        guard networkReachable else {
            return .init(
                client: .ordinaryOffline,
                siriAI: siriAI,
                mutationsAllowed: lastSupportedDecision != nil,
                pendingWorkPreserved: hasEncryptedPendingWork
            )
        }
        guard let response else {
            return blocked(.temporaryOutage, siriAI: siriAI, pending: hasEncryptedPendingWork)
        }

        switch response.messageCode {
        case "ok":
            lastSupportedDecision = response
            return .init(client: .ready, siriAI: siriAI, mutationsAllowed: true, pendingWorkPreserved: hasEncryptedPendingWork)
        case "beta_expired":
            return blocked(.betaExpired, siriAI: siriAI, pending: hasEncryptedPendingWork)
        case "service_temporarily_unavailable":
            return blocked(.temporaryOutage, siriAI: siriAI, pending: hasEncryptedPendingWork)
        default:
            return blocked(.updateRequired, siriAI: siriAI, pending: hasEncryptedPendingWork)
        }
    }

    private func blocked(
        _ state: NativeClientAvailability,
        siriAI: SiriAIAvailability,
        pending: Bool
    ) -> CompatibilitySnapshot {
        .init(client: state, siriAI: siriAI, mutationsAllowed: false, pendingWorkPreserved: pending)
    }
}
