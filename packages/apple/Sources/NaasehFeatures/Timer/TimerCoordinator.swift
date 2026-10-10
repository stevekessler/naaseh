import Foundation

public enum TaskTimerPhase: String, Codable, Sendable { case work, rest }
public enum TaskTimerRunState: String, Codable, Sendable { case running, paused }

public struct TaskTimerState: Codable, Equatable, Sendable {
    public let taskID: String
    public var phase: TaskTimerPhase
    public var runState: TaskTimerRunState
    public var anchor: Date
    public var pausedRemainingSeconds: Int?
    public let workSeconds: Int
    public let restSeconds: Int
    public var cycle: Int
    public var version: Int

    public static func start(
        taskID: String,
        at: Date,
        workSeconds: Int = 25 * 60,
        restSeconds: Int = 5 * 60
    ) -> Self {
        .init(taskID: taskID, phase: .work, runState: .running, anchor: at,
              pausedRemainingSeconds: nil, workSeconds: workSeconds, restSeconds: restSeconds,
              cycle: 1, version: 1)
    }

    public func remaining(at clientNow: Date, serverOffset: TimeInterval) -> Int {
        if let pausedRemainingSeconds { return pausedRemainingSeconds }
        let duration = phase == .work ? workSeconds : restSeconds
        let canonicalNow = clientNow.addingTimeInterval(serverOffset)
        return max(0, duration - Int(canonicalNow.timeIntervalSince(anchor)))
    }

    public func paused(at now: Date, serverOffset: TimeInterval = 0) throws -> Self {
        guard runState == .running else { throw TimerError.invalidTransition }
        var copy = self
        copy.pausedRemainingSeconds = remaining(at: now, serverOffset: serverOffset)
        copy.runState = .paused
        copy.version += 1
        return copy
    }
}

public enum TimerError: Error, Equatable, Sendable {
    case notRunning, invalidTransition, conflict(currentVersion: Int)
}

public actor InMemoryTimerStore {
    private var state: TaskTimerState?
    private var receipts: [String: TaskTimerState] = [:]
    public init() {}
    public func current() -> TaskTimerState? { state }
    public func receipt(_ mutationID: String) -> TaskTimerState? { receipts[mutationID] }
    public func commit(_ value: TaskTimerState, mutationID: String) { state = value; receipts[mutationID] = value }
    public func forceVersion(_ value: Int) { state?.version = value }
}

public actor TimerCoordinator {
    private let store: InMemoryTimerStore
    private let feedback: @Sendable (TaskTimerPhase) async -> Void
    public private(set) var serverOffset: TimeInterval = 0
    public init(
        store: InMemoryTimerStore,
        feedback: @escaping @Sendable (TaskTimerPhase) async -> Void = { _ in }
    ) {
        self.store = store
        self.feedback = feedback
    }

    public func updateServerTime(_ server: Date, receivedAt client: Date) { serverOffset = server.timeIntervalSince(client) }

    public func start(taskID: String, mutationID: String, now: Date = Date()) async throws -> TaskTimerState {
        if let duplicate = await store.receipt(mutationID) { return duplicate }
        let state = TaskTimerState.start(taskID: taskID, at: now.addingTimeInterval(serverOffset))
        await store.commit(state, mutationID: mutationID)
        return state
    }

    public func pause(mutationID: String, baseVersion: Int, now: Date = Date()) async throws -> TaskTimerState {
        if let duplicate = await store.receipt(mutationID) { return duplicate }
        guard let current = await store.current() else { throw TimerError.notRunning }
        guard current.version == baseVersion else { throw TimerError.conflict(currentVersion: current.version) }
        let state = try current.paused(at: now, serverOffset: serverOffset)
        await store.commit(state, mutationID: mutationID)
        return state
    }

    public func resume(mutationID: String, now: Date = Date()) async throws -> TaskTimerState {
        if let duplicate = await store.receipt(mutationID) { return duplicate }
        guard var current = await store.current(), let remaining = current.pausedRemainingSeconds else {
            throw TimerError.invalidTransition
        }
        let duration = current.phase == .work ? current.workSeconds : current.restSeconds
        current.anchor = now.addingTimeInterval(serverOffset - Double(duration - remaining))
        current.pausedRemainingSeconds = nil
        current.runState = .running
        current.version += 1
        await store.commit(current, mutationID: mutationID)
        await feedback(current.phase)
        return current
    }

    public func reset(mutationID: String, now: Date = Date()) async throws -> TaskTimerState {
        if let duplicate = await store.receipt(mutationID) { return duplicate }
        guard let current = await store.current() else { throw TimerError.notRunning }
        var reset = TaskTimerState.start(
            taskID: current.taskID, at: now.addingTimeInterval(serverOffset),
            workSeconds: current.workSeconds, restSeconds: current.restSeconds
        )
        reset.version = current.version + 1
        await store.commit(reset, mutationID: mutationID)
        return reset
    }

    public func switchPhase(mutationID: String, now: Date = Date()) async throws -> TaskTimerState {
        if let duplicate = await store.receipt(mutationID) { return duplicate }
        guard var current = await store.current() else { throw TimerError.notRunning }
        current.phase = current.phase == .work ? .rest : .work
        current.anchor = now.addingTimeInterval(serverOffset)
        current.pausedRemainingSeconds = nil
        current.runState = .running
        current.cycle += current.phase == .work ? 1 : 0
        current.version += 1
        await store.commit(current, mutationID: mutationID)
        await feedback(current.phase)
        return current
    }

    public func applyRemote(_ value: TaskTimerState) async { await store.commit(value, mutationID: "remote:\(value.version)") }
}
