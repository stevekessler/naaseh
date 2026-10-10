import Foundation
import NaasehPersistence
import NaasehServices

public enum PendingWorkDecision: Sendable { case recoverLater, discard }

public protocol ProtectedSurfacePurging: Sendable {
    func purgeNotifications() async
    func endLiveActivities() async
    func clearTransientContent() async
}

public protocol PendingWorkInspecting: Sendable {
    func pendingCount() async throws -> Int
    func exportRecoveryPackage() async throws
    func discardPendingWork() async throws
}

public enum AccountCleanupError: Error, Equatable, Sendable { case pendingDecisionRequired }

public actor AccountCleanupCoordinator: AccountCleanupHandling {
    public typealias DecisionProvider = @Sendable (_ pendingCount: Int) async -> PendingWorkDecision?

    private let accountID: String
    private let secureStore: SecureAccountStore
    private let persistence: PersistenceController
    private let pendingWork: any PendingWorkInspecting
    private let surfaces: any ProtectedSurfacePurging
    private let decide: DecisionProvider

    public init(
        accountID: String,
        secureStore: SecureAccountStore,
        persistence: PersistenceController,
        pendingWork: any PendingWorkInspecting,
        surfaces: any ProtectedSurfacePurging,
        decisionProvider: @escaping DecisionProvider
    ) {
        self.accountID = accountID
        self.secureStore = secureStore
        self.persistence = persistence
        self.pendingWork = pendingWork
        self.surfaces = surfaces
        decide = decisionProvider
    }

    public func lockSurfaces() async {
        await surfaces.endLiveActivities()
        await surfaces.clearTransientContent()
    }

    public func signOut() async throws {
        let count = try await pendingWork.pendingCount()
        if count > 0 {
            guard let decision = await decide(count) else {
                throw AccountCleanupError.pendingDecisionRequired
            }
            switch decision {
            case .recoverLater: try await pendingWork.exportRecoveryPackage()
            case .discard: try await pendingWork.discardPendingWork()
            }
        }
        try await purgeAccount()
    }

    public func accountDisabled() async throws { try await purgeAccount() }

    public func authorizationRevoked() async {
        await surfaces.purgeNotifications()
        await surfaces.endLiveActivities()
        await surfaces.clearTransientContent()
    }

    public func prepareForAccountSwitch() async throws { try await signOut() }

    private func purgeAccount() async throws {
        await surfaces.purgeNotifications()
        await surfaces.endLiveActivities()
        await surfaces.clearTransientContent()
        await persistence.close()
        try await secureStore.purge(accountID: accountID)
    }
}
