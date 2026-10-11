import Foundation
import NaasehFeatures
import Testing

@Suite("Siri task creation")
struct VoiceTaskServiceTests {
    private func service(
        projects: [AuthorizedProject] = [],
        unlocked: Bool = true
    ) -> (VoiceTaskService, InMemoryTaskCommandStore) {
        let store = InMemoryTaskCommandStore()
        let commands = TaskCommandService(store: store, actorID: "owner")
        return (
            VoiceTaskService(
                projects: AuthorizedProjectQuery(projects: projects),
                commands: commands,
                access: { unlocked ? .unlocked : .locked },
                timeZone: TimeZone(identifier: "America/Denver")!
            ),
            store
        )
    }

    @Test("omitted project creates an ordinary unassigned task online or offline")
    func omittedProject() async throws {
        let (voice, store) = service()
        let result = try await voice.create(.init(invocationID: "voice-1", title: "Call dentist"))
        #expect(result.projectID == nil)
        #expect(result.durable)
        #expect(await store.tasks[result.taskID]?.urgency == .medium)
        #expect(await store.operations.count == 1)
    }

    @Test("specified project resolves only existing authorized active projects")
    func projectResolution() async throws {
        let projects = [
            AuthorizedProject(id: "p1", name: "House", isActive: true, isAuthorized: true),
            AuthorizedProject(id: "p2", name: "House", isActive: true, isAuthorized: true),
            AuthorizedProject(id: "p3", name: "Secret", isActive: true, isAuthorized: false),
        ]
        let (voice, _) = service(projects: projects)
        await #expect(throws: VoiceTaskError.ambiguousProject(["p1", "p2"])) {
            try await voice.create(.init(invocationID: "ambiguous", title: "Paint", projectTerm: "House"))
        }
        await #expect(throws: VoiceTaskError.projectNotFound) {
            try await voice.create(.init(invocationID: "unauthorized", title: "Read", projectTerm: "Secret"))
        }
        let result = try await voice.create(.init(invocationID: "resolved", title: "Paint", projectTerm: "p1"))
        #expect(result.projectID == "p1")
    }

    @Test("date, time, lock, cancellation, and duplicate invocation are safe")
    func dateLockAndDuplicate() async throws {
        let (voice, store) = service()
        let request = VoiceTaskRequest(
            invocationID: "same-invocation",
            title: "Appointment",
            dueDate: "2026-11-03",
            dueTime: "14:30"
        )
        let first = try await voice.create(request)
        let duplicate = try await voice.create(request)
        #expect(first == duplicate)
        #expect(await store.operations.count == 1)
        #expect(await store.tasks[first.taskID]?.due?.kind == .timed)

        let (locked, _) = service(unlocked: false)
        await #expect(throws: VoiceTaskError.locked) {
            try await locked.create(.init(invocationID: "locked", title: "No"))
        }
        await #expect(throws: VoiceTaskError.cancelled) {
            try await voice.create(.init(invocationID: "cancel", title: "Cancel", isCancelled: true))
        }
    }
}
