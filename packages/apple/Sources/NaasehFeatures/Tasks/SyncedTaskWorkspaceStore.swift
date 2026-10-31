import Foundation
import NaasehContracts
import NaasehPersistence
import NaasehSync
import NaasehServices

public protocol TaskWorkspaceStorage: Sendable {
    func reviewOperations() async throws -> [DecryptedPendingOperation]
    func resolveTarget(kind: LocalRecordKind, id: String, remote: JSONValue, version: Int, retry: Bool, mutationIDs: [String]) async throws
    func cachedValues(_ kind: LocalRecordKind) async throws -> [JSONValue]
    func cache(_ value: JSONValue, kind: LocalRecordKind, id: String, version: Int, expectedAccountID: String?) async throws
    func syncCounts() async throws -> NativeOperationCounts
    func stack(projectID: String?) async throws -> NativeTaskStack?
    func moveTask(_ taskID: String, to index: Int, projectID: String?, affectedTaskIDs: [String], filterBasis: [String: JSONValue]) async throws -> NativeTaskStack
    func timer() async throws -> NativeAccountTaskTimer?
    func timerCommand(_ command: NativeTaskTimerCommand) async throws -> NativeAccountTaskTimer
    func references() async throws -> TaskReferences
    func allTasks() async throws -> [TaskRecord]
    func create(_ command: TaskCreateCommand) async throws -> TaskRecord
    func edit(_ command: TaskEditCommand) async throws -> TaskRecord
    func complete(taskID: String, mutationID: String) async throws -> (task: TaskRecord, completion: TaskCompletionRecord)
    func undoCompletion(taskID: String, mutationID: String) async throws -> TaskRecord
    func archive(taskID: String, mutationID: String) async throws -> TaskRecord
    func restore(taskID: String, mutationID: String) async throws -> TaskRecord
}

public extension TaskWorkspaceStorage {
    func reviewOperations() async throws -> [DecryptedPendingOperation] { [] }
    func resolveTarget(kind: LocalRecordKind, id: String, remote: JSONValue, version: Int, retry: Bool, mutationIDs: [String]) async throws {}
    func cachedValues(_ kind: LocalRecordKind) async throws -> [JSONValue] { [] }
    func cache(_ value: JSONValue, kind: LocalRecordKind, id: String, version: Int, expectedAccountID: String? = nil) async throws {}
    func syncCounts() async throws -> NativeOperationCounts { .init() }
    func stack(projectID: String?) async throws -> NativeTaskStack? { nil }
    func moveTask(_ taskID: String, to index: Int, projectID: String?, affectedTaskIDs: [String] = [], filterBasis: [String: JSONValue] = [:]) async throws -> NativeTaskStack { throw RankingError.itemMissing }
    func timer() async throws -> NativeAccountTaskTimer? { nil }
    func timerCommand(_ command: NativeTaskTimerCommand) async throws -> NativeAccountTaskTimer { throw TimerError.notRunning }
    func references() async throws -> TaskReferences { TaskReferences() }
}

public actor InMemoryTaskWorkspaceStorage: TaskWorkspaceStorage {
    private let store: InMemoryTaskCommandStore
    private let commands: TaskCommandService
    private let actorID: String
    private var stacks: [String: NativeTaskStack] = [:]
    private var currentTimer: NativeAccountTaskTimer?

    public init(actorID: String, store: InMemoryTaskCommandStore = .init()) {
        self.store = store
        self.actorID = actorID
        commands = TaskCommandService(store: store, actorID: actorID)
    }

    public func stack(projectID: String?) async -> NativeTaskStack? {
        if let existing = stacks[projectID ?? "overall"] { return existing }
        let tasks = await store.allTasks().filter { $0.lifecycle == .active && (projectID == nil || $0.projectID == projectID) }
        return NativeTaskStack(ownerID: actorID, projectID: projectID, version: 0,
                               references: tasks.sorted { $0.createdAt < $1.createdAt }.map(NativeStackReference.init(task:)))
    }
    public func moveTask(_ taskID: String, to index: Int, projectID: String?, affectedTaskIDs: [String] = [], filterBasis: [String: JSONValue] = [:]) async throws -> NativeTaskStack {
        guard let current = await stack(projectID: projectID) else { throw RankingError.itemMissing }
        let next = try current.moving(taskID: taskID, to: index, affectedTaskIDs: affectedTaskIDs, filterBasis: filterBasis).stack
        stacks[projectID ?? "overall"] = next
        return next
    }

    public func timer() -> NativeAccountTaskTimer? { currentTimer }
    public func timerCommand(_ command: NativeTaskTimerCommand) throws -> NativeAccountTaskTimer {
        let next = try NativeAccountTaskTimer.applying(command, to: currentTimer, ownerID: actorID, mutationID: NativeULID.make())
        currentTimer = next
        return next
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
    private let stackClient: NativeTaskStackClient?
    private let timerNow: @Sendable () async -> Date

    public init(syncStore: SecureNativeSyncStore, stackClient: NativeTaskStackClient? = nil, timerNow: @escaping @Sendable () async -> Date = { Date() }, actorID: @escaping ActorIDProvider) {
        self.syncStore = syncStore
        self.stackClient = stackClient
        self.timerNow = timerNow
        self.actorID = actorID
    }

    public func reviewOperations() async throws -> [DecryptedPendingOperation] { try await syncStore.reviewOperations() }
    public func resolveTarget(kind: LocalRecordKind, id: String, remote: JSONValue, version: Int, retry: Bool, mutationIDs: [String]) async throws {
        try await syncStore.resolveTarget(kind: kind, id: id, remote: remote, version: version, retry: retry, mutationIDs: mutationIDs)
    }

    public func cachedValues(_ kind: LocalRecordKind) async throws -> [JSONValue] {
        try await syncStore.values(JSONValue.self, kind: kind)
    }
    public func cache(_ value: JSONValue, kind: LocalRecordKind, id: String, version: Int, expectedAccountID: String? = nil) async throws {
        try await syncStore.cache(value, kind: kind, recordID: id, version: version, expectedAccountID: expectedAccountID)
    }

    public func allTasks() async throws -> [TaskRecord] {
        try await syncStore.values(TaskRecord.self, kind: .task)
    }

    public func syncCounts() async throws -> NativeOperationCounts { try await syncStore.operationCounts() }

    public func stack(projectID: String?) async throws -> NativeTaskStack? {
        let owner = try await actorID()
        let id = projectID ?? "\(owner):overall"
        func cached() async throws -> NativeTaskStack? {
            let values = try await syncStore.values(JSONValue.self, kind: .stack)
            for value in values {
                guard case let .object(fields) = value, fields["id"] == .string(id), fields["references"] != nil else { continue }
                return try JSONDecoder().decode(NativeTaskStack.self, from: JSONEncoder().encode(value))
            }
            return nil
        }
        if let stackClient {
            do {
                let value = try await stackClient.load(ownerID: owner, projectID: projectID)
                guard try await actorID() == owner else { throw TaskCommandError.unauthorized }
                try await syncStore.cache(value, kind: .stack, recordID: id, version: value.version, expectedAccountID: owner)
            } catch let error as AuthenticationError { throw error }
            catch {
                if let value = try await cached() { return value }
                return nil
            }
        }
        return try await cached()
    }

    public func moveTask(_ taskID: String, to index: Int, projectID: String?, affectedTaskIDs: [String] = [], filterBasis: [String: JSONValue] = [:]) async throws -> NativeTaskStack {
        guard let current = try await stack(projectID: projectID) else { throw RankingError.itemMissing }
        let result = try current.moving(taskID: taskID, to: index, affectedTaskIDs: affectedTaskIDs, filterBasis: filterBasis)
        try await syncStore.commit(result.stack, operationPayload: result.payload, kind: .stack,
                                   recordID: current.id, mutationID: NativeULID.make(), operationKind: "reorder", baseVersion: current.version)
        return result.stack
    }

    public func timer() async throws -> NativeAccountTaskTimer? {
        let owner = try await actorID()
        return try await syncStore.values(NativeAccountTaskTimer.self, kind: .timer).first { $0.ownerId == owner }
    }

    public func timerCommand(_ command: NativeTaskTimerCommand) async throws -> NativeAccountTaskTimer {
        let owner = try await actorID()
        let current = try await timer()
        if let taskID = command.taskId {
            guard try await allTasks().contains(where: { $0.id == taskID && $0.lifecycle == .active && $0.completionState == .open }) else {
                throw TaskCommandError.notFound
            }
        }
        let mutationID = NativeULID.make()
        let next = try NativeAccountTaskTimer.applying(command, to: current, ownerID: owner, mutationID: mutationID, now: await timerNow())
        try await syncStore.commit(next, operationPayload: command, kind: .timer, recordID: owner,
                                   mutationID: mutationID, operationKind: "timerCommand", baseVersion: current?.version ?? 0)
        return next
    }

    public func references() async throws -> TaskReferences {
        func options(_ kind: LocalRecordKind) async throws -> [TaskReferenceOption] {
            let values = try await syncStore.values(JSONValue.self, kind: kind)
            return values.compactMap { value in
                guard case let .object(record) = value,
                      case let .string(id) = record["id"],
                      case let .string(name) = record["name"],
                      record["active"] != .bool(false), record["archived"] != .bool(true), record["lifecycle"] != .string("archived") else { return nil }
                let categoryID: String? = if case let .string(value) = record["categoryId"] { value } else { nil }
                let defaultAssigneeID: String? = if case let .string(value) = record["defaultAssigneeId"] { value } else { nil }
                return TaskReferenceOption(id: id, name: name, categoryID: categoryID, defaultAssigneeID: defaultAssigneeID)
            }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        }
        var result = TaskReferences()
        result.projects = try await options(.project)
        result.categories = try await options(.category)
        let activeCategories = Set(result.categories.map(\.id))
        result.projects = result.projects.filter { $0.categoryID == nil || activeCategories.contains($0.categoryID!) }
        result.groups = try await options(.group)
        let owner = try await actorID()
        result.actorID = owner
        let groupRecords = try await syncStore.values(JSONValue.self, kind: .group)
        result.memberships = Set(groupRecords.compactMap {
            guard case let .object(fields) = $0, fields["joined"] == .bool(true), case let .string(id) = fields["id"] else { return nil }
            return id
        })
        // Account IDs already present on authorized tasks are safe offline assignment choices.
        result.assignees = Set(try await allTasks().compactMap(\.assigneeID) + [owner])
            .sorted().map { .init(id: $0, name: $0 == owner ? "Me" : $0) }
        let settings = try await syncStore.values(JSONValue.self, kind: .setting)
        for setting in settings {
            if case let .object(fields) = setting, fields["id"] == .string("task-people"), let people = fields["people"],
               let options = try? JSONDecoder().decode([TaskReferenceOption].self, from: JSONEncoder().encode(people)) {
                result.assignees = options
            }
        }
        return result
    }

    public func create(_ command: TaskCreateCommand) async throws -> TaskRecord {
        let ownerID = try await actorID()
        let mutationID = validMutationID(command.mutationID)
        if let existing = try await allTasks().first(where: { $0.id == mutationID }) { return existing }
        var task = try TaskRecord.create(
            id: mutationID,
            label: command.label,
            ownerID: ownerID,
            due: command.due,
            categoryID: command.categoryID,
            projectID: command.projectID,
            parentID: command.parentID,
            urgency: command.urgency
        )
        if let details = command.details { task = try details.applying(to: task) }
        try await validateParent(task)
        try await commit(
            task,
            payload: task,
            mutationID: mutationID,
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
        var next = try current.edit(
            label: command.label,
            parentID: command.parentID,
            actorID: try await actorID()
        )
        if let details = command.details { next = try details.applying(to: next) }
        if let package = command.protectedMemo { next = try next.protectingMemo(package) }
        try await validateParent(next)
        var patch = try command.details?.patch(for: current) ?? [:]
        if command.protectedMemo != nil {
            patch["memoHidden"] = .bool(true); patch["memo"] = .string("")
            patch["memoDocument"] = .null; patch["encryptedMemo"] = .string(next.encryptedMemo ?? "")
        }
        if let label = command.label, label.trimmingCharacters(in: .whitespacesAndNewlines) != current.label { patch["label"] = .string(label.trimmingCharacters(in: .whitespacesAndNewlines)) }
        if command.details == nil, let parentID = command.parentID { patch["parentId"] = .string(parentID) }
        guard !patch.isEmpty else { return current }
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

    private func validateParent(_ task: TaskRecord) async throws {
        let records = try await allTasks()
        let parents = Dictionary(uniqueKeysWithValues: records.compactMap { record in
            record.parentID.map { (record.id, $0) }
        })
        try TaskHierarchy.validateParent(taskID: task.id, proposedParentID: task.parentID, parentByTaskID: parents)
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
        candidate.count == 26 ? candidate : NativeULID.stable(candidate)
    }
}
