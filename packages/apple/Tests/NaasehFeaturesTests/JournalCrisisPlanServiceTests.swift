import Foundation
import NaasehFeatures
import Security
import Testing

@Suite("Journal and Crisis Plan rules")
struct JournalCrisisPlanServiceTests {
    private struct RSAFixture: Decodable { let privateKey: String }
    @Test("plan precedes entries, no delete exists, drafts survive triggers, and conflicts are explicit")
    func ownerRules() async throws {
        let keys = try rsaKeys()
        let crypto = JournalCryptoService()
        _ = try await crypto.configure(ownerID: "owner", pin: "246810", recoveryPublicKey: JournalRecoveryKey(keys.publicKey), parameters: .testing)
        let plan = CrisisPlanService(ownerID: "owner", crypto: crypto)
        let journal = JournalService(ownerID: "owner", crypto: crypto, hasCrisisPlan: { await plan.exists() })
        let entryID = "18D45A02-68EF-4E26-8BB8-249144E14461"
        let projection = JournalProjection(id: entryID, ownerID: "owner", date: "2026-10-07", values: ["hoursOfSleep": 7.5], flags: [:], emotions: ["joy": 70], dbtSkills: [], createdAt: .now, updatedAt: .now)
        let body = JournalBody(entryID: entryID, generalNotes: nil, reflectedTaskID: nil, taskReflection: nil)
        await #expect(throws: JournalServiceError.crisisPlanRequired) { try await journal.save(mutationID: "m1", projection: projection, body: body, baseVersion: 0) }
        _ = try await plan.save(mutationID: "plan-1", planID: "6D58D9B2-A7E8-455E-B32D-285A96B07590", body: .init(warningSigns: ["Synthetic warning"]), baseVersion: 0)
        let saved = try await journal.save(mutationID: "m1", projection: projection, body: body, baseVersion: 0)
        #expect(saved.pendingSync)
        #expect(try await journal.save(mutationID: "m1", projection: projection, body: body, baseVersion: 0).id == entryID)
        await #expect(throws: JournalServiceError.conflict(currentVersion: 1)) { try await journal.save(mutationID: "m2", projection: projection, body: body, baseVersion: 0) }
        await #expect(throws: JournalServiceError.deleteProhibited) { try await journal.delete(entryID) }
        let triggered = try await plan.trigger(draft: body)
        #expect(triggered.preservedDraft == body)
    }

    @Test("recipient access is authorized, online-only, and revoked without plaintext caching")
    func recipientRules() async throws {
        let owner = try rsaKeys(), recipient = try rsaKeys()
        let crypto = JournalCryptoService()
        _ = try await crypto.configure(ownerID: "owner", pin: "246810", recoveryPublicKey: JournalRecoveryKey(owner.publicKey), parameters: .testing)
        let plan = CrisisPlanService(ownerID: "owner", crypto: crypto)
        _ = try await plan.save(mutationID: "p", planID: "6D58D9B2-A7E8-455E-B32D-285A96B07590", body: .init(copingStrategies: ["Synthetic strategy"]), baseVersion: 0)
        _ = try await plan.share(recipientID: "recipient", publicKey: JournalRecoveryKey(recipient.publicKey))
        await #expect(throws: CrisisPlanError.offlineRecipient) { try await plan.openAsRecipient(recipientID: "recipient", privateKey: JournalRecoveryKey(recipient.privateKey), online: false) }
        #expect(try await plan.openAsRecipient(recipientID: "recipient", privateKey: JournalRecoveryKey(recipient.privateKey), online: true).copingStrategies.count == 1)
        try await plan.revoke(recipientID: "recipient")
        await #expect(throws: CrisisPlanError.unauthorized) { try await plan.openAsRecipient(recipientID: "recipient", privateKey: JournalRecoveryKey(recipient.privateKey), online: true) }
        let rotated = try await plan.rotateAccess(mutationID: "rotate-1", remainingRecipientKeys: [:])
        #expect(rotated.keyGeneration == 2)
    }

    private func rsaKeys() throws -> (privateKey: SecKey, publicKey: SecKey) {
        let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test-fixtures/fixtures/apple/crypto/rsa-oaep-fixture.json").standardized
        let fixture = try JSONDecoder().decode(RSAFixture.self, from: Data(contentsOf: file))
        let data = try #require(Data(base64Encoded: fixture.privateKey))
        var error: Unmanaged<CFError>?
        let privateKey = try #require(SecKeyCreateWithData(data as CFData, [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits: 2048,
        ] as CFDictionary, &error))
        return (privateKey, try #require(SecKeyCopyPublicKey(privateKey)))
    }
}
