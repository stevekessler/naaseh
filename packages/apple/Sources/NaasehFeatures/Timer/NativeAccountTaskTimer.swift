import Foundation

/// Server taskTimer wire format, shared with the web timer (one record per account).
public struct NativeAccountTaskTimer: Codable, Equatable, Sendable {
    public var id: String
    public var ownerId: String
    public var taskId: String
    public var durationSeconds: Int
    public var repeatEnabled: Bool
    public var status: String
    public var runId: String
    public var intervalOrdinal: Int
    public var completedIntervalsAtAnchor: Int
    public var anchorAt: String?
    public var endsAt: String?
    public var pausedRemainingSeconds: Int?
    public var lastCompletedAt: String?
    public var version: Int
    public var lastMutationId: String?
    public var sourceClientId: String?
    public var updatedAt: String

    // Null anchors are required by the server contract, including when paused or stopped.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(id, forKey: .id); try c.encode(ownerId, forKey: .ownerId)
        try c.encode(taskId, forKey: .taskId); try c.encode(durationSeconds, forKey: .durationSeconds)
        try c.encode(repeatEnabled, forKey: .repeatEnabled); try c.encode(status, forKey: .status)
        try c.encode(runId, forKey: .runId); try c.encode(intervalOrdinal, forKey: .intervalOrdinal)
        try c.encode(completedIntervalsAtAnchor, forKey: .completedIntervalsAtAnchor)
        try c.encode(anchorAt, forKey: .anchorAt); try c.encode(endsAt, forKey: .endsAt)
        try c.encode(pausedRemainingSeconds, forKey: .pausedRemainingSeconds)
        try c.encode(lastCompletedAt, forKey: .lastCompletedAt)
        try c.encode(version, forKey: .version); try c.encode(updatedAt, forKey: .updatedAt)
        try c.encodeIfPresent(lastMutationId, forKey: .lastMutationId)
        try c.encodeIfPresent(sourceClientId, forKey: .sourceClientId)
    }
    private enum Keys: String, CodingKey {
        case id, ownerId, taskId, durationSeconds, repeatEnabled, status, runId, intervalOrdinal
        case completedIntervalsAtAnchor, anchorAt, endsAt, pausedRemainingSeconds, lastCompletedAt
        case version, lastMutationId, sourceClientId, updatedAt
    }
    public func effective(at now: Date) -> (timer: Self, remaining: Int) {
        if status == "paused" { return (self, pausedRemainingSeconds ?? 0) }
        guard status == "running", let end = Self.date(endsAt) else { return (self, 0) }
        if now < end { return (self, max(0, Int(ceil(end.timeIntervalSince(now))))) }
        var next = self
        guard repeatEnabled else {
            next.status = "finished"; next.anchorAt = nil; next.endsAt = nil
            next.pausedRemainingSeconds = nil; next.lastCompletedAt = endsAt
            return (next, 0)
        }
        let elapsed = now.timeIntervalSince(end)
        let completed = 1 + Int(elapsed / Double(durationSeconds))
        let remaining = durationSeconds - Int(elapsed.truncatingRemainder(dividingBy: Double(durationSeconds)))
        next.intervalOrdinal += completed
        next.completedIntervalsAtAnchor += completed
        next.lastCompletedAt = Self.instant(end.addingTimeInterval(Double(completed - 1) * Double(durationSeconds)))
        next.endsAt = Self.instant(now.addingTimeInterval(Double(remaining)))
        next.anchorAt = Self.instant(now.addingTimeInterval(Double(remaining - durationSeconds)))
        return (next, remaining)
    }
    public static func applying(_ command: NativeTaskTimerCommand, to current: Self?, ownerID: String,
                                mutationID: String, now: Date = Date()) throws -> Self {
        let duration = command.durationSeconds ?? current?.durationSeconds ?? 600
        guard (60...86_400).contains(duration), duration % 60 == 0 else { throw TimerError.invalidTransition }
        if current == nil {
            guard command.type == "start", let taskID = command.taskId else { throw TimerError.notRunning }
            return Self(id: ownerID, ownerId: ownerID, taskId: taskID, durationSeconds: duration,
                        repeatEnabled: false, status: "running", runId: NativeULID.make(), intervalOrdinal: 1,
                        completedIntervalsAtAnchor: 0, anchorAt: instant(now), endsAt: instant(now.addingTimeInterval(Double(duration))),
                        pausedRemainingSeconds: nil, lastCompletedAt: nil, version: 1, lastMutationId: mutationID,
                        updatedAt: instant(now))
        }
        guard let current, current.ownerId == ownerID, current.id == ownerID else { throw TaskCommandError.unauthorized }
        let projection = current.effective(at: now)
        var next = projection.timer
        next.version = current.version + 1; next.updatedAt = instant(now); next.lastMutationId = mutationID
        switch command.type {
        case "setRepeat":
            guard let enabled = command.enabled else { throw TimerError.invalidTransition }
            next.repeatEnabled = enabled
        case "stop": next.status = "stopped"; next.anchorAt = nil; next.endsAt = nil; next.pausedRemainingSeconds = nil
        case "pause":
            guard next.status == "running" else { throw TimerError.invalidTransition }
            next.status = "paused"; next.anchorAt = nil; next.endsAt = nil; next.pausedRemainingSeconds = projection.remaining
        case "resume":
            guard next.status == "paused" else { throw TimerError.invalidTransition }
            next.status = "running"; next.anchorAt = instant(now)
            next.endsAt = instant(now.addingTimeInterval(Double(projection.remaining))); next.pausedRemainingSeconds = nil
        case "switch", "restart", "changeDuration":
            if command.type == "switch" {
                guard let taskID = command.taskId else { throw TimerError.invalidTransition }
                next.taskId = taskID
            }
            next.durationSeconds = duration; next.status = "running"; next.runId = NativeULID.make()
            next.intervalOrdinal = 1; next.completedIntervalsAtAnchor = 0
            next.anchorAt = instant(now); next.endsAt = instant(now.addingTimeInterval(Double(duration)))
            next.pausedRemainingSeconds = nil; next.lastCompletedAt = nil
        default: throw TimerError.invalidTransition
        }
        return next
    }
    static func date(_ string: String?) -> Date? {
        guard let string else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }
    static func instant(_ date: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

public struct NativeTaskTimerCommand: Codable, Sendable {
    public let type: String
    public let taskId: String?
    public let durationSeconds: Int?
    public let enabled: Bool?
    public init(_ type: String, taskID: String? = nil, durationSeconds: Int? = nil, enabled: Bool? = nil) {
        self.type = type; taskId = taskID; self.durationSeconds = durationSeconds; self.enabled = enabled
    }
}
