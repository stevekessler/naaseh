import Foundation

public enum JournalDashboardValue: Equatable, Sendable { case number(Double), noData }
public enum JournalDashboardTrend: String, Sendable { case up, down, unchanged, notComparable }
public struct JournalDashboardMetric: Equatable, Identifiable, Sendable {
    public var id: String { name }
    public let name: String
    public let value: JournalDashboardValue
    public let comparison: JournalDashboardValue
    public let trend: JournalDashboardTrend
    public let contributingEntryIDs: [String]
}

public struct JournalDashboardService: Sendable {
    public init() {}

    public func calculate(entries: [JournalEntry], start: String, end: String, profile: JournalProfile) throws -> [JournalDashboardMetric] {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = .gmt; formatter.dateFormat = "yyyy-MM-dd"
        guard let startDate = formatter.date(from: start), let endDate = formatter.date(from: end), startDate <= endDate else {
            throw JournalServiceError.invalidValue
        }
        let days = Calendar(identifier: .gregorian).dateComponents([.day], from: startDate, to: endDate).day! + 1
        let priorEnd = Calendar(identifier: .gregorian).date(byAdding: .day, value: -1, to: startDate)!
        let priorStart = Calendar(identifier: .gregorian).date(byAdding: .day, value: -(days - 1), to: priorEnd)!
        let current = entries.filter { $0.projection.date >= start && $0.projection.date <= end }
        let priorStartText = formatter.string(from: priorStart), priorEndText = formatter.string(from: priorEnd)
        let prior = entries.filter { $0.projection.date >= priorStartText && $0.projection.date <= priorEndText }
        var names = Set(current.flatMap { Array($0.projection.values.keys) + Array($0.projection.emotions.keys) })
        names.formUnion(["daysJournaled"])
        if profile.suicidalSelfHarmEnabled { names.formUnion(["suicidalThoughts", "selfHarmThoughts"]) }
        return names.sorted().map { name in metric(name, current: current, prior: prior) }
    }

    private func metric(_ name: String, current: [JournalEntry], prior: [JournalEntry]) -> JournalDashboardMetric {
        func aggregate(_ entries: [JournalEntry]) -> (JournalDashboardValue, [String]) {
            if name == "daysJournaled" {
                return (.number(Double(Set(entries.map(\.projection.date)).count)), entries.map(\.id))
            }
            let values = entries.compactMap { entry -> (Double, String)? in
                if let value = entry.projection.values[name] { return (value, entry.id) }
                if let value = entry.projection.emotions[name] { return (Double(value), entry.id) }
                if let value = entry.projection.flags[name] { return (value ? 1 : 0, entry.id) }
                return nil
            }
            guard !values.isEmpty else { return (.noData, []) }
            return (.number(values.reduce(0) { $0 + $1.0 } / Double(values.count)), values.map(\.1))
        }
        let a = aggregate(current), b = aggregate(prior)
        let trend: JournalDashboardTrend
        switch (a.0, b.0) {
        case let (.number(x), .number(y)): trend = x == y ? .unchanged : (x > y ? .up : .down)
        default: trend = .notComparable
        }
        return .init(name: name, value: a.0, comparison: b.0, trend: trend, contributingEntryIDs: a.1)
    }
}
