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

extension TaskRecord {
    private enum CodingKeys: String, CodingKey {
        case id, label, link, memo, memoHidden, encryptedMemo, createdAt, updatedAt
        case dueAt, dueKind, dueDate, dueTimeZone
        case visibility, urgency, postItColor, percentComplete, status, lifecycle
        case archiveReason, archivedAt, archivedBy, completedAt, completedBy, version
        case ownerID = "ownerId"
        case assigneeID = "assigneeId"
        case categoryID = "categoryId"
        case projectID = "projectId"
        case groupID = "groupId"
        case parentID = "parentId"
        case completionState
        case currentCompletionEventID = "currentCompletionEventId"
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        ownerID = try values.decode(String.self, forKey: .ownerID)
        label = try values.decode(String.self, forKey: .label)
        link = try values.decodeIfPresent(URL.self, forKey: .link)
        memo = try values.decodeIfPresent(String.self, forKey: .memo) ?? ""
        memoHidden = try values.decodeIfPresent(Bool.self, forKey: .memoHidden) ?? false
        encryptedMemo = try values.decodeIfPresent(String.self, forKey: .encryptedMemo)
        assigneeID = try values.decodeIfPresent(String.self, forKey: .assigneeID) ?? ownerID
        categoryID = try values.decodeIfPresent(String.self, forKey: .categoryID)
        projectID = try values.decodeIfPresent(String.self, forKey: .projectID)
        groupID = try values.decodeIfPresent(String.self, forKey: .groupID)
        parentID = try values.decodeIfPresent(String.self, forKey: .parentID)
        visibility = try values.decodeIfPresent(TaskVisibility.self, forKey: .visibility) ?? .public
        urgency = try values.decodeIfPresent(TaskUrgency.self, forKey: .urgency) ?? .medium
        postItColor = try values.decodeIfPresent(TaskPostItColor.self, forKey: .postItColor)
        percentComplete = try values.decodeIfPresent(Int.self, forKey: .percentComplete) ?? 0
        archiveReason = try values.decodeIfPresent(TaskArchiveReason.self, forKey: .archiveReason)
        archivedAt = try Self.decodeDate(values, forKey: .archivedAt)
        archivedBy = try values.decodeIfPresent(String.self, forKey: .archivedBy)
        completedAt = try Self.decodeDate(values, forKey: .completedAt)
        completedBy = try values.decodeIfPresent(String.self, forKey: .completedBy)
        currentCompletionEventID = try values.decodeIfPresent(String.self, forKey: .currentCompletionEventID)
        createdAt = try Self.requiredDate(values, forKey: .createdAt)
        updatedAt = try Self.requiredDate(values, forKey: .updatedAt)
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1

        let status = try values.decodeIfPresent(String.self, forKey: .status) ?? "open"
        lifecycle = try values.decodeIfPresent(TaskLifecycle.self, forKey: .lifecycle)
            ?? (status == "archived" || status == "completed" ? .archived : .active)
        completionState = try values.decodeIfPresent(TaskCompletionState.self, forKey: .completionState)
            ?? (status == "completed" ? .completed : .open)

        switch try values.decodeIfPresent(TaskDueValue.Kind.self, forKey: .dueKind) {
        case .date:
            if let date = try values.decodeIfPresent(String.self, forKey: .dueDate) {
                due = try TaskDueValue.date(date)
            } else { due = nil }
        case .timed:
            if let instant = try Self.decodeDate(values, forKey: .dueAt),
               let zone = try values.decodeIfPresent(String.self, forKey: .dueTimeZone)
            {
                due = try TaskDueValue.timed(instant, timeZoneIdentifier: zone)
            } else { due = nil }
        case nil:
            due = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(ownerID, forKey: .ownerID)
        try values.encode(label, forKey: .label)
        try values.encodeIfPresent(link, forKey: .link)
        try values.encode(memo, forKey: .memo)
        try values.encode(memoHidden, forKey: .memoHidden)
        try values.encodeIfPresent(encryptedMemo, forKey: .encryptedMemo)
        try values.encode(Self.dateString(createdAt), forKey: .createdAt)
        try values.encode(Self.dateString(updatedAt), forKey: .updatedAt)
        try values.encode(assigneeID ?? ownerID, forKey: .assigneeID)
        try values.encodeIfPresent(categoryID, forKey: .categoryID)
        try values.encodeIfPresent(projectID, forKey: .projectID)
        try values.encodeIfPresent(groupID, forKey: .groupID)
        try values.encodeIfPresent(parentID, forKey: .parentID)
        try values.encode(visibility, forKey: .visibility)
        try values.encode(urgency, forKey: .urgency)
        try values.encodeIfPresent(postItColor, forKey: .postItColor)
        try values.encode(percentComplete, forKey: .percentComplete)
        try values.encode(statusValue, forKey: .status)
        try values.encode(lifecycle, forKey: .lifecycle)
        try values.encode(completionState, forKey: .completionState)
        try values.encodeIfPresent(archiveReason, forKey: .archiveReason)
        try values.encodeIfPresent(archivedAt.map(Self.dateString), forKey: .archivedAt)
        try values.encodeIfPresent(archivedBy, forKey: .archivedBy)
        try values.encodeIfPresent(completedAt.map(Self.dateString), forKey: .completedAt)
        try values.encodeIfPresent(completedBy, forKey: .completedBy)
        try values.encodeIfPresent(currentCompletionEventID, forKey: .currentCompletionEventID)
        try values.encode(version, forKey: .version)
        if let due {
            try values.encode(due.kind, forKey: .dueKind)
            try values.encodeIfPresent(due.calendarDate, forKey: .dueDate)
            try values.encodeIfPresent(due.instant.map(Self.dateString), forKey: .dueAt)
            try values.encodeIfPresent(due.timeZoneIdentifier, forKey: .dueTimeZone)
        }
    }

    private var statusValue: String {
        if completionState == .completed { return "completed" }
        return lifecycle == .archived ? "archived" : "open"
    }

    private static func requiredDate(
        _ values: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> Date {
        guard let date = try decodeDate(values, forKey: key) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: values, debugDescription: "Invalid date")
        }
        return date
    }

    private static func decodeDate(
        _ values: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> Date? {
        guard let value = try values.decodeIfPresent(String.self, forKey: key) else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private static func dateString(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: value)
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
