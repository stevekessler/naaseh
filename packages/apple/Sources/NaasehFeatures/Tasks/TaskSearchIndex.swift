import Foundation

public struct TaskSearchQuery: Sendable {
    public let text: String
    public let urgencies: Set<TaskUrgency>
    public let projectID: String?
    public let categoryID: String?

    public init(
        text: String = "",
        urgencies: Set<TaskUrgency> = [],
        projectID: String? = nil,
        categoryID: String? = nil
    ) {
        self.text = text
        self.urgencies = urgencies
        self.projectID = projectID
        self.categoryID = categoryID
    }
}

public struct TaskSearchIndex: Sendable {
    private var authorized: [TaskRecord]
    private var normalizedText: [String: String]
    private var isLocked = false

    public init(records: [TaskRecord], actorID: String, groupIDs: Set<String>) {
        authorized = records.filter { $0.canRead(actorID: actorID, groupIDs: groupIDs) }
        normalizedText = Dictionary(uniqueKeysWithValues: authorized.map {
            ($0.id, "\($0.label) \($0.memo)".folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current))
        })
    }

    public func search(_ query: TaskSearchQuery) -> [TaskRecord] {
        guard !isLocked else { return [] }
        let needle = query.text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return authorized.filter { task in
            (needle.isEmpty || normalizedText[task.id]?.contains(needle) == true)
                && (query.urgencies.isEmpty || query.urgencies.contains(task.urgency))
                && (query.projectID == nil || task.projectID == query.projectID)
                && (query.categoryID == nil || task.categoryID == query.categoryID)
        }.sorted {
            $0.label.localizedStandardCompare($1.label) == .orderedAscending
        }
    }

    /// Only opaque identifiers and non-content state are eligible for persistence.
    public func persistedProjection() -> String {
        authorized.map { "\($0.id):\($0.version):\($0.lifecycle.rawValue)" }.joined(separator: "\n")
    }

    public mutating func lock() {
        isLocked = true
        authorized.removeAll(keepingCapacity: false)
        normalizedText.removeAll(keepingCapacity: false)
    }
}
