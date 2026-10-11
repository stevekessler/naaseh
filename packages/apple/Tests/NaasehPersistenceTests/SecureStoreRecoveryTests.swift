import Foundation
import NaasehPersistence
import NaasehTestSupport
import Testing

@Suite("Encrypted store recovery")
struct SecureStoreRecoveryTests {
    struct Note: Codable, Equatable, Sendable { let value: String }

    @Test("entity and outbox commit atomically and remain account-partitioned")
    func atomicCommitAndPartition() async throws {
        let temporary = try TemporaryStore()
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        let first = SecureStore(controller: controller, accountNamespace: "a", rootKey: Data(repeating: 1, count: 32))
        let second = SecureStore(controller: controller, accountNamespace: "b", rootKey: Data(repeating: 2, count: 32))
        try await first.commit(Note(value: "protected"), kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create")
        #expect(try await first.counts().records == 1)
        #expect(try await first.counts().operations == 1)
        #expect(try await second.read(Note.self, kind: .task, recordID: "t1") == nil)
        #expect(try await first.read(Note.self, kind: .task, recordID: "t1") == Note(value: "protected"))
    }

    @Test("low storage leaves no partial entity or outbox")
    func lowStorage() async throws {
        let temporary = try TemporaryStore()
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        let store = SecureStore(
            controller: controller,
            accountNamespace: "a",
            rootKey: Data(repeating: 1, count: 32),
            capacityCheck: { throw CocoaError(.fileWriteOutOfSpace) }
        )
        await #expect(throws: SecureStoreError.insufficientStorage) {
            try await store.commit(Note(value: "x"), kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create")
        }
        #expect(try await store.counts().records == 0)
        #expect(try await store.counts().operations == 0)
    }

    @Test("missing or wrong keys fail closed")
    func keyFailures() async throws {
        let temporary = try TemporaryStore()
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        let store = SecureStore(controller: controller, accountNamespace: "a", rootKey: Data(repeating: 1, count: 32))
        try await store.commit(Note(value: "secret"), kind: .task, recordID: "t1", mutationID: "m1", operationKind: "create")
        let missing = SecureStore(controller: controller, accountNamespace: "a", rootKey: nil)
        await #expect(throws: SecureStoreError.missingKey) {
            _ = try await missing.read(Note.self, kind: .task, recordID: "t1")
        }
        let wrong = SecureStore(controller: controller, accountNamespace: "a", rootKey: Data(repeating: 9, count: 32))
        await #expect(throws: SecureStoreError.corruptEnvelope) {
            _ = try await wrong.read(Note.self, kind: .task, recordID: "t1")
        }
    }

    @Test("interrupted migration quarantines the next open")
    func interruptedMigration() async throws {
        let temporary = try TemporaryStore()
        let first = PersistenceController()
        try await first.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        try await first.beginMigration(sourceVersion: 1, targetVersion: 2)
        await first.close()
        let reopened = PersistenceController()
        await #expect(throws: SafeStoreFailure.migrationInterrupted) {
            try await reopened.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        }
    }

    @Test("staged migration can roll back to the validated source")
    func migrationRollback() async throws {
        let temporary = try TemporaryStore()
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        try await controller.beginMigration(sourceVersion: 1, targetVersion: 2)
        try await controller.rollbackMigration()
        #expect(await controller.health == .ready(schemaVersion: 1))
        await controller.close()
        let reopened = PersistenceController()
        try await reopened.open(appGroupIdentifier: "test", overrideDirectory: temporary.directory)
        #expect(await reopened.health == .ready(schemaVersion: 1))
    }
}
