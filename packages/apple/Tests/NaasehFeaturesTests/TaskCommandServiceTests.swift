import Foundation
import NaasehFeatures
import Testing

@Suite("Task commands")
struct TaskCommandServiceTests {
    @Test("create and edit commit a task, immutable revision, and outbox atomically")
    func createAndEdit() async throws {
        let store = InMemoryTaskCommandStore()
        let service = TaskCommandService(store: store, actorID: "owner")
        let created = try await service.create(
            TaskCreateCommand(mutationID: "m-create", label: "First", urgency: .medium)
        )
        let edited = try await service.edit(
            TaskEditCommand(mutationID: "m-edit", taskID: created.id, label: "Second")
        )
        #expect(edited.label == "Second")
        #expect(await store.revisions.count == 1)
        #expect(await store.operations.map(\.mutationID) == ["m-create", "m-edit"])
    }

    @Test("completion is idempotent and undo, restore, archive, and conflicts are explicit")
    func lifecycleAndConflict() async throws {
        let store = InMemoryTaskCommandStore()
        let service = TaskCommandService(store: store, actorID: "owner")
        let task = try await service.create(.init(mutationID: "create", label: "Do it"))
        let first = try await service.complete(taskID: task.id, mutationID: "complete")
        let duplicate = try await service.complete(taskID: task.id, mutationID: "complete")
        #expect(first.completion.id == duplicate.completion.id)
        let restored = try await service.undoCompletion(taskID: task.id, mutationID: "undo")
        #expect(restored.lifecycle == .active)
        let archived = try await service.archive(taskID: task.id, mutationID: "archive")
        #expect(archived.archiveReason == .manual)
        #expect(try await service.restore(taskID: task.id, mutationID: "restore").lifecycle == .active)

        await store.forceVersion(taskID: task.id, version: 99)
        await #expect(throws: TaskCommandError.conflict(currentVersion: 99)) {
            try await service.edit(.init(mutationID: "stale", taskID: task.id, label: "Stale", baseVersion: 5))
        }
    }

    @Test("authorization and hierarchy cycles fail without partial writes")
    func authorizationAndCycle() async throws {
        let store = InMemoryTaskCommandStore()
        let owner = TaskCommandService(store: store, actorID: "owner")
        let parent = try await owner.create(.init(mutationID: "p", label: "Parent"))
        let child = try await owner.create(.init(mutationID: "c", label: "Child", parentID: parent.id))
        let outsider = TaskCommandService(store: store, actorID: "other")
        await #expect(throws: TaskCommandError.unauthorized) {
            try await outsider.edit(.init(mutationID: "x", taskID: child.id, label: "No"))
        }
        let before = await store.operations.count
        await #expect(throws: TaskValidationError.hierarchyCycle) {
            try await owner.edit(.init(mutationID: "cycle", taskID: parent.id, parentID: child.id))
        }
        #expect(await store.operations.count == before)
    }
}
