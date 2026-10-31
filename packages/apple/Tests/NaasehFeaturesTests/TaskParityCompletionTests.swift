import Foundation
import CryptoKit
import Security
import NaasehContracts
import NaasehCrypto
import NaasehFeatures
import NaasehPersistence
import NaasehSync
import Testing

@Suite("Completed native task integrations")
struct TaskParityCompletionTests {
    @Test("rich hidden memos unlock, relock, and retain every active recovery recipient")
    func hiddenDocuments() async throws {
        let first = try NativeRSAKeys.ephemeral(), second = try NativeRSAKeys.ephemeral()
        let recipients = [NativeMemoRecoveryRecipient(keyID: "first", version: "1", key: try NativeRSAKeys.publicKey(spki: first.spki)),
                          NativeMemoRecoveryRecipient(keyID: "second", version: "2", key: try NativeRSAKeys.publicKey(spki: second.spki))]
        let service = HiddenMemoService(argon2: .testing)
        let data = Data(#"{"version":1,"blocks":[{"type":"paragraph","runs":[{"text":"Protected formatting","marks":["bold","italic"]}]}]}"#.utf8)
        let document = try JSONDecoder().decode(TaskMemoDocument.self, from: data)
        let package = try await service.createDocument(taskID: "task", document: document, pin: "246810", recipients: recipients)
        #expect(package.version == 2 && package.recoveryWraps.count == 2)
        #expect(package.recoveryWraps.map(\.kmsKeyId) == ["first", "second"])
        let encoded = String(decoding: try JSONEncoder().encode(package), as: UTF8.self)
        #expect(!encoded.contains("Protected formatting"))
        #expect(try await service.unlockDocument(package, pin: "246810") == document)
        await service.applicationDidEnterBackground()
        await #expect(throws: HiddenMemoError.locked) { try await service.editDocument(package, document: document) }
        let wrap = package.recoveryWraps[1]
        var key = try NaasehCrypto.rsaOAEPUnwrap(NaasehCrypto.base64URLDecode(wrap.ciphertext), privateKey: second.privateKey)
        defer { key.resetBytes(in: 0..<key.count) }
        #expect(try await service.recoverDocument(package, rawKey: key) == document)
    }
    @Test("recovery registry rejects forged signatures and accepts a valid active key")
    func recoveryRegistry() throws {
        let pair = try NativeRSAKeys.ephemeral()
        var fields: [String: JSONValue] = ["schema": .string("naaseh-recovery-key-registry/v1"), "region": .string("us-west-2"),
            "generatedAt": .string(ISO8601DateFormatter().string(from: Date())), "signingPublicKeySpki": .string(pair.spki.base64EncodedString()),
            "keys": .array([.object(["authority": .string("recovery"), "region": .string("us-west-2"), "state": .string("active"),
                "algorithm": .string("RSAES_OAEP_SHA_256"), "version": .number(1), "keyId": .string("arn:aws:kms:us-west-2:123:key/test"),
                "publicKey": .string(pair.spki.base64EncodedString())])])]
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let message = try encoder.encode(JSONValue.object(fields))
        var error: Unmanaged<CFError>?
        let signature = try #require(SecKeyCreateSignature(pair.privateKey, .rsaSignatureMessagePSSSHA256, message as CFData, &error) as Data?)
        fields["signature"] = .string(signature.base64EncodedString())
        #expect(try NativeRecoveryRegistry.recipients(.object(fields)).count == 1)
        fields["region"] = .string("elsewhere")
        #expect(throws: HiddenMemoError.recoveryUnavailable) { try NativeRecoveryRegistry.recipients(.object(fields)) }
    }
    @Test("CSV validation handles quoted newlines and rejects altered exports")
    func csvIntegrity() throws {
        let data = Data((NativeCompletionCSV.headers + "\r\n\"a\r\nb\",\"quoted \"\"text\"\"\"\r\n").utf8)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        try NativeCompletionCSV.validate(data, checksum: digest, rowCount: 1)
        #expect(throws: NativeTaskFeatureError.unverifiedDownload) { try NativeCompletionCSV.validate(data + Data([1]), checksum: digest, rowCount: 1) }
        #expect(throws: NativeTaskFeatureError.unverifiedDownload) { try NativeCompletionCSV.validate(data, checksum: digest, rowCount: 2) }
    }
    @Test("filtered task searches support scope, match-any, dates, progress, and multiple assignees")
    func filters() throws {
        var task = try TaskRecord.create(label: "Quarterly review", ownerID: "owner", due: .date("2026-10-30"), assigneeID: "other", groupID: "team")
        task.percentComplete = 50
        var filter = NativeTaskFilters()
        func matches(_ filter: NativeTaskFilters) -> Bool {
            filter.matches(task, text: "quaterly", urgencies: [], project: "", category: "", assignee: "", group: "", actorID: "owner", memberships: [])
        }
        #expect(!matches(filter))
        filter.assigneeIDs = ["other", "third"]; filter.from = "2026-10-01"; filter.to = "2026-10-31"; filter.progress = "in-progress"
        #expect(matches(filter))
        filter.from = "2027-01-01"
        #expect(!matches(filter))
        filter.matchAny = true
        #expect(matches(filter))
        #expect(NativeTaskTextSearch.basisHash(" Ｒｅｖｉｅｗ ") == NativeTaskTextSearch.basisHash("review"))
    }
    @Test("native task edits send only changed fields")
    func changedFields() throws {
        let task = try TaskRecord.create(label: "Keep remote title", ownerID: "owner", memo: "Unchanged memo")
        var details = TaskDetails(task: task); details.urgency = .critical
        #expect(try details.patch(for: task) == ["urgency": .string("critical")])
    }
    @Test("voice invocation replay stays idempotent after the service is recreated")
    func durableVoiceReplay() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = PersistenceController()
        try await persistence.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let sync = SecureNativeSyncStore(controller: persistence)
        await sync.activate(accountID: "owner", rootKey: Data(repeating: 7, count: 32))
        let storage = SyncedTaskWorkspaceStore(syncStore: sync, actorID: { "owner" })
        func service() -> VoiceTaskService {
            VoiceTaskService(projects: AuthorizedProjectQuery(projects: []), createTask: { try await storage.create($0) }, access: { .unlocked })
        }
        let request = VoiceTaskRequest(invocationID: "same-durable-voice-id", title: "One task")
        let first = try await service().create(request)
        let replay = try await service().create(request)
        #expect(first.taskID == replay.taskID)
        #expect(try await storage.allTasks().count == 1)
        #expect(try await sync.queuedOperations(readyAt: .distantFuture, limit: 10).count == 1)
    }

    @Test("conflict retry rebases saved patches without replacing unrelated remote fields")
    func conflictRetry() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let controller = PersistenceController()
        try await controller.open(appGroupIdentifier: "test", overrideDirectory: directory)
        let sync = SecureNativeSyncStore(controller: controller)
        await sync.activate(accountID: "owner", rootKey: Data(repeating: 7, count: 32))
        let storage = SyncedTaskWorkspaceStore(syncStore: sync, actorID: { "owner" })
        let original = try await storage.create(.init(mutationID: NativeULID.make(), label: "Original"))
        try await sync.markApplied(try await sync.queuedOperations(readyAt: .distantFuture, limit: 10).map(\.id))
        var details = TaskDetails(task: original); details.urgency = .critical
        _ = try await storage.edit(.init(mutationID: NativeULID.make(), taskID: original.id, baseVersion: 1, details: details))
        let queued = try await sync.queuedOperations(readyAt: .distantFuture, limit: 10)
        try await sync.markConflicted(queued.map(\.id))
        var remote = original; remote.label = "Changed elsewhere"; remote.version = 7
        let value = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(remote))
        try await storage.resolveTarget(kind: .task, id: original.id, remote: value, version: 7, retry: true, mutationIDs: [NativeULID.make()])
        let retried = try await sync.queuedOperations(readyAt: .distantFuture, limit: 10)
        #expect(retried.count == 1 && retried[0].baseVersion == 7 && retried[0].id != queued[0].id)
        let local = try #require(try await storage.allTasks().first)
        #expect(local.label == "Changed elsewhere" && local.urgency == .critical)
        try await sync.markConflicted(retried.map(\.id))
        try await storage.resolveTarget(kind: .task, id: original.id, remote: value, version: 7, retry: false, mutationIDs: [])
        #expect(try await storage.allTasks().first?.urgency == original.urgency)
        #expect(try await sync.reviewOperations().isEmpty)
        await sync.activate(accountID: "different-account", rootKey: Data(repeating: 8, count: 32))
        await #expect(throws: SecureNativeSyncStoreError.locked) {
            try await sync.cache(value, kind: .task, recordID: original.id, version: 7, expectedAccountID: "owner")
        }
        #expect(try await sync.values(JSONValue.self, kind: .task).isEmpty)
    }
}
