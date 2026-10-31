import Foundation
import NaasehContracts
import NaasehPersistence
import NaasehServices
@testable import NaasehSync
import Testing
import SwiftData

@Suite("Production group revocation")
struct GroupRevocationTests {
    @Test("API access-control tombstones purge dependencies, outbox and conflicts without touching another account")
    func productionRevocation() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let root = Data(repeating: 4, count: 32)
        let store = SecureNativeSyncStore(controller: controller)
        await store.activate(accountID: "a", rootKey: root)
        let account = SecureStore(controller: controller, accountNamespace: "a", rootKey: root)
        let other = SecureStore(controller: controller, accountNamespace: "b", rootKey: root)
        func value(_ json: String) throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8)) }
        let list = try value(#"{"id":"l1","groupId":"g1","name":"Secret"}"#)
        let item = try value(#"{"id":"i1","listId":"l1","label":"Secret child"}"#)
        try await store.commit(list, operationPayload: list, kind: .list, recordID: "l1", mutationID: "m1", operationKind: "update", baseVersion: 1)
        try await store.commit(item, operationPayload: item, kind: .listItem, recordID: "i1", mutationID: "m2", operationKind: "update", baseVersion: 1)
        try await account.persistConflict(conflictID: "conflict", targetKind: .list, targetID: "l1", localMutationID: "m1", comparison: list)
        try await other.commit(list, kind: .list, recordID: "l1", mutationID: "other", operationKind: "update")
        try await store.commit(try value(#"{"id":"keep","groupId":"g2"}"#), operationPayload: item, kind: .list, recordID: "keep", mutationID: "keep", operationKind: "update", baseVersion: 1)
        // Include a stale upsert to the revoked group and an unrelated valid change in the same page.
        let body = Data(#"{"changes":[{"entityType":"accessControl","entityId":"g1","version":2,"operation":"tombstone","payload":{"kind":"group-revoked","groupId":"g1"}},{"entityType":"listItem","entityId":"new","version":1,"operation":"upsert","payload":{"id":"new","listId":"l1"}},{"entityType":"list","entityId":"fresh","version":1,"operation":"upsert","payload":{"id":"fresh","groupId":"g2"}}],"cursor":{"ACCESS#a":2}}"#.utf8)
        try await store.apply(APINativeSyncTransport.page(from: body, bootstrap: false))
        #expect(try await store.values(JSONValue.self, kind: .list).count == 2)
        #expect(try await store.values(JSONValue.self, kind: .listItem).isEmpty)
        #expect(try await store.queuedOperations(readyAt: .distantFuture, limit: 50).map(\.id) == ["keep"])
        #expect(try await other.counts().records == 1)
        #expect(try await account.currentCursor()?.contains("ACCESS#a") == true)
        // Persistence survives reopening, including the cleaned outbox and advanced cursor.
        await controller.close()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        #expect(try await account.read(JSONValue.self, kind: .list, recordID: "l1") == nil)
        #expect(try await account.counts().operations == 1)
        await #expect(throws: SecureNativeSyncStoreError.accessRevoked) {
            try await store.commit(list, operationPayload: list, kind: .list, recordID: "l1", mutationID: "late", operationKind: "update", baseVersion: 1)
        }
        let stale = NativeSyncRecord(kind: "list", id: "l1", version: 2, payload: try JSONEncoder().encode(list))
        try await store.apply(.init(records: [stale], cursor: "late-page"))
        #expect(try await store.values(JSONValue.self, kind: .list).count == 2)
        // Rejoining can only restore the group through a new authorized bootstrap.
        try await store.apply(.init(records: [stale], cursor: "rejoined", isBootstrap: true))
        #expect(try await store.values(JSONValue.self, kind: .list).count == 3)
        await controller.close()
        let schema = Schema(NaasehPersistenceSchema.models)
        let inspection = try ModelContainer(for: schema, configurations: ModelConfiguration(
            schema: schema, url: directory.appendingPathComponent(PersistenceController.storeFilename), cloudKitDatabase: .none
        ))
        #expect(try ModelContext(inspection).fetchCount(FetchDescriptor<SyncConflict>()) == 0)
    }

    @Test("audience revocations also purge the actual encrypted store", arguments: ["group:g1", "GROUP#g1"])
    func audienceRevocation(audience: String) async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let store = SecureNativeSyncStore(controller: controller)
        await store.activate(accountID: "a", rootKey: Data(repeating: 4, count: 32))
        let value = JSONValue.object(["id": .string("l1"), "groupId": .string("g1")])
        try await store.commit(value, operationPayload: value, kind: .list, recordID: "l1", mutationID: "m1", operationKind: "update", baseVersion: 1)
        try await store.apply(.init(records: [], cursor: "revoked", revokedAudiences: [audience]))
        #expect(try await store.values(JSONValue.self, kind: .list).isEmpty)
        #expect(try await store.queuedOperations(readyAt: .distantFuture, limit: 50).isEmpty)
    }
}
