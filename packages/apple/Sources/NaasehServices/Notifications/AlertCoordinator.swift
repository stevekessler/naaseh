import Foundation

public struct NativeReminder: Codable, Equatable, Sendable {
    public let id: String
    public let taskID: String
    public let dueAt: Date
    public let occurrenceID: String
    public init(id: String, taskID: String, dueAt: Date, occurrenceID: String) {
        self.id = id; self.taskID = taskID; self.dueAt = dueAt; self.occurrenceID = occurrenceID
    }
}

public struct ScheduledNativeNotification: Equatable, Sendable {
    public let occurrenceID: String
    public let dueAt: Date
    public var title: String
    public var body: String
}

public protocol NativeNotificationScheduling: Sendable {
    func schedule(_ value: ScheduledNativeNotification) async throws
    func cancel(occurrenceID: String) async
    func makeGeneric() async
}

public enum AlertActionOutcome: Equatable, Sendable { case open(taskID: String), stale }

public actor AlertCoordinator {
    private let scheduler: any NativeNotificationScheduling
    private let authorizeTask: @Sendable (String) async -> Bool
    private var reminderByOccurrence: [String: NativeReminder] = [:]
    public private(set) var deliveredOccurrenceIDs: [String] = []

    public init(
        scheduler: any NativeNotificationScheduling,
        authorizeTask: @escaping @Sendable (String) async -> Bool = { _ in true }
    ) {
        self.scheduler = scheduler
        self.authorizeTask = authorizeTask
    }

    public func schedule(_ reminder: NativeReminder, privatePreview: String? = nil) async throws {
        reminderByOccurrence[reminder.occurrenceID] = reminder
        try await scheduler.schedule(.init(
            occurrenceID: reminder.occurrenceID,
            dueAt: reminder.dueAt,
            title: "Na’aseh reminder",
            body: privatePreview ?? "A task is due."
        ))
    }

    public func cancel(occurrenceID: String) async {
        reminderByOccurrence.removeValue(forKey: occurrenceID)
        await scheduler.cancel(occurrenceID: occurrenceID)
    }

    public func reconcileDelivered(occurrenceID: String) {
        guard reminderByOccurrence[occurrenceID] != nil,
              !deliveredOccurrenceIDs.contains(occurrenceID)
        else { return }
        deliveredOccurrenceIDs.append(occurrenceID)
    }

    public func handleAction(occurrenceID: String) async -> AlertActionOutcome {
        guard let reminder = reminderByOccurrence[occurrenceID],
              await authorizeTask(reminder.taskID)
        else { return .stale }
        return .open(taskID: reminder.taskID)
    }

    public func protectedDataDidBecomeUnavailable() async {
        await scheduler.makeGeneric()
    }
}

public actor MemoryNotificationScheduler: NativeNotificationScheduling {
    public private(set) var pending: [ScheduledNativeNotification] = []
    public init() {}
    public func schedule(_ value: ScheduledNativeNotification) { pending.removeAll { $0.occurrenceID == value.occurrenceID }; pending.append(value) }
    public func cancel(occurrenceID: String) { pending.removeAll { $0.occurrenceID == occurrenceID } }
    public func makeGeneric() {
        pending = pending.map { .init(occurrenceID: $0.occurrenceID, dueAt: $0.dueAt, title: "Na’aseh reminder", body: "A task is due.") }
    }
}
