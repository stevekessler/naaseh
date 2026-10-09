import Foundation

public struct TaskCreateCommand: Sendable {
    public let mutationID: String
    public let label: String
    public let urgency: TaskUrgency
    public let parentID: String?
    public let projectID: String?
    public let categoryID: String?
    public let due: TaskDueValue?

    public init(
        mutationID: String,
        label: String,
        urgency: TaskUrgency = .medium,
        parentID: String? = nil,
        projectID: String? = nil,
        categoryID: String? = nil,
        due: TaskDueValue? = nil
    ) {
        self.mutationID = mutationID
        self.label = label
        self.urgency = urgency
        self.parentID = parentID
        self.projectID = projectID
        self.categoryID = categoryID
        self.due = due
    }
}

public struct TaskEditCommand: Sendable {
    public let mutationID: String
    public let taskID: String
    public let label: String?
    public let parentID: String?
    public let baseVersion: Int?

    public init(
        mutationID: String,
        taskID: String,
        label: String? = nil,
        parentID: String? = nil,
        baseVersion: Int? = nil
    ) {
        self.mutationID = mutationID
        self.taskID = taskID
        self.label = label
        self.parentID = parentID
        self.baseVersion = baseVersion
    }
}

public struct TaskMutationOperation: Equatable, Sendable {
    public let mutationID: String
    public let operation: String
    public let taskID: String
    public let baseVersion: Int?
}

public enum TaskCommandError: Error, Equatable, Sendable {
    case notFound
    case unauthorized
    case conflict(currentVersion: Int)
    case invalidLifecycle
}

public actor InMemoryTaskCommandStore {
    public private(set) var tasks: [String: TaskRecord] = [:]
    public private(set) var revisions: [TaskRevisionRecord] = []
    public private(set) var completions: [String: TaskCompletionRecord] = [:]
    public private(set) var operations: [TaskMutationOperation] = []
    private var taskByMutation: [String: TaskRecord] = [:]
    private var completionByMutation: [String: (TaskRecord, TaskCompletionRecord)] = [:]

    public init() {}

    public func task(id: String) -> TaskRecord? { tasks[id] }
    public func allTasks() -> [TaskRecord] { Array(tasks.values) }
    public func completion(id: String?) -> TaskCompletionRecord? { id.flatMap { completions[$0] } }
    public func duplicateCompletion(mutationID: String) -> (TaskRecord, TaskCompletionRecord)? {
        completionByMutation[mutationID]
    }
    public func duplicateTaskMutation(mutationID: String) -> TaskRecord? { taskByMutation[mutationID] }

    public func commitCreate(_ task: TaskRecord, mutationID: String) {
        tasks[task.id] = task
        taskByMutation[mutationID] = task
        operations.append(.init(mutationID: mutationID, operation: "create", taskID: task.id, baseVersion: nil))
    }

    public func commitEdit(previous: TaskRecord, replacement: TaskRecord, actorID: String, mutationID: String) {
        tasks[replacement.id] = replacement
        taskByMutation[mutationID] = replacement
        revisions.append(.init(previous: previous, replacement: replacement, actorID: actorID))
        operations.append(.init(mutationID: mutationID, operation: "update", taskID: replacement.id, baseVersion: previous.version))
    }

    public func commitCompletion(
        previous: TaskRecord,
        result: (TaskRecord, TaskCompletionRecord),
        actorID: String,
        mutationID: String
    ) {
        tasks[result.0.id] = result.0
        taskByMutation[mutationID] = result.0
        completions[result.1.id] = result.1
        completionByMutation[mutationID] = result
        revisions.append(.init(previous: previous, replacement: result.0, actorID: actorID))
        operations.append(.init(mutationID: mutationID, operation: "complete", taskID: result.0.id, baseVersion: previous.version))
    }

    public func commitLifecycle(
        previous: TaskRecord,
        replacement: TaskRecord,
        completion: TaskCompletionRecord? = nil,
        actorID: String,
        mutationID: String,
        operation: String
    ) {
        tasks[replacement.id] = replacement
        taskByMutation[mutationID] = replacement
        if let completion { completions[completion.id] = completion }
        revisions.append(.init(previous: previous, replacement: replacement, actorID: actorID))
        operations.append(.init(mutationID: mutationID, operation: operation, taskID: replacement.id, baseVersion: previous.version))
    }

    public func forceVersion(taskID: String, version: Int) {
        guard var task = tasks[taskID] else { return }
        task.version = version
        tasks[taskID] = task
    }
}

public actor TaskCommandService {
    private let store: InMemoryTaskCommandStore
    private let actorID: String
    private let now: @Sendable () -> Date

    public init(store: InMemoryTaskCommandStore, actorID: String, now: @escaping @Sendable () -> Date = Date.init) {
        self.store = store
        self.actorID = actorID
        self.now = now
    }

    public func create(_ command: TaskCreateCommand) async throws -> TaskRecord {
        if let duplicate = await store.duplicateTaskMutation(mutationID: command.mutationID) { return duplicate }
        let parents = await parentMap()
        try TaskHierarchy.validateParent(taskID: command.mutationID, proposedParentID: command.parentID, parentByTaskID: parents)
        let task = try TaskRecord.create(
            label: command.label,
            ownerID: actorID,
            due: command.due,
            categoryID: command.categoryID,
            projectID: command.projectID,
            parentID: command.parentID,
            urgency: command.urgency,
            now: now()
        )
        await store.commitCreate(task, mutationID: command.mutationID)
        return task
    }

    public func edit(_ command: TaskEditCommand) async throws -> TaskRecord {
        if let duplicate = await store.duplicateTaskMutation(mutationID: command.mutationID) { return duplicate }
        let task = try await requireOwnedTask(command.taskID)
        if let baseVersion = command.baseVersion, baseVersion != task.version {
            throw TaskCommandError.conflict(currentVersion: task.version)
        }
        var parents = await parentMap()
        parents[task.id] = command.parentID ?? task.parentID
        try TaskHierarchy.validateParent(
            taskID: task.id,
            proposedParentID: command.parentID ?? task.parentID,
            parentByTaskID: parents
        )
        let replacement = try task.edit(
            label: command.label,
            parentID: command.parentID,
            actorID: actorID,
            now: now()
        )
        await store.commitEdit(previous: task, replacement: replacement, actorID: actorID, mutationID: command.mutationID)
        return replacement
    }

    public func complete(taskID: String, mutationID: String) async throws -> (task: TaskRecord, completion: TaskCompletionRecord) {
        if let duplicate = await store.duplicateCompletion(mutationID: mutationID) {
            return duplicate
        }
        let task = try await requireOwnedTask(taskID)
        let result = try task.completing(actorID: actorID, eventID: UUID().uuidString, now: now())
        await store.commitCompletion(previous: task, result: result, actorID: actorID, mutationID: mutationID)
        return result
    }

    public func undoCompletion(taskID: String, mutationID: String) async throws -> TaskRecord {
        if let duplicate = await store.duplicateTaskMutation(mutationID: mutationID) { return duplicate }
        let task = try await requireOwnedTask(taskID)
        guard task.lifecycle == .archived, task.completionState == .completed else {
            throw TaskCommandError.invalidLifecycle
        }
        var completion = await store.completion(id: task.currentCompletionEventID)
        completion?.counted = false
        completion?.reversedAt = now()
        completion?.reversedBy = actorID
        completion?.reversalMutationID = mutationID
        let replacement = restored(task, now: now())
        await store.commitLifecycle(previous: task, replacement: replacement, completion: completion, actorID: actorID, mutationID: mutationID, operation: "undo")
        return replacement
    }

    public func archive(taskID: String, mutationID: String) async throws -> TaskRecord {
        if let duplicate = await store.duplicateTaskMutation(mutationID: mutationID) { return duplicate }
        let task = try await requireOwnedTask(taskID)
        guard task.lifecycle == .active else { throw TaskCommandError.invalidLifecycle }
        var replacement = task
        replacement.lifecycle = .archived
        replacement.archiveReason = .manual
        replacement.archivedAt = now()
        replacement.archivedBy = actorID
        replacement.updatedAt = now()
        replacement.version += 1
        await store.commitLifecycle(previous: task, replacement: replacement, actorID: actorID, mutationID: mutationID, operation: "archive")
        return replacement
    }

    public func restore(taskID: String, mutationID: String) async throws -> TaskRecord {
        if let duplicate = await store.duplicateTaskMutation(mutationID: mutationID) { return duplicate }
        let task = try await requireOwnedTask(taskID)
        guard task.lifecycle == .archived else { throw TaskCommandError.invalidLifecycle }
        let replacement = restored(task, now: now())
        await store.commitLifecycle(previous: task, replacement: replacement, actorID: actorID, mutationID: mutationID, operation: "restore")
        return replacement
    }

    private func requireOwnedTask(_ id: String) async throws -> TaskRecord {
        guard let task = await store.task(id: id) else { throw TaskCommandError.notFound }
        guard task.ownerID == actorID else { throw TaskCommandError.unauthorized }
        return task
    }

    private func parentMap() async -> [String: String] {
        Dictionary(uniqueKeysWithValues: await store.allTasks().compactMap { task in
            task.parentID.map { (task.id, $0) }
        })
    }

    private func restored(_ task: TaskRecord, now: Date) -> TaskRecord {
        var replacement = task
        replacement.lifecycle = .active
        replacement.completionState = .open
        replacement.archiveReason = nil
        replacement.archivedAt = nil
        replacement.archivedBy = nil
        replacement.completedAt = nil
        replacement.completedBy = nil
        replacement.currentCompletionEventID = nil
        replacement.percentComplete = 0
        replacement.updatedAt = now
        replacement.version += 1
        return replacement
    }
}
