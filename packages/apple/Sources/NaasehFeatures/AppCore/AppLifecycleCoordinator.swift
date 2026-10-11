import Foundation
import NaasehServices
import NaasehSync

public enum CompatibilityMode: Equatable, Sendable { case supported, upgradeRequired, betaExpired, temporarilyUnavailable }

public protocol CompatibilityChecking: Sendable {
    func check() async throws -> CompatibilityMode
}

public protocol AccountCleanupHandling: Sendable {
    func lockSurfaces() async
    func signOut() async throws
}

public actor AppLifecycleCoordinator: AppLifecycleService {
    private let compatibility: any CompatibilityChecking
    private let authentication: AuthenticationService
    private let sync: SyncEngine
    private let telemetry: NativeTelemetryUploader
    private let cleanup: any AccountCleanupHandling
    private var lastCompatibilityCheck: Date?

    public init(
        compatibility: any CompatibilityChecking,
        authentication: AuthenticationService,
        sync: SyncEngine,
        telemetry: NativeTelemetryUploader,
        cleanup: any AccountCleanupHandling
    ) {
        self.compatibility = compatibility
        self.authentication = authentication
        self.sync = sync
        self.telemetry = telemetry
        self.cleanup = cleanup
    }

    public func start() async throws {
        try await requireCompatibility()
        _ = try await authentication.validateSession()
        try await sync.bootstrap()
        try await sync.pull()
        await telemetry.flush(sessionIsValidated: true)
    }

    public func foreground(afterSuspension: TimeInterval) async throws {
        if afterSuspension >= 15 * 60 { try await requireCompatibility() }
        _ = try await authentication.validateSession()
        await telemetry.flush(sessionIsValidated: true)
        try await sync.manualRefresh()
    }

    public func beforeMutation() async throws {
        if let lastCompatibilityCheck, Date().timeIntervalSince(lastCompatibilityCheck) < 15 * 60 {
            return
        }
        try await requireCompatibility()
    }

    public func manualRefresh() async throws {
        try await requireCompatibility()
        _ = try await authentication.validateSession()
        try await sync.manualRefresh()
        await telemetry.flush(sessionIsValidated: true)
    }

    public func performOpportunisticBackgroundWork() async {
        guard (try? await authentication.validateSession()) != nil else { return }
        try? await sync.manualRefresh()
        await telemetry.flush(sessionIsValidated: true)
    }

    public func lock() async {
        await authentication.lockLocally()
        await cleanup.lockSurfaces()
    }

    public func signOut() async throws {
        try await authentication.logout()
        try await cleanup.signOut()
    }

    private func requireCompatibility() async throws {
        switch try await compatibility.check() {
        case .supported:
            lastCompatibilityCheck = Date()
        case .upgradeRequired: throw AppLifecycleError.upgradeRequired
        case .betaExpired: throw AppLifecycleError.betaExpired
        case .temporarilyUnavailable: throw AppLifecycleError.temporarilyUnavailable
        }
    }
}

public enum AppLifecycleError: Error, Equatable, Sendable {
    case upgradeRequired, betaExpired, temporarilyUnavailable
}
