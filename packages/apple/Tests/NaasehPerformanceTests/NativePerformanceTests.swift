import Foundation
import NaasehFeatures
import Testing

@Suite("SC-008 native performance workloads") struct NativePerformanceTests {
    private let owner = "performance-owner"

    private func records(count: Int = 10_000) throws -> [TaskRecord] {
        try (0 ..< count).map { index in
            try TaskRecord.create(
                id: "task-\(index)",
                label: index % 100 == 0 ? "Needle task \(index)" : "Task \(index)",
                ownerID: owner,
                memo: "Synthetic performance fixture \(index)",
                urgency: TaskUrgency.allCases[index % TaskUrgency.allCases.count],
                now: Date(timeIntervalSince1970: TimeInterval(index))
            )
        }
    }

    private func milliseconds(_ operation: () throws -> Void) rethrows -> Double {
        let start = DispatchTime.now().uptimeNanoseconds
        try operation()
        return Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    }

    @Test("10,000-record warm launch and search meet the release thresholds")
    func warmLaunchAndSearch() throws {
        let source = try records()
        var index: TaskSearchIndex?
        let launch = milliseconds { index = TaskSearchIndex(records: source, actorID: owner, groupIDs: []) }
        #expect(launch < 2_000, "Warm cached index took \(launch) ms")
        let ready = try #require(index)
        var hits: [TaskRecord] = []
        let search = milliseconds { hits = ready.search(.init(text: "Needle")) }
        #expect(hits.count == 100)
        #expect(search < 1_000, "10,000-record search took \(search) ms")
    }

    @Test("local mutation and layout projection pass in at least 95 percent of measured runs")
    func mutationAndLayout() throws {
        let task = try TaskRecord.create(label: "Before", ownerID: owner)
        var mutationPasses = 0
        var layoutPasses = 0
        for run in 0 ..< 20 {
            let mutation = try milliseconds { _ = try task.edit(label: "After \(run)", actorID: owner) }
            if mutation < 500 { mutationPasses += 1 }
            let layout = milliseconds {
                _ = (0 ..< 10_000).map { value in (value % 3, value / 3, value.isMultiple(of: 2)) }
            }
            if layout < 250 { layoutPasses += 1 }
        }
        #expect(mutationPasses >= 19)
        #expect(layoutPasses >= 19)
    }

    @Test("Siri command commits durably within the ordinary local-mutation budget")
    func siriCommit() async throws {
        let store = InMemoryTaskCommandStore()
        let commands = TaskCommandService(store: store, actorID: owner)
        let voice = VoiceTaskService(
            projects: AuthorizedProjectQuery(projects: []),
            commands: commands,
            access: { .unlocked },
            timeZone: TimeZone(identifier: "America/Denver")!
        )
        let start = DispatchTime.now().uptimeNanoseconds
        let result = try await voice.create(.init(invocationID: "performance-siri", title: "Synthetic task"))
        let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
        #expect(result.durable)
        #expect(await store.operations.count == 1)
        #expect(elapsed < 500, "Siri durable commit took \(elapsed) ms")
    }
}
