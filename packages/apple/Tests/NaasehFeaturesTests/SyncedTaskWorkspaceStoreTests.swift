import Foundation
import NaasehFeatures
import NaasehPersistence
import NaasehSync
import Testing

@Suite("Persistent task synchronization")
struct SyncedTaskWorkspaceStoreTests {
    @Test("create and complete persist server-compatible operations in the encrypted outbox")
    func createAndComplete() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("naaseh-synced-tasks-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let syncStore = SecureNativeSyncStore(controller: controller)
        await syncStore.activate(accountID: "owner", rootKey: Data(repeating: 7, count: 32))
        let workspace = SyncedTaskWorkspaceStore(syncStore: syncStore, actorID: { "owner" })

        let createID = NativeULID.make(now: Date(timeIntervalSince1970: 100))
        let created = try await workspace.create(.init(mutationID: createID, label: "Across devices"))
        #expect(created.id.count == 26)
        #expect(try await workspace.allTasks().map(\.label) == ["Across devices"])

        var operations = try await syncStore.queuedOperations(readyAt: .distantFuture, limit: 10)
        #expect(operations.count == 1)
        #expect(operations[0].operation == "create")
        #expect(operations[0].baseVersion == 0)
        let createPayload = try #require(
            JSONSerialization.jsonObject(with: operations[0].payload) as? [String: Any]
        )
        #expect(createPayload["ownerId"] as? String == "owner")
        #expect(createPayload["ownerID"] == nil)
        #expect(createPayload["status"] as? String == "open")

        let completionID = NativeULID.make(now: Date(timeIntervalSince1970: 101))
        _ = try await workspace.complete(taskID: created.id, mutationID: completionID)
        operations = try await syncStore.queuedOperations(readyAt: .distantFuture, limit: 10)
        #expect(operations.count == 2)
        #expect(operations[1].operation == "complete")
        #expect(operations[1].baseVersion == 1)
        let completionPayload = try #require(
            JSONSerialization.jsonObject(with: operations[1].payload) as? [String: Any]
        )
        let patch = try #require(completionPayload["patch"] as? [String: Any])
        #expect(patch["status"] as? String == "completed")
        #expect((completionPayload["completionEvent"] as? [String: Any])?["id"] as? String != nil)
    }

    @Test("server task JSON decodes into the native task model")
    func wireDecoding() throws {
        let data = Data(#"{"id":"01J00000000000000000000000","ownerId":"owner","label":"Remote completion","memo":"","memoHidden":false,"createdAt":"2026-10-18T17:00:00.000Z","updatedAt":"2026-10-18T17:01:00.000Z","assigneeId":"owner","visibility":"public","urgency":"medium","percentComplete":100,"status":"completed","lifecycle":"archived","completionState":"completed","archiveReason":"completed","archivedAt":"2026-10-18T17:01:00.000Z","archivedBy":"owner","completedAt":"2026-10-18T17:01:00.000Z","completedBy":"owner","currentCompletionEventId":"01J00000000000000000000001","version":2}"#.utf8)
        let task = try JSONDecoder().decode(TaskRecord.self, from: data)
        #expect(task.ownerID == "owner")
        #expect(task.lifecycle == .archived)
        #expect(task.completionState == .completed)
        #expect(task.version == 2)
    }
}
