import Foundation

public enum TaskUrgency: String, Codable, CaseIterable, Sendable { case low, medium, high, critical }
public enum TaskVisibility: String, Codable, Sendable { case `public`, `private` }
public enum TaskLifecycle: String, Codable, Sendable { case active, archived, deleting }
public enum TaskCompletionState: String, Codable, Sendable { case open, completed }
public enum TaskArchiveReason: String, Codable, Sendable { case completed, manual }
public enum TaskPostItColor: String, Codable, CaseIterable, Sendable {
    case yellow, pink, blue, green, purple, orange
}

public enum TaskValidationError: Error, Equatable, Sendable {
    case emptyLabel
    case labelTooLong
    case memoTooLong
    case invalidDueValue
    case hiddenMemoContainsPlaintext
    case unauthorized
    case hierarchyCycle
    case invalidLifecycle
}

public struct TaskDueValue: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case date, timed }
    public let kind: Kind
    public let calendarDate: String?
    public let instant: Date?
    public let timeZoneIdentifier: String?

    public static func date(_ value: String) throws -> Self {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let parsed = formatter.date(from: value), formatter.string(from: parsed) == value else {
            throw TaskValidationError.invalidDueValue
        }
        return .init(kind: .date, calendarDate: value, instant: nil, timeZoneIdentifier: nil)
    }

    public static func timed(_ value: Date, timeZoneIdentifier: String) throws -> Self {
        guard TimeZone(identifier: timeZoneIdentifier) != nil else {
            throw TaskValidationError.invalidDueValue
        }
        return .init(
            kind: .timed,
            calendarDate: nil,
            instant: value,
            timeZoneIdentifier: timeZoneIdentifier
        )
    }
}

public struct TaskRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let ownerID: String
    public var label: String
    public var link: URL?
    public var memo: String
    public var memoHidden: Bool
    public var encryptedMemo: String?
    public var due: TaskDueValue?
    public var assigneeID: String?
    public var categoryID: String?
    public var projectID: String?
    public var groupID: String?
    public var parentID: String?
    public var visibility: TaskVisibility
    public var urgency: TaskUrgency
    public var postItColor: TaskPostItColor?
    public var percentComplete: Int
    public var lifecycle: TaskLifecycle
    public var completionState: TaskCompletionState
    public var archiveReason: TaskArchiveReason?
    public var archivedAt: Date?
    public var archivedBy: String?
    public var completedAt: Date?
    public var completedBy: String?
    public var currentCompletionEventID: String?
    public let createdAt: Date
    public var updatedAt: Date
    public var version: Int

    public static func create(
        id: String = UUID().uuidString,
        label: String,
        ownerID: String,
        memo: String = "",
        memoHidden: Bool = false,
        encryptedMemo: String? = nil,
        due: TaskDueValue? = nil,
        assigneeID: String? = nil,
        categoryID: String? = nil,
        projectID: String? = nil,
        groupID: String? = nil,
        parentID: String? = nil,
        visibility: TaskVisibility = .public,
        urgency: TaskUrgency = .medium,
        postItColor: TaskPostItColor? = nil,
        now: Date = Date()
    ) throws -> Self {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw TaskValidationError.emptyLabel }
        guard trimmed.count <= 300 else { throw TaskValidationError.labelTooLong }
        guard memo.count <= 20_000 else { throw TaskValidationError.memoTooLong }
        guard !(memoHidden && !memo.isEmpty), memoHidden || encryptedMemo == nil else {
            throw TaskValidationError.hiddenMemoContainsPlaintext
        }
        return .init(
            id: id,
            ownerID: ownerID,
            label: trimmed,
            link: nil,
            memo: memo,
            memoHidden: memoHidden,
            encryptedMemo: encryptedMemo,
            due: due,
            assigneeID: assigneeID,
            categoryID: categoryID,
            projectID: projectID,
            groupID: groupID,
            parentID: parentID,
            visibility: visibility,
            urgency: urgency,
            postItColor: postItColor,
            percentComplete: 0,
            lifecycle: .active,
            completionState: .open,
            archiveReason: nil,
            archivedAt: nil,
            archivedBy: nil,
            completedAt: nil,
            completedBy: nil,
            currentCompletionEventID: nil,
            createdAt: now,
            updatedAt: now,
            version: 1
        )
    }

    public func canRead(actorID: String, groupIDs: Set<String>) -> Bool {
        if visibility == .private { return ownerID == actorID }
        guard let groupID else { return true }
        return ownerID == actorID || groupIDs.contains(groupID)
    }

    public func edit(
        label: String? = nil,
        parentID: String? = nil,
        actorID: String,
        now: Date = Date()
    ) throws -> Self {
        guard ownerID == actorID else { throw TaskValidationError.unauthorized }
        var copy = self
        if let label {
            let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { throw TaskValidationError.emptyLabel }
            guard trimmed.count <= 300 else { throw TaskValidationError.labelTooLong }
            copy.label = trimmed
        }
        if let parentID { copy.parentID = parentID }
        copy.updatedAt = now
        copy.version += 1
        return copy
    }

    public func completing(
        actorID: String,
        eventID: String = UUID().uuidString,
        now: Date = Date()
    ) throws -> (task: Self, completion: TaskCompletionRecord) {
        guard ownerID == actorID else { throw TaskValidationError.unauthorized }
        guard lifecycle == .active, completionState == .open else {
            throw TaskValidationError.invalidLifecycle
        }
        let completion = TaskCompletionRecord(
            id: eventID,
            taskID: id,
            completedBy: actorID,
            occurredAt: now,
            urgencyAtCompletion: urgency,
            projectIDAtCompletion: projectID,
            categoryIDAtCompletion: categoryID,
            counted: true,
            reversedAt: nil,
            reversedBy: nil,
            reversalMutationID: nil
        )
        var copy = self
        copy.percentComplete = 100
        copy.lifecycle = .archived
        copy.completionState = .completed
        copy.archiveReason = .completed
        copy.archivedAt = now
        copy.archivedBy = actorID
        copy.completedAt = now
        copy.completedBy = actorID
        copy.currentCompletionEventID = eventID
        copy.updatedAt = now
        copy.version += 1
        return (copy, completion)
    }
}

public struct TaskRevisionRecord: Codable, Equatable, Sendable {
    public let id: String
    public let taskID: String
    public let before: TaskRecord
    public let afterVersion: Int
    public let actorID: String
    public let createdAt: Date

    public init(previous: TaskRecord, replacement: TaskRecord, actorID: String) {
        id = UUID().uuidString
        taskID = previous.id
        before = previous
        afterVersion = replacement.version
        self.actorID = actorID
        createdAt = replacement.updatedAt
    }
}

public struct TaskCompletionRecord: Codable, Equatable, Sendable {
    public let id: String
    public let taskID: String
    public let completedBy: String
    public let occurredAt: Date
    public let urgencyAtCompletion: TaskUrgency
    public let projectIDAtCompletion: String?
    public let categoryIDAtCompletion: String?
    public var counted: Bool
    public var reversedAt: Date?
    public var reversedBy: String?
    public var reversalMutationID: String?
}

public enum TaskHierarchy {
    public static func validateParent(
        taskID: String,
        proposedParentID: String?,
        parentByTaskID: [String: String]
    ) throws {
        var cursor = proposedParentID
        var visited: Set<String> = [taskID]
        while let current = cursor {
            guard visited.insert(current).inserted else { throw TaskValidationError.hierarchyCycle }
            cursor = parentByTaskID[current]
        }
    }
}
