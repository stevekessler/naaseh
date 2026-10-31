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
    private let now: @Sendable () -> Date
    private let onSessionClosed: @Sendable () async -> Void
    private var sessionInvalidationHandler: (@Sendable () async -> Void)?
    private var activeAccountID: String?
    private let operationGate = NativeLifecycleGate()

    public init(
        compatibility: any CompatibilityChecking,
        authentication: AuthenticationService,
        secureAccounts: SecureAccountStore,
        persistence: PersistenceController,
        syncStore: SecureNativeSyncStore,
        sync: SyncEngine,
        telemetry: NativeTelemetryUploader,
        appGroupIdentifier: String,
        storeDirectory: URL? = nil,
        now: @escaping @Sendable () -> Date = { Date() },
        onSessionClosed: @escaping @Sendable () async -> Void = {}
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
        self.now = now
        self.onSessionClosed = onSessionClosed
    }

    public func start() async throws {
        await operationGate.acquire()
        do {
            try await startSession()
            await operationGate.release()
        } catch {
            await operationGate.release()
            throw error
        }
    }

    private func startSession() async throws {
        if await authentication.session == nil,
           let cached = try await secureAccounts.loadOfflineSession() {
            await authentication.restore(cached.session, validatedAt: cached.validatedAt)
        }
        guard await authentication.session != nil else { throw AuthenticationError.noSession }
        do {
            try await validateOnline()
            try await openAccount(online: true)
            if await syncStore.currentCursor() == nil { try await sync.bootstrap() }
            try await sync.manualRefresh()
            await telemetry.flush(sessionIsValidated: true)
        } catch {
            try await handleAccessFailure(error, openingStore: true)
        }
    }

    public func refresh() async throws {
        await operationGate.acquire()
        do {
            try await refreshSession()
            await operationGate.release()
        } catch {
            await operationGate.release()
            throw error
        }
    }

    private func refreshSession() async throws {
        guard await authentication.session != nil else { throw AuthenticationError.noSession }
        do {
            try await validateOnline()
            // Reopens a store locked when the offline validation window elapsed.
            if activeAccountID == nil { try await openAccount(online: true) }
            try await sync.manualRefresh()
            await telemetry.flush(sessionIsValidated: true)
        } catch {
            try await handleAccessFailure(error, openingStore: false)
        }
    }

    public func setSessionInvalidationHandler(_ handler: @escaping @Sendable () async -> Void) {
        sessionInvalidationHandler = handler
    }

    public func offlineAccessDeadline() async -> Date? {
        await authentication.lastValidatedAt?.addingTimeInterval(AuthenticationService.offlineAccessLifetime)
    }

    public func expireOfflineAccess() async -> Bool {
        await operationGate.acquire()
        if let deadline = await offlineAccessDeadline(), now() < deadline,
           await authentication.session != nil {
            await operationGate.release()
            return false
        }
        await lockLocalData()
        await operationGate.release()
        return true
    }

    private func validateOnline() async throws {
        switch try await compatibility.check() {
        case .supported: break
        case .upgradeRequired: throw AppLifecycleError.upgradeRequired
        case .betaExpired: throw AppLifecycleError.betaExpired
        case .temporarilyUnavailable: throw AppLifecycleError.temporarilyUnavailable
        }
        let session = try await authentication.validateSession()
        let validatedAt = now()
        try await secureAccounts.saveSession(session)
        try await secureAccounts.saveOfflineSession(.init(session: session, validatedAt: validatedAt))
        await authentication.recordValidation(at: validatedAt)
        await syncStore.renewAccess(until: validatedAt.addingTimeInterval(AuthenticationService.offlineAccessLifetime))
    }

    private func openAccount(online: Bool) async throws {
        guard let session = await authentication.session,
              let deadline = await offlineAccessDeadline() else { throw AuthenticationError.noSession }
        let rootKey: Data
        if online {
            rootKey = try await secureAccounts.createRootKeyIfNeeded(accountID: session.user.id)
        } else {
            rootKey = try await secureAccounts.requireRootKey(accountID: session.user.id)
        }
        try await persistence.open(appGroupIdentifier: appGroupIdentifier, overrideDirectory: storeDirectory)
        await syncStore.activate(accountID: session.user.id, rootKey: rootKey, accessExpiresAt: deadline)
        activeAccountID = session.user.id
        try await authentication.unlockLocally()
    }

    private func handleAccessFailure(_ error: Error, openingStore: Bool) async throws {
        if let failure = error as? AuthenticationError, failure.invalidatesLocalSession {
            try await removeRejectedSession()
            throw failure
        }
        if error as? AppLifecycleError == .upgradeRequired || error as? AppLifecycleError == .betaExpired {
            await lockLocalData()
            throw error
        }
        // Only inability to reach the service (or a temporary sync/service outage) permits fallback.
        let transportUnavailable: Bool
        if case APIClientError.transport = error { transportUnavailable = true }
        else { transportUnavailable = error is URLError }
        let unavailable = transportUnavailable
            || error as? SyncEngineError == .transport
            || error as? AppLifecycleError == .temporarilyUnavailable
        guard unavailable else { await lockLocalData(); throw error }
        guard await authentication.permitsOfflineAccess(at: now()) else {
            await lockLocalData()
            throw AuthenticationError.offlineValidationRequired
        }
        if openingStore || activeAccountID == nil { try await openAccount(online: false) }
        throw AppLifecycleError.offlineAccessAllowed
    }

    private func removeRejectedSession() async throws {
        let accountID = await authentication.session?.user.id ?? activeAccountID
        // Withdraw in-memory access before performing any fallible cleanup.
        await authentication.clearLocalSession()
        await sessionInvalidationHandler?()
        await syncStore.deactivate()
        activeAccountID = nil
        await onSessionClosed()
        guard let accountID else { return }
        // Remove keys even if the database cannot be opened or cleaned up.
        var cleanupFailure: Error?
        do {
            try await persistence.open(appGroupIdentifier: appGroupIdentifier, overrideDirectory: storeDirectory)
            try await persistence.purge(accountNamespace: accountID)
        } catch { cleanupFailure = error }
        await persistence.close()
        do { try await secureAccounts.purge(accountID: accountID) }
        catch { cleanupFailure = error }
        if let cleanupFailure { throw cleanupFailure }
    }

    public func lock() async {
        await operationGate.acquire()
        await lockLocalData()
        await operationGate.release()
    }

    private func lockLocalData() async {
        await authentication.lockLocally()
        await syncStore.deactivate()
        activeAccountID = nil
        await persistence.close()
    }

    public func signOut() async throws {
        await operationGate.acquire()
        do {
            try await signOutSession()
            await operationGate.release()
        } catch {
            await operationGate.release()
            throw error
        }
    }

    private func signOutSession() async throws {
        let accountID = await authentication.session?.user.id
        // A failed remote logout is reported to the caller and leaves local state intact.
        await NativeTaskNotificationCoordinator.shared?.disable()
        await NativeTaskLiveActivityController.shared.end()
        try await authentication.logout()
        await syncStore.deactivate()
        activeAccountID = nil
        await persistence.close()
        await onSessionClosed()
        if let accountID { try await secureAccounts.purge(accountID: accountID) }
    }
}

/// Session validation and closure must not race through actor suspension points.
private actor NativeLifecycleGate {
    private var held = false
    private var waiting: [CheckedContinuation<Void, Never>] = []
    func acquire() async {
        if !held { held = true; return }
        await withCheckedContinuation { waiting.append($0) }
    }
    func release() {
        if waiting.isEmpty { held = false }
        else { waiting.removeFirst().resume() }
    }
}
