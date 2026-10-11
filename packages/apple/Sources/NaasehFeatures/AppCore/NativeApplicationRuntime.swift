import Foundation
import NaasehPersistence
import NaasehServices
import NaasehSync

public actor ProductionCompatibilityChecker: CompatibilityChecking {
    private let client: APICompatibilityClient
    public init(client: APICompatibilityClient) { self.client = client }

    public func check() async throws -> CompatibilityMode {
        let value = try await client.check()
        return switch value.messageCode {
        case "ok": .supported
        case "beta_expired": .betaExpired
        case "service_temporarily_unavailable": .temporarilyUnavailable
        default: .upgradeRequired
        }
    }
}

public actor NativeApplicationRuntime: AppLifecycleService {
    private let compatibility: any CompatibilityChecking
    private let authentication: AuthenticationService
    private let secureAccounts: SecureAccountStore
    private let persistence: PersistenceController
    private let syncStore: SecureNativeSyncStore
    private let sync: SyncEngine
    private let telemetry: NativeTelemetryUploader
    private let appGroupIdentifier: String
    private let storeDirectory: URL?

    public init(
        compatibility: any CompatibilityChecking,
        authentication: AuthenticationService,
        secureAccounts: SecureAccountStore,
        persistence: PersistenceController,
        syncStore: SecureNativeSyncStore,
        sync: SyncEngine,
        telemetry: NativeTelemetryUploader,
        appGroupIdentifier: String,
        storeDirectory: URL? = nil
    ) {
        self.compatibility = compatibility
        self.authentication = authentication
        self.secureAccounts = secureAccounts
        self.persistence = persistence
        self.syncStore = syncStore
        self.sync = sync
        self.telemetry = telemetry
        self.appGroupIdentifier = appGroupIdentifier
        self.storeDirectory = storeDirectory
    }

    public func start() async throws {
        switch try await compatibility.check() {
        case .supported:
            break
        case .upgradeRequired:
            throw AppLifecycleError.upgradeRequired
        case .betaExpired:
            throw AppLifecycleError.betaExpired
        case .temporarilyUnavailable:
            throw AppLifecycleError.temporarilyUnavailable
        }
        let session = try await authentication.validateSession()
        try await secureAccounts.saveSession(session)
        let rootKey = try await secureAccounts.createRootKeyIfNeeded(accountID: session.user.id)
        try await persistence.open(
            appGroupIdentifier: appGroupIdentifier,
            overrideDirectory: storeDirectory
        )
        await syncStore.activate(accountID: session.user.id, rootKey: rootKey)
        try await sync.bootstrap()
        try await sync.pull()
        await telemetry.flush(sessionIsValidated: true)
    }

    public func lock() async { await authentication.lockLocally() }

    public func signOut() async throws {
        let accountID = await authentication.session?.user.id
        try await authentication.logout()
        await syncStore.deactivate()
        await persistence.close()
        if let accountID { try await secureAccounts.purge(accountID: accountID) }
    }
}
