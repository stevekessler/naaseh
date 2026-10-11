import Foundation
import NaasehContracts
import NaasehPersistence

public enum SecureNativeSyncStoreError: Error, Equatable, Sendable {
    case locked
    case unsupportedRecordKind(String)
}

/// Bridges the sync engine to the encrypted, account-partitioned SwiftData store.
/// It remains unusable until the authenticated account and device-bound root key are activated.
public actor SecureNativeSyncStore: NativeSyncStore {
    private let controller: PersistenceController
    private var secureStore: SecureStore?

    public init(controller: PersistenceController) {
        self.controller = controller
    }

    public func activate(accountID: String, rootKey: Data) {
        secureStore = SecureStore(
            controller: controller,
            accountNamespace: accountID,
            rootKey: rootKey
        )
    }

    public func deactivate() { secureStore = nil }

    public func currentCursor() async -> String? {
        guard let secureStore else { return nil }
        return try? await secureStore.currentCursor()
    }

    public func apply(_ page: NativeSyncPage) async throws {
        let secureStore = try requireStore()
        let values: [(kind: LocalRecordKind, id: String, version: Int, value: JSONValue)] = try page.records.map {
            guard let kind = LocalRecordKind(rawValue: $0.kind) else {
                throw SecureNativeSyncStoreError.unsupportedRecordKind($0.kind)
            }
            return (kind, $0.id, $0.version, try JSONDecoder().decode(JSONValue.self, from: $0.payload))
        }
        try await secureStore.applyServerValues(
            values,
            audience: "account",
            cursor: page.cursor
        )
    }

    public func queuedOperations(readyAt: Date, limit: Int) async throws -> [NativeSyncOperation] {
        try await requireStore().pendingOperations(readyAt: readyAt, limit: limit).map {
            NativeSyncOperation(
                id: $0.mutationID,
                targetKind: $0.targetKind,
                targetID: $0.targetID,
                baseVersion: $0.baseVersion,
                payload: $0.payload,
                createdAt: $0.createdAt
            )
        }
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
        return secureStore
    }
}
