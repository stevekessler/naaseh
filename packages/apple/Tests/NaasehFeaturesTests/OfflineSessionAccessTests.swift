import Foundation
import NaasehFeatures
import NaasehPersistence
import NaasehServices
import NaasehSync
import Testing

private final class SessionTestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value = Date(timeIntervalSince1970: 1_800_000_000)
    func now() -> Date { lock.withLock { value } }
    func advance(_ seconds: TimeInterval) { lock.withLock { value = value.addingTimeInterval(seconds) } }
}

private actor SessionTestTransport: AuthenticationTransport {
    enum Mode { case online, offline, expired, disabled, broken }
    var mode: Mode = .online
    func set(_ mode: Mode) { self.mode = mode }
    func send(_ request: AuthenticationHTTPRequest) throws -> AuthenticationHTTPResponse {
        switch mode {
        case .online: return .init(statusCode: 204, headers: [:], body: Data())
        case .offline: throw URLError(.notConnectedToInternet)
        case .expired: return .init(statusCode: 401, headers: [:], body: Data())
        case .disabled:
            return .init(statusCode: 403, headers: [:], body: Data(#"{"type":"urn:naaseh:problem:account_disabled","title":"Disabled","status":403,"code":"account_disabled","message":"Disabled","correlationId":"test"}"#.utf8))
        case .broken: return .init(statusCode: 200, headers: [:], body: Data("invalid".utf8))
        }
    }
}
private actor SessionTestCompatibility: CompatibilityChecking {
    var offline = false
    func setOffline() { offline = true }
    func check() throws -> CompatibilityMode {
        if offline { throw URLError(.notConnectedToInternet) }
        return .supported
    }
}
private actor SessionTestSync: NativeSyncTransport {
    var revoked = false
    func revoke() { revoked = true }
    func bootstrap() -> NativeSyncPage { .init(records: [], cursor: "bootstrap") }
    func pull(cursor: String?) throws -> NativeSyncPage {
        if revoked { throw AuthenticationError.sessionExpired }
        return .init(records: [], cursor: "pulled")
    }
    func push(_ operations: [NativeSyncOperation]) -> [NativePushResult] {
        operations.map { .init(mutationID: $0.id, disposition: .applied) }
    }
}
private struct SessionTestTelemetry: NativeTelemetryTransport {
    func send(events: [NativeDiagnosticEvent]) async throws {}
}

@Suite("Offline session access policy")
struct OfflineSessionAccessTests {
    private func session() -> NativeAuthenticatedSession {
        .init(user: .init(id: "a", username: "alex", displayName: "Alex", role: .user), csrfToken: "csrf", credential: .init(cookieValue: "cookie", csrfToken: "csrf"))
    }
    private func runtime(
        directory: URL, clock: SessionTestClock, authentication: AuthenticationService,
        accounts: SecureAccountStore, persistence: PersistenceController,
        store: SecureNativeSyncStore, transport: SessionTestSync = SessionTestSync(),
        compatibility: SessionTestCompatibility = SessionTestCompatibility()
    ) -> NativeApplicationRuntime {
        NativeApplicationRuntime(
            compatibility: compatibility, authentication: authentication,
            secureAccounts: accounts, persistence: persistence, syncStore: store,
            sync: SyncEngine(store: store, transport: transport),
            telemetry: NativeTelemetryUploader(buffer: NativeTelemetryBuffer(memoryOnlyMaximumCount: 10), transport: SessionTestTelemetry()),
            appGroupIdentifier: "test", storeDirectory: directory, now: { clock.now() }
        )
    }

    @Test("cold offline restart preserves access and queued changes until exactly seven days, then locks without deleting")
    func coldOfflineAndExpiry() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = SessionTestClock()
        let accounts = SecureAccountStore(backend: MemorySecureItemBackend())
        let persistence = PersistenceController()
        let store = SecureNativeSyncStore(controller: persistence, now: { clock.now() })
        let onlineTransport = SessionTestTransport()
        let authentication = AuthenticationService(transport: onlineTransport)
        await authentication.restore(session())
        let first = runtime(directory: directory, clock: clock, authentication: authentication, accounts: accounts, persistence: persistence, store: store)
        try await first.start()
        #expect(await first.expireOfflineAccess() == false)
        let initialValidation = try #require(await authentication.lastValidatedAt)
        let note = "Unsynced private task"
        try await store.commit(note, operationPayload: note, kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create", baseVersion: 0)
        await first.lock()
        let offlineTransport = SessionTestTransport()
        await offlineTransport.set(.offline)
        let coldAuthentication = AuthenticationService(transport: offlineTransport)
        let coldCompatibility = SessionTestCompatibility()
        await coldCompatibility.setOffline()
        let cold = runtime(directory: directory, clock: clock, authentication: coldAuthentication, accounts: accounts, persistence: persistence, store: store, compatibility: coldCompatibility)
        clock.advance(AuthenticationService.offlineAccessLifetime - 1)
        await #expect(throws: AppLifecycleError.offlineAccessAllowed) { try await cold.start() }
        #expect(try await store.values(String.self, kind: .task) == [note])
        #expect(try await store.queuedOperations(readyAt: .distantFuture, limit: 10).count == 1)
        #expect(await coldAuthentication.lastValidatedAt == initialValidation)
        #expect(try await accounts.loadOfflineSession()?.validatedAt == initialValidation)
        // Local reads and writes are gated at the deadline, even before a foreground refresh.
        clock.advance(1)
        await #expect(throws: AuthenticationError.offlineValidationRequired) {
            _ = try await store.values(String.self, kind: .task)
        }
        await #expect(throws: AuthenticationError.offlineValidationRequired) {
            try await store.commit("blocked", operationPayload: "blocked", kind: .task, recordID: "t2", mutationID: "m2", operationKind: "create", baseVersion: 0)
        }
        await #expect(throws: AuthenticationError.offlineValidationRequired) { try await cold.refresh() }
        #expect(try await accounts.load(.deviceRootKey, accountID: "a") != nil)
        // Successful revalidation restores the retained task and starts a new seven-day window.
        await offlineTransport.set(.online)
        let resumed = runtime(directory: directory, clock: clock, authentication: coldAuthentication, accounts: accounts, persistence: persistence, store: store)
        try await resumed.start()
        #expect(try await store.values(String.self, kind: .task) == [note])
        #expect(await coldAuthentication.lastValidatedAt == clock.now())
        #expect(await resumed.expireOfflineAccess() == false)
    }

    @Test("explicit rejection removes account data and keys but preserves another account", arguments: [false, true])
    func authoritativeRejection(disabled: Bool) async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = SessionTestClock()
        let accounts = SecureAccountStore(backend: MemorySecureItemBackend())
        let persistence = PersistenceController()
        let store = SecureNativeSyncStore(controller: persistence, now: { clock.now() })
        let transport = SessionTestTransport()
        let authentication = AuthenticationService(transport: transport)
        await authentication.restore(session())
        let app = runtime(directory: directory, clock: clock, authentication: authentication, accounts: accounts, persistence: persistence, store: store)
        try await app.start()
        try await store.commit("secret", operationPayload: "secret", kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create", baseVersion: 0)
        let other = SecureStore(controller: persistence, accountNamespace: "b", rootKey: Data(repeating: 3, count: 32))
        try await other.commit("other account", kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create")
        await transport.set(disabled ? .disabled : .expired)
        await #expect(throws: disabled ? AuthenticationError.accountDisabled : .sessionExpired) { try await app.refresh() }
        #expect(await authentication.session == nil)
        #expect(try await accounts.load(.deviceRootKey, accountID: "a") == nil)
        #expect(try await accounts.load(.sessionCookie, accountID: "a") == nil)
        #expect(try await accounts.loadOfflineSession() == nil)
        await #expect(throws: SecureNativeSyncStoreError.locked) { _ = try await store.values(String.self, kind: .task) }
        try await persistence.open(appGroupIdentifier: "test", overrideDirectory: directory)
        #expect(try await persistence.counts(accountNamespace: "a").records == 0)
        #expect(try await persistence.counts(accountNamespace: "a").operations == 0)
        #expect(try await other.read(String.self, kind: .task, recordID: "t1") == "other account")
    }

    @Test("a sync rejection after successful session validation still purges the account")
    func syncRejection() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = SessionTestClock()
        let accounts = SecureAccountStore(backend: MemorySecureItemBackend())
        let persistence = PersistenceController()
        let store = SecureNativeSyncStore(controller: persistence, now: { clock.now() })
        let authentication = AuthenticationService(transport: SessionTestTransport())
        await authentication.restore(session())
        let sync = SessionTestSync()
        let app = runtime(directory: directory, clock: clock, authentication: authentication, accounts: accounts, persistence: persistence, store: store, transport: sync)
        try await app.start()
        await sync.revoke()
        await #expect(throws: AuthenticationError.sessionExpired) { try await app.refresh() }
        #expect(await authentication.session == nil)
        #expect(try await accounts.loadOfflineSession() == nil)
    }

    @Test("failed logout retains access and can be reported to the user")
    @MainActor func failedLogout() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = SessionTestClock()
        let accounts = SecureAccountStore(backend: MemorySecureItemBackend())
        let persistence = PersistenceController()
        let store = SecureNativeSyncStore(controller: persistence, now: { clock.now() })
        let transport = SessionTestTransport()
        let authentication = AuthenticationService(transport: transport)
        await authentication.restore(session())
        let app = runtime(directory: directory, clock: clock, authentication: authentication, accounts: accounts, persistence: persistence, store: store)
        let core = AppCore(dependencies: .init(lifecycle: app))
        await core.start()
        await transport.set(.offline)
        await #expect(throws: URLError.self) { try await core.signOut() }
        #expect(core.state == .ready(connectivity: .online))
        #expect(core.signOutError != nil)
        #expect(await authentication.session != nil)
        #expect(try await accounts.load(.deviceRootKey, accountID: "a") != nil)
        #expect(try await store.values(String.self, kind: .task).isEmpty)
    }
    @Test("first launch offline cannot create an unvalidated access window")
    func firstOfflineLaunch() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let clock = SessionTestClock()
        let accounts = SecureAccountStore(backend: MemorySecureItemBackend())
        let persistence = PersistenceController()
        let store = SecureNativeSyncStore(controller: persistence, now: { clock.now() })
        let transport = SessionTestTransport()
        await transport.set(.offline)
        let authentication = AuthenticationService(transport: transport)
        let app = runtime(directory: directory, clock: clock, authentication: authentication, accounts: accounts, persistence: persistence, store: store)
        await #expect(throws: AuthenticationError.noSession) { try await app.start() }
        #expect(try await accounts.loadOfflineSession() == nil)
    }

    @Test("the ready UI is withdrawn after a rejection and after offline validation expires")
    @MainActor func presentationTransitions() async throws {
        let lifecycle = PresentationLifecycle()
        let core = AppCore(dependencies: .init(lifecycle: lifecycle))
        await core.start()
        core.router.path = [.section(.tasks)]
        await lifecycle.failWith(.sessionExpired)
        await core.refresh()
        #expect(core.state == .signedOut)
        #expect(core.router.path.isEmpty)
        await lifecycle.failWith(.offlineValidationRequired)
        core.updateState(.ready(connectivity: .online))
        await core.refresh()
        #expect(core.state == .blocked(.sessionValidationRequired))
        // An unattended, open workspace also loses access at its deadline.
        await lifecycle.failWith(nil)
        await lifecycle.setExpiredDeadline()
        await core.start()
        for _ in 0 ..< 20 {
            if core.state == .blocked(.sessionValidationRequired) { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(core.state == .blocked(.sessionValidationRequired))
    }

}

private actor PresentationLifecycle: AppLifecycleService {
    var failure: AuthenticationError?
    var deadline: Date?
    func failWith(_ failure: AuthenticationError?) { self.failure = failure }
    func setExpiredDeadline() { deadline = .distantPast }
    func start() {}
    func refresh() throws { if let failure { throw failure } }
    func lock() {}
    func signOut() {}
    func offlineAccessDeadline() -> Date? { deadline }
}
