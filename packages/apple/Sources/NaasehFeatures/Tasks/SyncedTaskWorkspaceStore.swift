import Foundation
import NaasehContracts
import NaasehPersistence
import NaasehSync

public protocol TaskWorkspaceStorage: Sendable {
    func allTasks() async throws -> [TaskRecord]
    func create(_ command: TaskCreateCommand) async throws -> TaskRecord
    func edit(_ command: TaskEditCommand) async throws -> TaskRecord
    func complete(taskID: String, mutationID: String) async throws -> (task: TaskRecord, completion: TaskCompletionRecord)
    func undoCompletion(taskID: String, mutationID: String) async throws -> TaskRecord
    func archive(taskID: String, mutationID: String) async throws -> TaskRecord
    func restore(taskID: String, mutationID: String) async throws -> TaskRecord
}

public actor InMemoryTaskWorkspaceStorage: TaskWorkspaceStorage {
    private let store: InMemoryTaskCommandStore
    private let commands: TaskCommandService

    public init(actorID: String, store: InMemoryTaskCommandStore = .init()) {
        self.store = store
        commands = TaskCommandService(store: store, actorID: actorID)
    }

    public func allTasks() async -> [TaskRecord] { await store.allTasks() }
    public func create(_ command: TaskCreateCommand) async throws -> TaskRecord { try await commands.create(command) }
    public func edit(_ command: TaskEditCommand) async throws -> TaskRecord { try await commands.edit(command) }
    public func complete(taskID: String, mutationID: String) async throws -> (task: TaskRecord, completion: TaskCompletionRecord) {
        try await commands.complete(taskID: taskID, mutationID: mutationID)
    }
    public func undoCompletion(taskID: String, mutationID: String) async throws -> TaskRecord {
        try await commands.undoCompletion(taskID: taskID, mutationID: mutationID)
    }
    public func archive(taskID: String, mutationID: String) async throws -> TaskRecord {
        try await commands.archive(taskID: taskID, mutationID: mutationID)
    }
    public func restore(taskID: String, mutationID: String) async throws -> TaskRecord {
        try await commands.restore(taskID: taskID, mutationID: mutationID)
    }
}

public actor SyncedTaskWorkspaceStore: TaskWorkspaceStorage {
    public typealias ActorIDProvider = @Sendable () async throws -> String

    private let syncStore: SecureNativeSyncStore
    private let actorID: ActorIDProvider

    public init(syncStore: SecureNativeSyncStore, actorID: @escaping ActorIDProvider) {
        self.syncStore = syncStore
        self.actorID = actorID
    }

    public func allTasks() async throws -> [TaskRecord] {
        try await syncStore.values(TaskRecord.self, kind: .task)
    }

    public func create(_ command: TaskCreateCommand) async throws -> TaskRecord {
        let ownerID = try await actorID()
        let task = try TaskRecord.create(
            id: NativeULID.make(),
            label: command.label,
            ownerID: ownerID,
            due: command.due,
            categoryID: command.categoryID,
            projectID: command.projectID,
            parentID: command.parentID,
            urgency: command.urgency
        )
        try await commit(
            task,
            payload: task,
            mutationID: validMutationID(command.mutationID),
            operation: "create",
            baseVersion: 0
        )
        return task
    }

    public func edit(_ command: TaskEditCommand) async throws -> TaskRecord {
        let current = try await ownedTask(command.taskID)
        if let baseVersion = command.baseVersion, baseVersion != current.version {
            throw TaskCommandError.conflict(currentVersion: current.version)
        }
        let next = try current.edit(
            label: command.label,
            parentID: command.parentID,
            actorID: try await actorID()
        )
        var patch: [String: JSONValue] = [:]
        if let label = command.label { patch["label"] = .string(label.trimmingCharacters(in: .whitespacesAndNewlines)) }
        if let parentID = command.parentID { patch["parentId"] = .string(parentID) }
        try await commit(
            next,
            payload: JSONValue.object(["patch": .object(patch)]),
            mutationID: validMutationID(command.mutationID),
            operation: "update",
            baseVersion: current.version
        )
        return next
    }

    public func complete(
        taskID: String,
        mutationID: String
    ) async throws -> (task: TaskRecord, completion: TaskCompletionRecord) {
        let current = try await ownedTask(taskID)
        let result = try current.completing(
            actorID: try await actorID(),
            eventID: NativeULID.make()
        )
        let payload = JSONValue.object([
            "patch": .object(["status": .string("completed")]),
            "completionEvent": .object(["id": .string(result.completion.id)]),
        ])
        try await commit(
            result.task,
            payload: payload,
            mutationID: validMutationID(mutationID),
            operation: "complete",
            baseVersion: current.version
        )
        return result
    }

    public func undoCompletion(taskID: String, mutationID: String) async throws -> TaskRecord {
        try await transition(taskID: taskID, mutationID: mutationID, status: "open", operation: "reopen")
    }

    public func archive(taskID: String, mutationID: String) async throws -> TaskRecord {
        let current = try await ownedTask(taskID)
        guard current.lifecycle == .active else { throw TaskCommandError.invalidLifecycle }
        var next = current
        next.lifecycle = .archived
        next.archiveReason = .manual
        next.archivedAt = Date()
        next.archivedBy = try await actorID()
        next.updatedAt = Date()
        next.version += 1
        try await commit(
            next,
            payload: statusPayload("archived"),
            mutationID: validMutationID(mutationID),
            operation: "archive",
            baseVersion: current.version
        )
        return next
    }

    public func restore(taskID: String, mutationID: String) async throws -> TaskRecord {
        try await transition(taskID: taskID, mutationID: mutationID, status: "open", operation: "restore")
    }

    private func transition(
        taskID: String,
        mutationID: String,
        status: String,
        operation: String
    ) async throws -> TaskRecord {
        let current = try await ownedTask(taskID)
        guard current.lifecycle == .archived else { throw TaskCommandError.invalidLifecycle }
        var next = current
        next.lifecycle = .active
        next.completionState = .open
        next.archiveReason = nil
        next.archivedAt = nil
        next.archivedBy = nil
        next.completedAt = nil
        next.completedBy = nil
        next.currentCompletionEventID = nil
        next.percentComplete = 0
        next.updatedAt = Date()
        next.version += 1
        try await commit(
            next,
            payload: statusPayload(status),
            mutationID: validMutationID(mutationID),
            operation: operation,
            baseVersion: current.version
        )
        return next
    }

    private func ownedTask(_ id: String) async throws -> TaskRecord {
        guard let task = try await allTasks().first(where: { $0.id == id }) else {
            throw TaskCommandError.notFound
        }
        guard task.ownerID == (try await actorID()) else { throw TaskCommandError.unauthorized }
        return task
    }

    private func commit<Payload: Codable & Sendable>(
        _ task: TaskRecord,
        payload: Payload,
        mutationID: String,
        operation: String,
        baseVersion: Int
    ) async throws {
        try await syncStore.commit(
            task,
            operationPayload: payload,
            kind: .task,
            recordID: task.id,
            mutationID: mutationID,
            operationKind: operation,
            baseVersion: baseVersion
        )
    }

    private func statusPayload(_ status: String) -> JSONValue {
        .object(["patch": .object(["status": .string(status)])])
    }

    private func validMutationID(_ candidate: String) -> String {
        candidate.count == 26 ? candidate : NativeULID.make()
    }
}
