import Foundation
import CryptoKit

public enum NativeTaskDatePreset: String, CaseIterable, Sendable { case today, tomorrow, week, nextWeek, nextNextWeek, month, quarter }
public struct NativeTaskFilters: Sendable {
    public var from = ""
    public var to = ""
    public var assigneeIDs: Set<String> = []
    public var groupIDs: Set<String> = []
    public var dates: Set<NativeTaskDatePreset> = []
    public var matchAny = false
    public var allReadable = false
    public var lifecycle = "active"
    public var progress = "all"
    public init() {}
    public static func day(_ date: Date) -> String {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
    public static func range(_ preset: NativeTaskDatePreset, now: Date = Date()) -> (String, String) {
        let cal = Calendar(identifier: .gregorian)
        var start = cal.startOfDay(for: now), end = start
        switch preset {
        case .today: break
        case .tomorrow: start = cal.date(byAdding: .day, value: 1, to: start)!; end = start
        case .week, .nextWeek, .nextNextWeek:
            let offset = preset == .week ? 0 : preset == .nextWeek ? 1 : 2
            start = cal.date(byAdding: .day, value: 1 - cal.component(.weekday, from: start) + offset * 7, to: start)!
            end = cal.date(byAdding: .day, value: 6, to: start)!
        case .month, .quarter:
            var components = cal.dateComponents([.year, .month], from: start)
            if preset == .quarter { components.month = ((components.month! - 1) / 3) * 3 + 1 }
            start = cal.date(from: components)!
            end = cal.date(byAdding: .day, value: -1, to: cal.date(byAdding: .month, value: preset == .month ? 1 : 3, to: start)!)!
        }
        return (day(start), day(end))
    }
    public func matches(_ task: TaskRecord, text: String, urgencies: Set<TaskUrgency>, project: String, category: String,
                        assignee: String, group: String, actorID: String?, memberships: Set<String>) -> Bool {
        let assignees = assigneeIDs.isEmpty ? Set(assignee.isEmpty ? [] : [assignee]) : assigneeIDs
        let groups = groupIDs.isEmpty ? Set(group.isEmpty ? [] : [group]) : groupIDs
        let expands = allReadable || assignees.contains(where: { $0 != actorID }) || !groups.isSubset(of: memberships)
        if !expands, let actorID, (task.assigneeID ?? task.ownerID) != actorID,
           task.groupID.map({ !memberships.contains($0) }) ?? true { return false }
        if lifecycle == "active", task.lifecycle != .active || task.completionState != .open { return false }
        if lifecycle == "archive", task.lifecycle != .archived { return false }
        if task.lifecycle == .deleting { return false }
        let due = task.due?.calendarDate ?? task.due?.instant.map(Self.day)
        var conditions: [Bool] = []
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            conditions.append(NativeTaskTextSearch.matches(text, in: "\(task.label) \(task.memoHidden ? "" : task.memo) \(task.link?.absoluteString ?? "")"))
        }
        if !urgencies.isEmpty { conditions.append(urgencies.contains(task.urgency)) }
        if !project.isEmpty { conditions.append(project == "unassigned" ? task.projectID == nil : task.projectID == project) }
        if !category.isEmpty { conditions.append(task.categoryID == category) }
        if !assignees.isEmpty { conditions.append(assignees.contains(task.assigneeID ?? task.ownerID)) }
        if !groups.isEmpty { conditions.append(task.groupID.map(groups.contains) ?? false) }
        if !from.isEmpty { conditions.append(due.map { $0 >= from } ?? false) }
        if !to.isEmpty { conditions.append(due.map { $0 <= to } ?? false) }
        if !dates.isEmpty { conditions.append(due.map { date in dates.contains { let range = Self.range($0); return date >= range.0 && date <= range.1 } } ?? false) }
        if progress != "all" { conditions.append(progress == "not-started" ? task.percentComplete == 0 : progress == "in-progress" ? (1..<100).contains(task.percentComplete) : task.percentComplete == 100) }
        return conditions.isEmpty || (matchAny ? conditions.contains(true) : conditions.allSatisfy { $0 })
    }
}

public enum NativeTaskTextSearch {
    public static func normalized(_ text: String) -> String { text.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    public static func basisHash(_ text: String) -> String? {
        let text = normalized(text); guard !text.isEmpty else { return nil }
        return SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    public static func matches(_ query: String, in text: String) -> Bool {
        let needle = normalized(query), haystack = normalized(text)
        if needle.isEmpty || haystack.contains(needle) { return true }
        let words = haystack.split { !$0.isLetter && !$0.isNumber }.map(String.init)
        return needle.split { !$0.isLetter && !$0.isNumber }.contains { term in
            let maxDistance = Int((Double(term.count) * 0.2).rounded())
            return words.contains { word in
                if word.hasPrefix(term) { return true }
                guard maxDistance > 0, abs(word.count - term.count) <= maxDistance else { return false }
                let a = Array(term), b = Array(word)
                var previous = Array(0...b.count)
                for i in a.indices {
                    var row = [i + 1]
                    for j in b.indices { row.append(min(row[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] == b[j] ? 0 : 1))) }
                    previous = row
                }
                return previous.last! <= maxDistance
            }
        }
    }
}
