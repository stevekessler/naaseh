import Foundation
import NaasehContracts

public enum TaskRepeatUnit: String, Codable, CaseIterable, Sendable { case day, week, month }

/// The same constrained document format used by the web client. No HTML is executed.
public struct TaskMemoDocument: Codable, Equatable, Sendable {
    public struct Run: Codable, Equatable, Sendable {
        public var text: String
        public var marks: [String]
        public init(text: String, marks: [String] = []) { self.text = text; self.marks = marks }
    }
    public struct Item: Codable, Equatable, Sendable { public var runs: [Run] }
    public struct Block: Codable, Equatable, Sendable {
        public var type: String
        public var runs: [Run]?
        public var items: [Item]?
    }
    public var version: Int
    public var blocks: [Block]
    public init(text: String) {
        version = 1
        blocks = [.init(type: "paragraph", runs: [.init(text: text)], items: nil)]
    }
    public var text: String {
        blocks.flatMap { block -> [String] in
            if block.type == "paragraph" { return [(block.runs ?? []).map(\.text).joined()] }
            return (block.items ?? []).enumerated().map { index, item in
                "\(block.type == "orderedList" ? "\(index + 1)." : "•") \(item.runs.map(\.text).joined())"
            }
        }.joined(separator: "\n")
    }
    public func validate() throws {
        guard version == 1, blocks.count <= 2_000, text.utf16.count <= 50_000 else {
            throw TaskValidationError.invalidMemoDocument
        }
        for block in blocks {
            let runs: [Run]
            switch block.type {
            case "paragraph":
                guard let value = block.runs, block.items == nil, value.count <= 2_000 else {
                    throw TaskValidationError.invalidMemoDocument
                }
                runs = value
            case "orderedList", "unorderedList":
                guard let items = block.items, block.runs == nil, items.count <= 1_000,
                      items.allSatisfy({ $0.runs.count <= 2_000 }) else {
                    throw TaskValidationError.invalidMemoDocument
                }
                runs = items.flatMap(\.runs)
            default: throw TaskValidationError.invalidMemoDocument
            }
            guard runs.allSatisfy({ $0.text.utf16.count <= 50_000 && $0.marks.count <= 4
                && $0.marks.allSatisfy(["bold", "italic", "strikethrough", "code"].contains) }) else {
                throw TaskValidationError.invalidMemoDocument
            }
        }
    }
}

/// A complete editable snapshot, allowing optional fields to be explicitly cleared.
/// Hidden memo ciphertext stays on the record and is never placed in this draft.
public struct TaskDetails: Equatable, Sendable {
    public var memo = ""
    public var memoDocument: TaskMemoDocument?
    public var link = ""
    public var due: TaskDueValue?
    public var repeatInterval: Int?
    public var repeatUnit: TaskRepeatUnit?
    public var assigneeID: String?
    public var categoryID: String?
    public var projectID: String?
    public var groupID: String?
    public var parentID: String?
    public var visibility: TaskVisibility = .public
    public var urgency: TaskUrgency = .medium
    public var postItColor: TaskPostItColor?
    public var percentComplete = 0

    public init(task: TaskRecord? = nil) {
        guard let task else { return }
        memo = task.memoHidden ? "" : task.memo
        memoDocument = task.memoHidden ? nil : task.memoDocument
        link = task.link?.absoluteString ?? ""
        due = task.due
        repeatInterval = task.repeatInterval
        repeatUnit = task.repeatUnit
        assigneeID = task.assigneeID ?? task.ownerID
        categoryID = task.categoryID
        projectID = task.projectID
        groupID = task.groupID
        parentID = task.parentID
        visibility = task.visibility
        urgency = task.urgency
        postItColor = task.postItColor
        percentComplete = task.percentComplete
    }

    public func applying(to task: TaskRecord) throws -> TaskRecord {
        guard memo.utf16.count <= 50_000 else { throw TaskValidationError.memoTooLong }
        guard (0...100).contains(percentComplete) else { throw TaskValidationError.invalidProgress }
        if !link.isEmpty {
            guard let url = URL(string: link), ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
                  url.host != nil else { throw TaskValidationError.invalidLink }
        }
        guard (repeatInterval == nil) == (repeatUnit == nil),
              repeatInterval == nil || (due != nil && (1...999).contains(repeatInterval!)) else {
            throw TaskValidationError.invalidRepeat
        }
        if let memoDocument {
            try memoDocument.validate()
            guard memoDocument.text == memo else { throw TaskValidationError.invalidMemoDocument }
        }
        if task.memoHidden, !memo.isEmpty || memoDocument != nil {
            throw TaskValidationError.hiddenMemoContainsPlaintext
        }
        var next = task
        if !task.memoHidden { next.memo = memo; next.memoDocument = memoDocument }
        next.link = link.isEmpty ? nil : URL(string: link)
        next.due = due
        next.repeatInterval = repeatInterval
        next.repeatUnit = repeatUnit
        next.assigneeID = assigneeID?.isEmpty == false ? assigneeID : task.ownerID
        next.categoryID = categoryID
        next.projectID = projectID
        next.groupID = groupID
        next.parentID = parentID
        next.visibility = visibility
        next.urgency = urgency
        next.postItColor = postItColor
        next.percentComplete = percentComplete
        return next
    }

    /// Build only editable wire fields; clearing uses the server's explicit null contract.
    public func patch(for task: TaskRecord) throws -> [String: JSONValue] {
        let next = try applying(to: task)
        let object = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(next))
        guard case let .object(encoded) = object else { return [:] }
        let original = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(task))
        guard case let .object(before) = original else { return [:] }
        let keys = ["dueKind", "dueDate", "dueAt", "dueTimeZone", "repeatInterval", "repeatUnit",
                    "assigneeId", "categoryId", "projectId", "groupId", "parentId", "visibility",
                    "urgency", "postItColor", "percentComplete"]
        var patch: [String: JSONValue] = [:]
        for key in keys {
            let value = encoded[key] ?? .null
            if value != (before[key] ?? .null) { patch[key] = value }
        }
        if next.link != task.link { patch["link"] = .string(link) }
        if !task.memoHidden {
            if memo != task.memo { patch["memo"] = .string(memo) }
            if memoDocument != task.memoDocument || memo != task.memo {
                patch["memoDocument"] = try JSONDecoder().decode(JSONValue.self, from:
                    JSONEncoder().encode(memoDocument ?? TaskMemoDocument(text: memo)))
            }
        }
        return patch
    }
}

extension TaskDueValue {
    public func advanced(interval: Int, unit: TaskRepeatUnit) throws -> Self {
        guard (1...999).contains(interval) else { throw TaskValidationError.invalidRepeat }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let component: Calendar.Component = unit == .month ? .month : .day
        let amount = interval * (unit == .week ? 7 : 1)
        if kind == .date, let calendarDate {
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = calendar.timeZone
            formatter.dateFormat = "yyyy-MM-dd"
            guard let date = formatter.date(from: calendarDate),
                  let next = calendar.date(byAdding: component, value: amount, to: date) else {
                throw TaskValidationError.invalidDueValue
            }
            return try .date(formatter.string(from: next))
        }
        guard let instant, let timeZoneIdentifier,
              let next = calendar.date(byAdding: component, value: amount, to: instant) else {
            throw TaskValidationError.invalidDueValue
        }
        return try .timed(next, timeZoneIdentifier: timeZoneIdentifier)
    }
}

public struct TaskReferenceOption: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let categoryID: String?
    public let defaultAssigneeID: String?
    public init(id: String, name: String, categoryID: String? = nil, defaultAssigneeID: String? = nil) {
        self.id = id; self.name = name; self.categoryID = categoryID; self.defaultAssigneeID = defaultAssigneeID
    }
}

public struct TaskReferences: Sendable {
    public var actorID: String?
    public var memberships: Set<String> = []
    public var projects: [TaskReferenceOption] = []
    public var categories: [TaskReferenceOption] = []
    public var groups: [TaskReferenceOption] = []
    public var assignees: [TaskReferenceOption] = []
    public init() {}
}
