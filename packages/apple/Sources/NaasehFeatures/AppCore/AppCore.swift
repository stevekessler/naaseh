import Foundation
import NaasehServices
import Observation

public enum ApplicationLifecycleState: Equatable, Sendable {
    case launching
    case signedOut
    case locked
    case openingStore
    case migrating(progress: Double?)
    case ready(connectivity: ConnectivityState)
    case blocked(BlockedApplicationReason)
}

public enum ConnectivityState: String, Codable, Sendable {
    case online, offline, reconnecting
}

public enum BlockedApplicationReason: String, Codable, Sendable {
    case upgradeRequired, betaExpired, temporarilyUnavailable, storeUnavailable, sessionValidationRequired
}

public enum AppSection: String, CaseIterable, Codable, Identifiable, Sendable {
    case tasks, lists, directory, timer, journal, reports, settings

    public var id: String { rawValue }
}

public enum AppRoute: Hashable, Sendable {
    case section(AppSection)
    case transientDetail(kind: String, opaqueID: String)
}

public struct RedactedRestorationModel: Codable, Equatable, Sendable {
    public static let version = 1

    public let stateVersion: Int
    public let selectedSection: AppSection
    public let inspectorPresented: Bool

    public init(
        stateVersion: Int = Self.version,
        selectedSection: AppSection = .tasks,
        inspectorPresented: Bool = false
    ) {
        self.stateVersion = stateVersion
        self.selectedSection = selectedSection
        self.inspectorPresented = inspectorPresented
    }
}

public protocol AppLifecycleService: Sendable {
    func start() async throws
    func refresh() async throws
    func lock() async
    func signOut() async throws
    func offlineAccessDeadline() async -> Date?
    func expireOfflineAccess() async -> Bool
    func setSessionInvalidationHandler(_ handler: @escaping @Sendable () async -> Void) async
}

public extension AppLifecycleService {
    func offlineAccessDeadline() async -> Date? { nil }
    func expireOfflineAccess() async -> Bool { await lock(); return true }
    func setSessionInvalidationHandler(_ handler: @escaping @Sendable () async -> Void) async {}
}

public struct AppDependencies: Sendable {
    public let lifecycle: any AppLifecycleService

    public init(lifecycle: any AppLifecycleService) {
        self.lifecycle = lifecycle
    }
}

@MainActor
@Observable
public final class AppCore {
    public private(set) var state: ApplicationLifecycleState = .launching
    public let dependencies: AppDependencies
    public var signOutError: String?
    public var isSigningOut = false
    public var router: SceneRouter
    private var isRefreshing = false
    private var expirationTask: Task<Void, Never>?

    public init(
        dependencies: AppDependencies,
        restoration: RedactedRestorationModel = .init()
    ) {
        self.dependencies = dependencies
        router = SceneRouter(restoration: restoration)
    }

    public func updateState(_ state: ApplicationLifecycleState) {
        self.state = state
        if case .ready = state {} else { expirationTask?.cancel(); router.lock() }
    }

    public func start() async {
        guard state != .openingStore else { return }
        updateState(.openingStore)
        await dependencies.lifecycle.setSessionInvalidationHandler { [weak self] in
            await self?.updateState(.signedOut)
        }
        do {
            try await dependencies.lifecycle.start()
            updateState(.ready(connectivity: .online))
        } catch {
            handleLifecycleFailure(error)
        }
        await scheduleAccessExpiry()
    }

    public func refresh() async {
        guard case .ready = state, !isSigningOut, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            try await dependencies.lifecycle.refresh()
            updateState(.ready(connectivity: .online))
        } catch {
            handleLifecycleFailure(error)
        }
        await scheduleAccessExpiry()
    }

    private func handleLifecycleFailure(_ error: Error) {
        switch error {
        case AuthenticationError.noSession, AuthenticationError.sessionExpired, AuthenticationError.accountDisabled:
            updateState(.signedOut)
        case AuthenticationError.offlineValidationRequired:
            updateState(.blocked(.sessionValidationRequired))
        case AppLifecycleError.offlineAccessAllowed:
            updateState(.ready(connectivity: .offline))
        case AppLifecycleError.upgradeRequired: updateState(.blocked(.upgradeRequired))
        case AppLifecycleError.betaExpired: updateState(.blocked(.betaExpired))
        case AppLifecycleError.temporarilyUnavailable: updateState(.blocked(.temporarilyUnavailable))
        default:
            // Unexpected failures cannot silently retain a previously open workspace.
            updateState(.blocked(.storeUnavailable))
        }
    }

    private func scheduleAccessExpiry() async {
        expirationTask?.cancel()
        guard case .ready = state,
              let deadline = await dependencies.lifecycle.offlineAccessDeadline() else { return }
        expirationTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow))) }
            catch { return }
            guard !Task.isCancelled, let self else { return }
            let previousState = self.state
            self.updateState(.blocked(.sessionValidationRequired))
            let expired = await self.dependencies.lifecycle.expireOfflineAccess()
            // A validation already in flight may have renewed access while this timer waited.
            if !expired, self.state == .blocked(.sessionValidationRequired) {
                self.updateState(previousState)
                await self.scheduleAccessExpiry()
            }
        }
    }

    public func lock() async {
        await dependencies.lifecycle.lock()
        updateState(.locked)
    }

    public func signOut() async throws {
        guard !isSigningOut else { return }
        isSigningOut = true
        signOutError = nil
        defer { isSigningOut = false }
        do {
            try await dependencies.lifecycle.signOut()
            updateState(.signedOut)
        } catch {
            signOutError = "Sign-out could not be completed. Your session and local data have been kept. Please try again."
            throw error
        }
    }
}
