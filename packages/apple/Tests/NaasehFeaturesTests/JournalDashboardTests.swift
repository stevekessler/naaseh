import Foundation
import NaasehFeatures
import Testing

@Suite("Journal dashboard")
struct JournalDashboardTests {
    @Test("period boundaries, comparisons, contributors, no-data, and sensitive profile filtering are deterministic")
    func metrics() throws {
        func entry(_ id: String, _ date: String, _ sleep: Double) -> JournalEntry {
            .init(id: id, version: 1, projection: .init(id: id, ownerID: "owner", date: date, values: ["hoursOfSleep": sleep], flags: ["selfCare": true], emotions: ["joy": Int(sleep * 10)], dbtSkills: [], createdAt: .now, updatedAt: .now), body: .init(entryID: id, generalNotes: nil, reflectedTaskID: nil, taskReflection: nil), pendingSync: false)
        }
        let service = JournalDashboardService()
        let metrics = try service.calculate(entries: [entry("prior", "2026-10-05", 6), entry("current", "2026-10-06", 8)], start: "2026-10-06", end: "2026-10-06", profile: .init(ownerID: "owner", suicidalSelfHarmEnabled: false))
        let sleep = try #require(metrics.first { $0.name == "hoursOfSleep" })
        #expect(sleep.value == .number(8))
        #expect(sleep.comparison == .number(6))
        #expect(sleep.trend == .up)
        #expect(sleep.contributingEntryIDs == ["current"])
        #expect(metrics.contains { $0.name == "suicidalThoughts" } == false)
    }
}
