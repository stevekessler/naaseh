import Foundation
import NaasehFeatures
import Testing

@Suite("Task domain parity")
struct TaskDomainParityTests {
    @Test("ordinary defaults and due-date semantics match the web domain")
    func defaultsAndDueValues() throws {
        let task = try TaskRecord.create(label: "  Call dentist  ", ownerID: "owner", now: .init(timeIntervalSince1970: 1))
        #expect(task.label == "Call dentist")
        #expect(task.urgency == .medium)
        #expect(task.visibility == .public)
        #expect(task.lifecycle == .active)
        #expect(task.completionState == .open)
        #expect(task.percentComplete == 0)
        #expect(throws: TaskValidationError.self) {
            try TaskRecord.create(label: "", ownerID: "owner")
        }
        #expect(throws: TaskValidationError.self) {
            try TaskDueValue.date("2026-02-30")
        }
        #expect(try TaskDueValue.date("2026-08-15").calendarDate == "2026-08-15")
    }

    @Test("hierarchy, privacy, revisions, and completion snapshots preserve invariants")
    func hierarchyPrivacyRevisionCompletion() throws {
        let original = try TaskRecord.create(
            label: "Ship native app",
            ownerID: "owner",
            visibility: .private,
            urgency: .critical,
            now: .init(timeIntervalSince1970: 10)
        )
        #expect(original.canRead(actorID: "owner", groupIDs: []))
        #expect(!original.canRead(actorID: "admin", groupIDs: []))
        let edited = try original.edit(label: "Ship Apple app", actorID: "owner", now: .init(timeIntervalSince1970: 20))
        let revision = TaskRevisionRecord(previous: original, replacement: edited, actorID: "owner")
        #expect(revision.before.label == "Ship native app")
        #expect(revision.afterVersion == 2)
        let result = try edited.completing(actorID: "owner", eventID: "completion-1", now: .init(timeIntervalSince1970: 30))
        #expect(result.task.archiveReason == .completed)
        #expect(result.completion.urgencyAtCompletion == .critical)
        #expect(throws: TaskValidationError.hierarchyCycle) {
            try TaskHierarchy.validateParent(taskID: "a", proposedParentID: "b", parentByTaskID: ["b": "a"])
        }
    }
}
