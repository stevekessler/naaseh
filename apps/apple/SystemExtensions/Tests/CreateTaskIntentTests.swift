import AppIntents
import NaasehFeatures
import XCTest

final class CreateTaskIntentTests: XCTestCase {
    func testParameterSummaryDoesNotPromiseBeforeCommit() {
        let intent = CreateTaskIntent()
        XCTAssertEqual(intent.invocationID.isEmpty, false)
        XCTAssertFalse(String(describing: CreateTaskIntent.parameterSummary).contains("created"))
    }

    func testDialogsUseSafeStableResults() {
        XCTAssertEqual(CreateTaskIntent.safeSuccessDialog, "Task added to Na’aseh.")
        XCTAssertFalse(CreateTaskIntent.safeSuccessDialog.localizedCaseInsensitiveContains("project"))
    }

    func testInvocationIdentifierIsStablePerIntentAndUniqueAcrossIntents() {
        let first = CreateTaskIntent()
        let captured = first.invocationID
        XCTAssertEqual(first.invocationID, captured)
        XCTAssertNotEqual(first.invocationID, CreateTaskIntent().invocationID)
    }

    func testContinuationRoutingRejectsUntrustedAndMalformedURLs() async {
        let dependencies = IntentDependencies()
        let untrusted = await dependencies.routeContinuation(URL(string: "https://example.com/voice/continue?token=bad")!)
        let malformed = await dependencies.routeContinuation(URL(string: "naaseh://voice/continue?token=not-a-uuid")!)
        let valid = await dependencies.routeContinuation(URL(string: "naaseh://voice/continue?token=6BC1F98E-BA6F-4FFB-B10F-37F5A12DAE87")!)
        XCTAssertFalse(untrusted)
        XCTAssertFalse(malformed)
        XCTAssertTrue(valid)
    }

    func testIntentCommitsBeforeReturningPrivacySafeSuccess() async throws {
        let commandStore = InMemoryTaskCommandStore()
        let service = VoiceTaskService(
            projects: AuthorizedProjectQuery(projects: []),
            commands: TaskCommandService(store: commandStore, actorID: "owner"),
            access: { .unlocked }
        )
        let continuation = try VoiceContinuationStore(key: Data(repeating: 7, count: 32))
        await IntentDependencies.shared.configure(
            voiceService: service,
            continuationStore: continuation,
            projectQuery: AuthorizedProjectQuery(projects: [])
        )
        let intent = CreateTaskIntent()
        intent.taskTitle = "Synthetic test task"
        intent.project = nil
        intent.dueAt = nil
        _ = try await intent.perform()
        let operationCount = await commandStore.operations.count
        let taskCount = await commandStore.tasks.count
        XCTAssertEqual(operationCount, 1)
        XCTAssertEqual(taskCount, 1)
    }
}
