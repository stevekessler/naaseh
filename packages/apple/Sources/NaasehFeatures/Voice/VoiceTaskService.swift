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
    case disabled
    case signedOut
    case cancelled
    case invalidTitle
    case invalidDateOrTime
    case projectNotFound
    case ambiguousProject([String])
}

public actor VoiceTaskService {
    public typealias TaskCreator = @Sendable (TaskCreateCommand) async throws -> TaskRecord

    private var projects: AuthorizedProjectQuery
    private let createTask: TaskCreator
    private let access: @Sendable () async -> VoiceTaskAccess
    private let timeZone: TimeZone
    private var receipts: [String: VoiceTaskResult] = [:]

    public init(
        projects: AuthorizedProjectQuery,
        commands: TaskCommandService,
        access: @escaping @Sendable () async -> VoiceTaskAccess,
        timeZone: TimeZone = .current
    ) {
        self.projects = projects
        createTask = { try await commands.create($0) }
        self.access = access
        self.timeZone = timeZone
    }

    public init(
        projects: AuthorizedProjectQuery,
        createTask: @escaping TaskCreator,
        access: @escaping @Sendable () async -> VoiceTaskAccess,
        timeZone: TimeZone = .current
    ) {
        self.projects = projects
        self.createTask = createTask
        self.access = access
        self.timeZone = timeZone
    }

    public func create(_ request: VoiceTaskRequest) async throws -> VoiceTaskResult {
        if request.isCancelled { throw VoiceTaskError.cancelled }
        switch await access() {
        case .unlocked: break
        case .locked: throw VoiceTaskError.locked
        case .signedOut: throw VoiceTaskError.signedOut
        }
        if let receipt = receipts[request.invocationID] { return receipt }
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
        let task = try await createTask(.init(
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

    public func updateProjects(_ projects: AuthorizedProjectQuery) { self.projects = projects }
    public func purge() { receipts = [:]; projects = AuthorizedProjectQuery(projects: []) }

    private func dueValue(date: String?, time: String?) throws -> TaskDueValue? {
        guard date != nil || time != nil else { return nil }
        guard let date, let day = try? TaskDueValue.date(date) else { throw VoiceTaskError.invalidDateOrTime }
        guard let time else { return day }
        let dates = date.split(separator: "-").compactMap { Int($0) }
        let times = time.split(separator: ":").compactMap { Int($0) }
        guard dates.count == 3, times.count == 2, (0...23).contains(times[0]), (0...59).contains(times[1]) else { throw VoiceTaskError.invalidDateOrTime }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        let parts = DateComponents(timeZone: timeZone, year: dates[0], month: dates[1], day: dates[2], hour: times[0], minute: times[1])
        guard let instant = calendar.date(from: parts), calendar.component(.hour, from: instant) == times[0],
              calendar.component(.day, from: instant) == dates[2] else { throw VoiceTaskError.invalidDateOrTime }
        return try TaskDueValue.timed(instant, timeZoneIdentifier: timeZone.identifier)
    }
}
