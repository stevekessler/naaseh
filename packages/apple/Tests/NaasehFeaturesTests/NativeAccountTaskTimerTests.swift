import Foundation
import NaasehFeatures
import NaasehPersistence
import NaasehSync
import Testing

@Suite("Account-wide native task timer")
struct NativeAccountTaskTimerTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    @Test("timer defaults to ten minutes and elapsed time survives suspension")
    func elapsed() throws {
        let timer = try NativeAccountTaskTimer.applying(.init("start", taskID: "task"), to: nil, ownerID: "owner", mutationID: "start", now: now)
        #expect(timer.durationSeconds == 600)
        #expect(timer.effective(at: now.addingTimeInterval(599)).remaining == 1)
        #expect(timer.effective(at: now.addingTimeInterval(700)).timer.status == "finished")
        #expect(timer.taskId == "task")
    }
    @Test("repeat derives missed intervals from anchors without completing a task")
    func repeating() throws {
        let started = try NativeAccountTaskTimer.applying(.init("start", taskID: "task"), to: nil, ownerID: "owner", mutationID: "start", now: now)
        let timer = try NativeAccountTaskTimer.applying(.init("setRepeat", enabled: true), to: started, ownerID: "owner", mutationID: "repeat", now: now)
        let projection = timer.effective(at: now.addingTimeInterval(1801))
        #expect(projection.remaining == 599)
        #expect(projection.timer.intervalOrdinal == 4)
        #expect(projection.timer.taskId == "task" && projection.timer.status == "running")
    }
    @Test("pause and resume preserve remaining time with required nullable wire fields")
    func pauseResume() throws {
        let started = try NativeAccountTaskTimer.applying(.init("start", taskID: "task"), to: nil, ownerID: "owner", mutationID: "start", now: now)
        let paused = try NativeAccountTaskTimer.applying(.init("pause"), to: started, ownerID: "owner", mutationID: "pause", now: now.addingTimeInterval(50))
        #expect(paused.effective(at: now.addingTimeInterval(5000)).remaining == 550)
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(paused)) as? [String: Any])
        #expect(json["anchorAt"] is NSNull && json["endsAt"] is NSNull && json["lastCompletedAt"] is NSNull)
        let resumed = try NativeAccountTaskTimer.applying(.init("resume"), to: paused, ownerID: "owner", mutationID: "resume", now: now.addingTimeInterval(5000))
        #expect(resumed.effective(at: now.addingTimeInterval(5100)).remaining == 450)
        #expect(resumed.version == 3)
    }
    @Test("timer sync uses the account identity and encrypted command outbox")
    func durableTimer() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = PersistenceController()
        try await persistence.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let sync = SecureNativeSyncStore(controller: persistence)
        await sync.activate(accountID: "owner", rootKey: Data(repeating: 9, count: 32))
        let storage = SyncedTaskWorkspaceStore(syncStore: sync, actorID: { "owner" })
        let task = try await storage.create(.init(mutationID: NativeULID.make(), label: "Real task"))
        let timer = try await storage.timerCommand(.init("start", taskID: task.id))
        #expect(timer.id == "owner" && timer.ownerId == "owner" && timer.taskId == task.id)
        let operations = try await sync.queuedOperations(readyAt: .distantFuture, limit: 10)
        let operation = try #require(operations.last)
        #expect(operation.operation == "timerCommand" && operation.targetKind == "timer" && operation.targetID == "owner")
        let command = try JSONDecoder().decode(NativeTaskTimerCommand.self, from: operation.payload)
        #expect(command.type == "start" && command.taskId == task.id)
        #expect(try await storage.timer() == timer)
        var remote = timer
        remote.version = 8
        remote.status = "stopped"
        remote.anchorAt = nil; remote.endsAt = nil; remote.pausedRemainingSeconds = nil
        try await sync.apply(.init(records: [.init(kind: "taskTimer", id: "owner", version: 8,
                                                  payload: JSONEncoder().encode(remote))], cursor: "pending"))
        #expect(try await storage.timer()?.status == "running")
        try await sync.markApplied(operations.map(\.id))
        try await sync.apply(.init(records: [.init(kind: "taskTimer", id: "owner", version: 8,
                                                  payload: JSONEncoder().encode(remote))], cursor: "remote"))
        #expect(try await storage.timer()?.status == "stopped")
    }
    @Test("invalid durations and another account cannot mutate a timer")
    func invalidCommands() throws {
        #expect(throws: TimerError.invalidTransition) {
            try NativeAccountTaskTimer.applying(.init("start", taskID: "task", durationSeconds: 61), to: nil, ownerID: "owner", mutationID: "bad")
        }
        let started = try NativeAccountTaskTimer.applying(.init("start", taskID: "task"), to: nil, ownerID: "owner", mutationID: "start")
        #expect(throws: TaskCommandError.unauthorized) {
            try NativeAccountTaskTimer.applying(.init("pause"), to: started, ownerID: "other", mutationID: "bad")
        }
    }
}
