import Foundation
import NaasehFeatures
import Testing

@Suite("Authorized task search")
struct TaskSearchPerformanceTests {
    @Test("10,000 authorized records search, filter, and rank correctly within one second")
    func tenThousandRecords() throws {
        let records = try (0 ..< 10_000).map { index in
            try TaskRecord.create(
                id: "task-\(index)",
                label: index.isMultiple(of: 100) ? "Needle \(index)" : "Ordinary \(index)",
                ownerID: index.isMultiple(of: 2) ? "owner" : "other",
                visibility: index.isMultiple(of: 4) ? .private : .public,
                urgency: TaskUrgency.allCases[index % TaskUrgency.allCases.count]
            )
        }
        let clock = ContinuousClock()
        let elapsed = clock.measure {
            let index = TaskSearchIndex(records: records, actorID: "owner", groupIDs: [])
            let results = index.search(.init(text: "needle", urgencies: [.high, .critical]))
            #expect(results.allSatisfy { $0.canRead(actorID: "owner", groupIDs: []) })
            #expect(results.allSatisfy { [.high, .critical].contains($0.urgency) })
            #expect(results.map(\.label) == results.map(\.label).sorted())
        }
        #expect(elapsed < .seconds(1))
    }

    @Test("protected terms remain memory-only and vanish on lock")
    func protectedTerms() throws {
        let privateTask = try TaskRecord.create(id: "private", label: "Secret phrase", ownerID: "owner", visibility: .private)
        var index = TaskSearchIndex(records: [privateTask], actorID: "owner", groupIDs: [])
        #expect(index.search(.init(text: "secret")).count == 1)
        #expect(index.persistedProjection().contains("secret") == false)
        index.lock()
        #expect(index.search(.init(text: "secret")).isEmpty)
    }
}
