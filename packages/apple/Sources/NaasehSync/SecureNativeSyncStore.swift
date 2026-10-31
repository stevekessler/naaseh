import Foundation
import NaasehContracts
import NaasehPersistence
import NaasehServices

public enum SecureNativeSyncStoreError: Error, Equatable, Sendable {
    case locked
    case accessRevoked
    case unsupportedRecordKind(String)
}

/// Bridges the sync engine to the encrypted, account-partitioned SwiftData store.
/// It remains unusable until the authenticated account and device-bound root key are activated.
public actor SecureNativeSyncStore: NativeSyncStore {
    private let controller: PersistenceController
    private var secureStore: SecureStore?
    private var accessExpiresAt: Date?
    private let now: @Sendable () -> Date
    private let gate = SyncStoreGate()
    private static let revocationRecordID = "__native_group_revocations__"

    public init(controller: PersistenceController, now: @escaping @Sendable () -> Date = { Date() }) {
        self.controller = controller
        self.now = now
    }

    public func activate(accountID: String, rootKey: Data, accessExpiresAt: Date? = nil) {
        self.accessExpiresAt = accessExpiresAt
        secureStore = SecureStore(
            controller: controller,
            accountNamespace: accountID,
            rootKey: rootKey
        )
    }

    public func deactivate() async {
        secureStore = nil
        accessExpiresAt = nil
        // Drain writes already in progress before callers purge the account or close the database.
        await gate.acquire()
        await gate.release()
    }

    public func renewAccess(until date: Date) { accessExpiresAt = date }

    public func currentCursor() async -> String? {
        guard let secureStore else { return nil }
        return try? await secureStore.currentCursor()
    }

    public func apply(_ page: NativeSyncPage) async throws {
        await gate.acquire()
        do {
            try await applyPage(page)
            await gate.release()
        } catch {
            await gate.release()
            throw error
        }
    }

    private func applyPage(_ page: NativeSyncPage) async throws {
        let secureStore = try requireStore()
        var values: [(kind: LocalRecordKind, id: String, version: Int, value: JSONValue)] = try page.records.map {
            guard let kind = LocalRecordKind(rawValue: $0.kind == "taskTimer" ? "timer" : ($0.kind == "personalStackOperation" ? "stack" : ($0.kind == "completionEvent" ? "completion" : $0.kind))) else {
                throw SecureNativeSyncStoreError.unsupportedRecordKind($0.kind)
            }
            return (kind, $0.id, $0.version, try JSONDecoder().decode(JSONValue.self, from: $0.payload))
        }
        var revokedGroups = Set(page.revokedAudiences.compactMap { audience -> String? in
            if audience.hasPrefix("group:") { return String(audience.dropFirst("group:".count)) }
            if audience.hasPrefix("GROUP#") { return String(audience.dropFirst("GROUP#".count)) }
            return nil
        })
        revokedGroups.formUnion(page.tombstones.filter { $0.kind == "accessControl" }.map(\.id))
        var deletions: [(kind: LocalRecordKind, id: String)] = try page.tombstones.filter {
            $0.kind != "accessControl"
        }.map {
            guard let kind = LocalRecordKind(rawValue: $0.kind == "taskTimer" ? "timer" : ($0.kind == "personalStackOperation" ? "stack" : ($0.kind == "completionEvent" ? "completion" : $0.kind))) else {
                throw SecureNativeSyncStoreError.unsupportedRecordKind($0.kind)
            }
            return (kind, $0.id)
        }
        var revocations = try await secureStore.read(
            [String: [String]].self, kind: .setting, recordID: Self.revocationRecordID
        ) ?? [:]
        if page.isBootstrap {
            // A fresh authorized bootstrap can restore access after a legitimate group rejoin.
            for item in values {
                if case let .object(fields) = item.value, case let .string(groupID) = fields["groupId"] {
                    revocations.removeValue(forKey: groupID)
                }
            }
        }
        for group in revokedGroups { revocations[group, default: []].append("group:\(group)") }
        if !revocations.isEmpty {
            // Include cached and incoming values so mixed or later pages cannot resurrect content.
            var candidates = values.map { (kind: $0.kind, id: $0.id, value: $0.value) }
            for kind in LocalRecordKind.allCases {
                candidates += try await secureStore.recordValues(JSONValue.self, kind: kind).map {
                    (kind: kind, id: $0.id, value: $0.value)
                }
            }
            for (group, previous) in revocations {
                var revoked = Set(previous)
                var changed = true
                while changed {
                    changed = false
                    for item in candidates where Self.isRevoked(item.value, kind: item.kind, id: item.id, keys: revoked) {
                        if revoked.insert("\(item.kind.rawValue):\(item.id)").inserted { changed = true }
                    }
                }
                revocations[group] = revoked.sorted()
            }
            let revoked = Set(revocations.values.flatMap { $0 })
            for item in candidates where revoked.contains("\(item.kind.rawValue):\(item.id)") {
                deletions.append((item.kind, item.id))
            }
            values.removeAll { revoked.contains("\($0.kind.rawValue):\($0.id)") }
        }
        let revocationValue = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(revocations))
        values.append((.setting, Self.revocationRecordID, 1, revocationValue))
        // The controller commits these deletions, outbox/conflict cleanup and cursor together.
        try await secureStore.applyServerValues(
            values,
            deleting: deletions,
            audience: "account",
            cursor: page.cursor
        )
    }

    public func reviewOperations() async throws -> [DecryptedPendingOperation] {
        try await requireStore().pendingOperations(readyAt: .distantFuture, limit: 100_000, includeIssues: true)
    }
    public func resolveTarget(kind: LocalRecordKind, id: String, remote: JSONValue, version: Int,
                              retry: Bool, mutationIDs: [String]) async throws {
        await gate.acquire()
        do { try await requireStore().resolveTarget(kind: kind, id: id, remote: remote, version: version, retry: retry, mutationIDs: mutationIDs)
            await gate.release()
        } catch { await gate.release(); throw error }
    }

    public func operationCounts() async throws -> NativeOperationCounts {
        try await requireStore().operationCounts()
    }

    public func queuedOperations(readyAt: Date, limit: Int) async throws -> [NativeSyncOperation] {
        try await requireStore().pendingOperations(readyAt: readyAt, limit: limit).map {
            NativeSyncOperation(
                id: $0.mutationID,
                targetKind: $0.targetKind,
                targetID: $0.targetID,
                operation: $0.operationKind,
                baseVersion: $0.baseVersion,
                payload: $0.payload,
                createdAt: $0.createdAt,
                attempts: $0.attemptCount
            )
        }
    }

    public func values<Value: Decodable & Sendable>(
        _ type: Value.Type,
        kind: LocalRecordKind
    ) async throws -> [Value] {
        let store = try requireStore()
        let values = try await store.readAll(type, kind: kind)
        guard try requireStore() === store else { throw SecureNativeSyncStoreError.locked }
        return values
    }

    /// Cache a server projection without moving the account sync cursor or creating a mutation.
    public func cache<Value: Codable & Sendable>(_ value: Value, kind: LocalRecordKind,
                                                 recordID: String, version: Int, expectedAccountID: String? = nil) async throws {
        await gate.acquire()
        do {
            let store = try requireStore()
            guard expectedAccountID == nil || store.accountID == expectedAccountID else { throw SecureNativeSyncStoreError.locked }
            try await store.applyServerValues([(kind: kind, id: recordID, version: version, value: value)],
                                                       audience: "native-projections", cursor: "")
            await gate.release()
        } catch { await gate.release(); throw error }
    }

    public func commit<Value: Codable & Sendable, Payload: Codable & Sendable>(
        _ value: Value,
        operationPayload: Payload,
        kind: LocalRecordKind,
        recordID: String,
        mutationID: String,
        operationKind: String,
        baseVersion: Int?,
        now: Date = Date()
    ) async throws {
        await gate.acquire()
        do {
            let store = try requireStore()
            let revocations = try await store.read(
                [String: [String]].self, kind: .setting, recordID: Self.revocationRecordID
            ) ?? [:]
            let json = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
            guard !Self.isRevoked(json, kind: kind, id: recordID, keys: Set(revocations.values.flatMap { $0 })) else {
                throw SecureNativeSyncStoreError.accessRevoked
            }
            try await store.commit(
                value, operationPayload: operationPayload, kind: kind, recordID: recordID,
                mutationID: mutationID, operationKind: operationKind, baseVersion: baseVersion, now: now
            )
            await gate.release()
        } catch {
            await gate.release()
            throw error
        }
    }

    private static func isRevoked(_ value: JSONValue, kind: LocalRecordKind, id: String, keys: Set<String>) -> Bool {
        if keys.contains("\(kind.rawValue):\(id)") { return true }
        guard case let .object(fields) = value else { return false }
        if case let .object(scope) = fields["scope"], case let .string(groupID) = scope["groupId"], keys.contains("group:\(groupID)") { return true }
        for (field, targetKind) in [
            ("groupId", "group"), ("listId", "list"), ("sourceListId", "list"),
            ("taskId", "task"), ("parentId", kind.rawValue),
        ] {
            if case let .string(targetID) = fields[field], keys.contains("\(targetKind):\(targetID)") { return true }
        }
        return false
    }

    public func markApplied(_ mutationIDs: [String]) async throws {
        try await requireStore().markOperationsApplied(mutationIDs)
    }

    public func markConflicted(_ mutationIDs: [String]) async throws {
        try await requireStore().markOperationsConflicted(mutationIDs)
    }

    public func markRejected(_ mutationIDs: [String]) async throws {
        try await requireStore().markOperationsRejected(mutationIDs)
    }

    public func scheduleRetry(_ mutationIDs: [String], at: Date) async throws {
        try await requireStore().scheduleOperationRetry(mutationIDs, at: at)
    }

    public func resolveConflict(mutationID: String, keepLocal: Bool) async throws {
        try await requireStore().resolveOperationConflict(mutationID: mutationID, keepLocal: keepLocal)
    }

    private func requireStore() throws -> SecureStore {
        guard let secureStore else { throw SecureNativeSyncStoreError.locked }
        if let accessExpiresAt, now() >= accessExpiresAt {
            throw AuthenticationError.offlineValidationRequired
        }
        return secureStore
    }
}

/// Actor reentrancy must not allow an edit to commit between a revocation scan and its transaction.
private actor SyncStoreGate {
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
