import Foundation
import NaasehFeatures
import NaasehPersistence
import NaasehSync
import Testing

@Suite("Current task editing parity")
struct TaskEditingParityTests {
    @Test("all editable details persist in encrypted storage and explicit clearing reaches the wire")
    func durableDetails() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let sync = SecureNativeSyncStore(controller: controller)
        await sync.activate(accountID: "owner", rootKey: Data(repeating: 7, count: 32))
        let storage = SyncedTaskWorkspaceStore(syncStore: sync, actorID: { "owner" })
        var details = TaskDetails()
        details.urgency = .critical
        details.due = try .date("2026-10-31")
        details.repeatInterval = 2
        details.repeatUnit = .week
        details.memo = "Remember this"
        details.memoDocument = TaskMemoDocument(text: details.memo)
        details.link = "https://example.com"
        details.visibility = .private
        details.postItColor = .purple
        details.projectID = NativeULID.make()
        details.parentID = NativeULID.make()
        let created = try await storage.create(.init(mutationID: NativeULID.make(), label: "Native parity", details: details))
        #expect(created.urgency == .critical)
        #expect(created.repeatUnit == .week)
        #expect(created.postItColor == .purple)
        #expect(created.memoDocument?.text == details.memo)
        details.parentID = nil
        details.due = nil
        details.repeatUnit = nil
        details.repeatInterval = nil
        details.projectID = nil
        details.postItColor = nil
        details.urgency = .low
        let edited = try await storage.edit(.init(mutationID: NativeULID.make(), taskID: created.id,
                                                baseVersion: 1, details: details))
        #expect(edited.parentID == nil && edited.due == nil && edited.projectID == nil)
        #expect(edited.urgency == .low)
        let queued = try await sync.queuedOperations(readyAt: .distantFuture, limit: 10)
        let body = try #require(JSONSerialization.jsonObject(with: queued[1].payload) as? [String: Any])
        let patch = try #require(body["patch"] as? [String: Any])
        for key in ["parentId", "dueKind", "dueDate", "repeatInterval", "repeatUnit", "projectId", "postItColor"] {
            #expect(patch[key] is NSNull)
        }
        #expect(patch["dueAt"] == nil && patch["dueTimeZone"] == nil)
        #expect(patch["urgency"] as? String == "low")
        #expect(patch["ownerId"] == nil && patch["version"] == nil)
        let persisted = try await storage.allTasks()
        let restored = try #require(persisted.first)
        #expect(restored.id == edited.id && restored.version == edited.version)
        #expect(restored.urgency == .low && restored.due == nil && restored.parentID == nil)
        #expect(restored.memoDocument == edited.memoDocument && restored.repeatUnit == nil)
        #expect(abs(restored.updatedAt.timeIntervalSince(edited.updatedAt)) < 0.001)
    }

    @Test("native and web schedules advance at month boundaries without creating a new task")
    func recurrence() throws {
        var task = try TaskRecord.create(label: "Monthly", ownerID: "owner", due: .date("2028-01-31"))
        task.repeatInterval = 1
        task.repeatUnit = .month
        let result = try task.completing(actorID: "owner")
        #expect(result.task.id == task.id)
        #expect(result.task.due?.calendarDate == "2028-02-29")
        #expect(result.task.lifecycle == .active && result.task.completionState == .open)
        #expect(result.task.percentComplete == 0 && result.task.completedAt == nil)
        #expect(result.completion.counted)
    }

    @Test("server memo documents, recurrence, and membership epoch survive decoding and editing")
    func wireRoundTrip() throws {
        let data = Data(#"{"id":"01J00000000000000000000000","ownerId":"owner","label":"Remote","memo":"Formatted","memoDocument":{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Formatted","marks":["bold"]}]}]},"repeatInterval":1,"repeatUnit":"day","dueKind":"date","dueDate":"2026-10-31","stackMembershipEpoch":"epoch","createdAt":"2026-10-18T17:00:00.000Z","updatedAt":"2026-10-18T17:01:00.000Z","version":2}"#.utf8)
        let task = try JSONDecoder().decode(TaskRecord.self, from: data)
        var draft = TaskDetails(task: task)
        draft.urgency = .high
        let edited = try draft.applying(to: task)
        let result = try JSONDecoder().decode(TaskRecord.self, from: JSONEncoder().encode(edited))
        #expect(result.memoDocument?.blocks[0].runs?[0].marks == ["bold"])
        #expect(result.repeatUnit == .day && result.stackMembershipEpoch == "epoch")
    }

    @Test("hidden memo ciphertext is preserved and never sent as a plaintext patch")
    func hiddenMemoPreservation() throws {
        let task = try TaskRecord.create(label: "Hidden", ownerID: "owner", memoHidden: true, encryptedMemo: "ciphertext")
        var draft = TaskDetails(task: task)
        draft.urgency = .critical
        let result = try draft.applying(to: task)
        #expect(result.encryptedMemo == "ciphertext" && result.memoHidden)
        let patch = try draft.patch(for: task)
        #expect(patch["memo"] == nil && patch["memoDocument"] == nil && patch["encryptedMemo"] == nil)
        draft.memo = "Do not leak"
        #expect(throws: TaskValidationError.hiddenMemoContainsPlaintext) { try draft.applying(to: task) }
    }

    @Test("invalid schedules and unsafe links are rejected before queueing")
    func invalidDetails() throws {
        let task = try TaskRecord.create(label: "Validate", ownerID: "owner")
        var draft = TaskDetails()
        draft.repeatInterval = 1
        draft.repeatUnit = .day
        #expect(throws: TaskValidationError.invalidRepeat) { try draft.applying(to: task) }
        draft.repeatInterval = nil
        draft.repeatUnit = nil
        draft.link = "javascript:alert(1)"
        #expect(throws: TaskValidationError.invalidLink) { try draft.applying(to: task) }
        draft.link = ""
        draft.percentComplete = 101
        #expect(throws: TaskValidationError.invalidProgress) { try draft.applying(to: task) }
    }

    @Test("explicit parent clearing works and descendant cycles are rejected")
    func hierarchy() async throws {
        let store = InMemoryTaskCommandStore()
        let service = TaskCommandService(store: store, actorID: "owner")
        let parent = try await service.create(.init(mutationID: "parent", label: "Parent"))
        let child = try await service.create(.init(mutationID: "child", label: "Child", parentID: parent.id))
        var draft = TaskDetails(task: parent)
        draft.parentID = child.id
        await #expect(throws: TaskValidationError.hierarchyCycle) {
            try await service.edit(.init(mutationID: "cycle", taskID: parent.id, details: draft))
        }
        draft = TaskDetails(task: child)
        draft.parentID = nil
        let result = try await service.edit(.init(mutationID: "clear", taskID: child.id, details: draft))
        #expect(result.parentID == nil)
    }

    @Test("priority edits save and a conflict retains the editor")
    @MainActor func workspaceSave() async throws {
        let store = InMemoryTaskCommandStore()
        let model = TaskWorkspaceModel(actorID: "owner", store: store)
        #expect(await model.save(label: "Task", urgency: .medium, parentID: nil))
        let task = try #require(model.tasks.first)
        model.beginEdit(task)
        #expect(await model.save(label: task.label, urgency: .critical, parentID: nil))
        #expect(model.tasks.first?.urgency == .critical)
        model.beginEdit(try #require(model.tasks.first))
        await store.forceVersion(taskID: task.id, version: 100)
        #expect(await !model.save(label: "Draft", urgency: .low, parentID: nil))
        #expect(model.showingEditor && model.conflict?.currentVersion == 100)
        model.clearProtectedContent()
        #expect(model.tasks.isEmpty && model.references.projects.isEmpty && !model.showingEditor)
    }

    @Test("sort uses local due dates, timed tasks first, and undated tasks last")
    func sorting() throws {
        let date = try TaskRecord.create(label: "Date", ownerID: "owner", due: .date("2026-10-30"))
        let none = try TaskRecord.create(label: "None", ownerID: "owner")
        let timed = try TaskRecord.create(label: "Time", ownerID: "owner",
            due: .timed(Calendar.current.startOfDay(for: Date()).addingTimeInterval(3600), timeZoneIdentifier: TimeZone.current.identifier))
        #expect(TaskSortOrder.due.precedes(date, none, references: TaskReferences()))
        #expect(!TaskSortOrder.due.precedes(none, timed, references: TaskReferences()))
    }
}
