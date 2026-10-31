import Foundation
import NaasehFeatures
import NaasehPersistence
import NaasehSync
import Testing

@Suite("Native synchronized task stack")
struct NativeTaskStackTests {
    @Test("moves retain membership identity and create adjacent server anchors")
    func anchors() throws {
        let tasks = try ["First", "Second", "Third"].map { try TaskRecord.create(id: NativeULID.make(), label: $0, ownerID: "owner") }
        let stack = NativeTaskStack(ownerID: "owner", projectID: nil, version: 4, references: tasks.map(NativeStackReference.init(task:)))
        let result = try stack.moving(taskID: tasks[2].id, to: 1)
        #expect(result.stack.references.map(\.workId) == [tasks[0].id, tasks[2].id, tasks[1].id])
        #expect(result.stack.version == 5)
        let data = try JSONEncoder().encode(result.payload)
        let body = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(body["scope"] as? String == "overall" && body["baseVersion"] as? Int == 4)
        let move = try #require(body["move"] as? [String: Any])
        #expect((move["beforeWork"] as? [String: Any])?["workId"] as? String == tasks[0].id)
        #expect((move["afterWork"] as? [String: Any])?["workId"] as? String == tasks[1].id)
    }
    @Test("filtered moves leave hidden tasks in their original slots")
    func filteredSlots() throws {
        let tasks = try ["Visible one", "Hidden", "Visible two"].map {
            try TaskRecord.create(id: NativeULID.make(), label: $0, ownerID: "owner")
        }
        let stack = NativeTaskStack(ownerID: "owner", projectID: nil, version: 7,
                                    references: tasks.map(NativeStackReference.init(task:)))
        let result = try stack.moving(taskID: tasks[2].id, to: 0, affectedTaskIDs: [tasks[0].id, tasks[2].id])
        #expect(result.stack.references.map(\.workId) == [tasks[2].id, tasks[1].id, tasks[0].id])
        let body = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(result.payload)) as? [String: Any])
        let move = try #require(body["move"] as? [String: Any])
        #expect(move["kind"] as? String == "filtered_permutation")
        #expect((move["affectedWork"] as? [Any])?.count == 2)
        #expect((move["filterBasis"] as? [String: Any])?["contentType"] as? String == "todos")
    }

    @Test("offline rank changes persist and refresh cannot replace pending work")
    func durableMove() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = PersistenceController()
        try await persistence.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let sync = SecureNativeSyncStore(controller: persistence)
        await sync.activate(accountID: "owner", rootKey: Data(repeating: 7, count: 32))
        let tasks = try ["First", "Second"].map { try TaskRecord.create(id: NativeULID.make(), label: $0, ownerID: "owner") }
        let original = NativeTaskStack(ownerID: "owner", projectID: nil, version: 3, references: tasks.map(NativeStackReference.init(task:)))
        try await sync.cache(original, kind: .stack, recordID: original.id, version: 3)
        let storage = SyncedTaskWorkspaceStore(syncStore: sync, actorID: { "owner" })
        let moved = try await storage.moveTask(tasks[1].id, to: 0, projectID: nil)
        #expect(moved.references.first?.workId == tasks[1].id)
        try await sync.cache(original, kind: .stack, recordID: original.id, version: 3)
        #expect(try await storage.stack(projectID: nil)?.references.first?.workId == tasks[1].id)
        let queued = try await sync.queuedOperations(readyAt: .distantFuture, limit: 10)
        #expect(queued.count == 1 && queued[0].operation == "reorder" && queued[0].baseVersion == 3)
        #expect(queued[0].targetID == "owner:overall")
    }
}
