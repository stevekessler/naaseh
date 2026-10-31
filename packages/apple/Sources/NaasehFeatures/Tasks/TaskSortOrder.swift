import Foundation

public enum TaskSortOrder: String, CaseIterable, Sendable {
    case stack, updated, due, priority, category, project, title
    public var title: String {
        switch self {
        case .stack: "My stack"
        case .updated: "Recently updated"
        case .due: "Due date"
        case .priority: "Priority"
        case .category: "Category"
        case .project: "Project"
        case .title: "Title"
        }
    }
    public func precedes(_ left: TaskRecord, _ right: TaskRecord, references: TaskReferences) -> Bool {
        func name(_ id: String?, in options: [TaskReferenceOption]) -> String? {
            id.flatMap { id in options.first { $0.id == id }?.name }
        }
        func compare(_ a: String?, _ b: String?) -> ComparisonResult {
            if a == nil && b == nil { return .orderedSame }
            guard let a else { return .orderedDescending }
            guard let b else { return .orderedAscending }
            return a.localizedStandardCompare(b)
        }
        func dueKey(_ value: TaskDueValue?) -> String? {
            guard let value else { return nil }
            if let date = value.calendarDate { return date }
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return value.instant.map(formatter.string(from:))
        }
        let priority = TaskUrgency.allCases
        let result: ComparisonResult
        switch self {
        case .stack:
            result = left.createdAt == right.createdAt ? .orderedSame : (left.createdAt < right.createdAt ? .orderedAscending : .orderedDescending)
        case .updated:
            result = left.updatedAt == right.updatedAt ? .orderedSame : (left.updatedAt > right.updatedAt ? .orderedAscending : .orderedDescending)
        case .due:
            let order = compare(dueKey(left.due), dueKey(right.due))
            if order == .orderedSame, left.due != nil, right.due != nil {
                if let a = left.due?.instant, let b = right.due?.instant, a != b { return a < b }
                if (left.due?.instant != nil) != (right.due?.instant != nil) { return left.due?.instant != nil }
            }
            result = order
        case .priority:
            result = left.urgency == right.urgency ? .orderedSame :
                (priority.firstIndex(of: left.urgency)! > priority.firstIndex(of: right.urgency)! ? .orderedAscending : .orderedDescending)
        case .category: result = compare(name(left.categoryID, in: references.categories), name(right.categoryID, in: references.categories))
        case .project: result = compare(name(left.projectID, in: references.projects), name(right.projectID, in: references.projects))
        case .title: result = compare(left.label, right.label)
        }
        if result != .orderedSame { return result == .orderedAscending }
        if left.urgency != right.urgency { return priority.firstIndex(of: left.urgency)! > priority.firstIndex(of: right.urgency)! }
        let labelOrder = compare(left.label, right.label)
        return labelOrder == .orderedSame ? left.id < right.id : labelOrder == .orderedAscending
    }
}
