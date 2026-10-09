import Foundation
import NaasehFeatures
import NaasehServices
import Security
import Testing

private actor FeedbackCounter {
    var count = 0
    func increment() { count += 1 }
}

@Suite("SC-005 800 feature operation workload") struct ExactlyOnceWorkloadTests {
    private func replayCount(_ index: Int) -> Int { 2 + index % 4 }

    @Test("200 voice and 200 alert IDs have one durable effect each")
    func voiceAndAlerts() async throws {
        let taskStore = InMemoryTaskCommandStore()
        let voice = VoiceTaskService(
            projects: AuthorizedProjectQuery(projects: []),
            commands: TaskCommandService(store: taskStore, actorID: "owner"),
            access: { .unlocked },
            timeZone: TimeZone(identifier: "America/Denver")!
        )
        let scheduler = MemoryNotificationScheduler()
        let alerts = AlertCoordinator(scheduler: scheduler)
        for index in 0 ..< 200 {
            for _ in 0 ..< replayCount(index) {
                _ = try await voice.create(.init(invocationID: "voice-\(index)", title: "Task \(index)"))
                try await alerts.schedule(.init(id: "reminder-\(index)", taskID: "task-\(index)", dueAt: .init(timeIntervalSince1970: Double(index)), occurrenceID: "alert-\(index)"))
                await alerts.reconcileDelivered(occurrenceID: "alert-\(index)")
            }
        }
        #expect(await taskStore.tasks.count == 200)
        #expect(await taskStore.operations.filter { $0.operation == "create" }.count == 200)
        #expect(await scheduler.pending.count == 200)
        #expect(await alerts.deliveredOccurrenceIDs.count == 200)
    }

    @Test("150 completion and 150 timer IDs have one durable effect each")
    func completionsAndTimers() async throws {
        let taskStore = InMemoryTaskCommandStore()
        let commands = TaskCommandService(store: taskStore, actorID: "owner")
        for index in 0 ..< 150 {
            let task = try await commands.create(.init(mutationID: "seed-\(index)", label: "Task \(index)"))
            for _ in 0 ..< replayCount(index) {
                _ = try await commands.complete(taskID: task.id, mutationID: "completion-\(index)")
            }
        }
        #expect(await taskStore.completions.count == 150)
        #expect(await taskStore.operations.filter { $0.operation == "complete" }.count == 150)

        let counter = FeedbackCounter()
        let timerStore = InMemoryTimerStore()
        let timer = TimerCoordinator(store: timerStore, feedback: { _ in await counter.increment() })
        for index in 0 ..< 150 {
            for _ in 0 ..< replayCount(index) {
                if index == 0 {
                    _ = try await timer.start(taskID: "timer-task", mutationID: "timer-0", now: .init(timeIntervalSince1970: 0))
                } else {
                    _ = try await timer.switchPhase(mutationID: "timer-\(index)", now: .init(timeIntervalSince1970: Double(index)))
                }
            }
        }
        #expect(await timerStore.current()?.version == 150)
        #expect(await counter.count == 149)
    }

    @Test("100 sharing IDs produce only 50 share and 50 revocation effects")
    func sharing() async throws {
        let key = try rsaPublicKey()
        let crypto = JournalCryptoService()
        _ = try await crypto.configure(ownerID: "owner", pin: "246810", recoveryPublicKey: JournalRecoveryKey(key), parameters: .testing)
        let plan = CrisisPlanService(ownerID: "owner", crypto: crypto)
        _ = try await plan.save(mutationID: "plan", planID: "plan-id", body: .init(), baseVersion: 0)
        for index in 0 ..< 50 {
            for _ in 0 ..< replayCount(index) {
                _ = try await plan.share(recipientID: "recipient-\(index)", publicKey: JournalRecoveryKey(key), mutationID: "share-\(index)")
            }
            for _ in 0 ..< replayCount(index + 50) {
                _ = try await plan.revoke(recipientID: "recipient-\(index)", mutationID: "revoke-\(index)")
            }
        }
        let shares = await plan.allShares()
        #expect(shares.count == 50)
        #expect(shares.allSatisfy { $0.state == .revoked && $0.version == 2 })
    }

    private func rsaPublicKey() throws -> SecKey {
        struct Fixture: Decodable { let privateKey: String }
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test-fixtures/fixtures/apple/crypto/rsa-oaep-fixture.json").standardized
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        let data = try #require(Data(base64Encoded: fixture.privateKey))
        var error: Unmanaged<CFError>?
        let privateKey = try #require(SecKeyCreateWithData(data as CFData, [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits: 2048,
        ] as CFDictionary, &error))
        return try #require(SecKeyCopyPublicKey(privateKey))
    }
}
