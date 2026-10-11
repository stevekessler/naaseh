import Foundation
import NaasehFeatures
import Testing

@Suite("Canonical task timer")
struct TimerCoordinatorTests {
    @Test("anchors survive clock changes, background, and termination")
    func anchors() throws {
        let started = Date(timeIntervalSince1970: 1_000)
        var state = TaskTimerState.start(taskID: "task", at: started, workSeconds: 60, restSeconds: 30)
        #expect(state.remaining(at: Date(timeIntervalSince1970: 1_020), serverOffset: 0) == 40)
        #expect(state.remaining(at: Date(timeIntervalSince1970: 1_020), serverOffset: 10) == 30)
        state = try state.paused(at: Date(timeIntervalSince1970: 1_025))
        #expect(state.remaining(at: Date(timeIntervalSince1970: 9_999), serverOffset: 0) == 35)
        let restored = try JSONDecoder().decode(TaskTimerState.self, from: JSONEncoder().encode(state))
        #expect(restored == state)
    }

    @Test("commands are idempotent, conflicts are explicit, and convergence is under one second")
    func commands() async throws {
        let store = InMemoryTimerStore()
        let coordinator = TimerCoordinator(store: store)
        let first = try await coordinator.start(taskID: "task", mutationID: "m1", now: .init(timeIntervalSince1970: 1))
        let duplicate = try await coordinator.start(taskID: "task", mutationID: "m1", now: .init(timeIntervalSince1970: 2))
        #expect(first == duplicate)
        await store.forceVersion(99)
        await #expect(throws: TimerError.conflict(currentVersion: 99)) {
            try await coordinator.pause(mutationID: "m2", baseVersion: 1, now: .init(timeIntervalSince1970: 3))
        }
        let clock = ContinuousClock()
        let duration = await clock.measure { await coordinator.applyRemote(first) }
        #expect(duration < .seconds(1))
    }
}
