import Foundation

public enum VoiceTaskAccess: Sendable { case unlocked, locked, signedOut }

public struct VoiceTaskRequest: Codable, Equatable, Sendable {
    public let invocationID: String
    public let title: String
    public let projectTerm: String?
    public let dueDate: String?
    public let dueTime: String?
    public let isCancelled: Bool

    public init(
        invocationID: String,
        title: String,
        projectTerm: String? = nil,
        dueDate: String? = nil,
        dueTime: String? = nil,
        isCancelled: Bool = false
    ) {
        self.invocationID = invocationID; self.title = title; self.projectTerm = projectTerm
        self.dueDate = dueDate; self.dueTime = dueTime; self.isCancelled = isCancelled
    }
}

public struct VoiceTaskResult: Codable, Equatable, Sendable {
    public let taskID: String
    public let projectID: String?
    public let durable: Bool
    public let safeDialog: String
}

public enum VoiceTaskError: Error, Equatable, Sendable {
    case locked
    case signedOut
    case cancelled
    case invalidTitle
    case invalidDateOrTime
    case projectNotFound
    case ambiguousProject([String])
}

public actor VoiceTaskService {
    private let projects: AuthorizedProjectQuery
    private let commands: TaskCommandService
    private let access: @Sendable () async -> VoiceTaskAccess
    private let timeZone: TimeZone
    private var receipts: [String: VoiceTaskResult] = [:]

    public init(
        projects: AuthorizedProjectQuery,
        commands: TaskCommandService,
        access: @escaping @Sendable () async -> VoiceTaskAccess,
        timeZone: TimeZone = .current
    ) {
        self.projects = projects; self.commands = commands; self.access = access; self.timeZone = timeZone
    }

    public func create(_ request: VoiceTaskRequest) async throws -> VoiceTaskResult {
        if let receipt = receipts[request.invocationID] { return receipt }
        if request.isCancelled { throw VoiceTaskError.cancelled }
        switch await access() {
        case .unlocked: break
        case .locked: throw VoiceTaskError.locked
        case .signedOut: throw VoiceTaskError.signedOut
        }
        let title = request.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 300 else { throw VoiceTaskError.invalidTitle }

        let projectID: String?
        switch projects.resolve(request.projectTerm) {
        case .omitted: projectID = nil
        case let .resolved(project): projectID = project.id
        case let .ambiguous(matches): throw VoiceTaskError.ambiguousProject(matches.map(\.id))
        case .notFound: throw VoiceTaskError.projectNotFound
        }
        let due = try dueValue(date: request.dueDate, time: request.dueTime)
        let task = try await commands.create(.init(
            mutationID: "voice:\(request.invocationID)",
            label: title,
            projectID: projectID,
            due: due
        ))
        let result = VoiceTaskResult(
            taskID: task.id,
            projectID: projectID,
            durable: true,
            safeDialog: "Task added to Na’aseh."
        )
        receipts[request.invocationID] = result
        return result
    }

    public func currentAccess() async -> VoiceTaskAccess { await access() }

    private func dueValue(date: String?, time: String?) throws -> TaskDueValue? {
        guard date != nil || time != nil else { return nil }
        guard let date else { throw VoiceTaskError.invalidDateOrTime }
        if time == nil { return try? TaskDueValue.date(date) }
        guard let time,
              let day = Self.dayFormatter.date(from: date),
              let clock = Self.timeFormatter.date(from: time)
        else { throw VoiceTaskError.invalidDateOrTime }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let dayParts = calendar.dateComponents([.year, .month, .day], from: day)
        let timeParts = calendar.dateComponents([.hour, .minute], from: clock)
        var parts = dayParts
        parts.hour = timeParts.hour; parts.minute = timeParts.minute
        guard let instant = calendar.date(from: parts) else { throw VoiceTaskError.invalidDateOrTime }
        return try TaskDueValue.timed(instant, timeZoneIdentifier: timeZone.identifier)
    }

    private static let dayFormatter: DateFormatter = {
        let value = DateFormatter(); value.locale = Locale(identifier: "en_US_POSIX")
        value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "yyyy-MM-dd"; value.isLenient = false
        return value
    }()
    private static let timeFormatter: DateFormatter = {
        let value = DateFormatter(); value.locale = Locale(identifier: "en_US_POSIX")
        value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "HH:mm"; value.isLenient = false
        return value
    }()
}
