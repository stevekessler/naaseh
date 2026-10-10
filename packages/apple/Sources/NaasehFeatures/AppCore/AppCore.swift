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
    case upgradeRequired, betaExpired, temporarilyUnavailable, storeUnavailable
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
    func lock() async
    func signOut() async throws
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
    public var router: SceneRouter

    public init(
        dependencies: AppDependencies,
        restoration: RedactedRestorationModel = .init()
    ) {
        self.dependencies = dependencies
        router = SceneRouter(restoration: restoration)
    }

    public func updateState(_ state: ApplicationLifecycleState) {
        self.state = state
        if state == .locked || state == .signedOut { router.lock() }
    }

    public func start() async {
        state = .openingStore
        do {
            try await dependencies.lifecycle.start()
            state = .ready(connectivity: .online)
        } catch AuthenticationError.noSession {
            state = .signedOut
        } catch AppLifecycleError.upgradeRequired {
            state = .blocked(.upgradeRequired)
        } catch AppLifecycleError.betaExpired {
            state = .blocked(.betaExpired)
        } catch AppLifecycleError.temporarilyUnavailable {
            state = .blocked(.temporarilyUnavailable)
        } catch {
            state = .blocked(.storeUnavailable)
        }
    }

    public func lock() async {
        await dependencies.lifecycle.lock()
        updateState(.locked)
    }

    public func signOut() async throws {
        try await dependencies.lifecycle.signOut()
        updateState(.signedOut)
    }
}
