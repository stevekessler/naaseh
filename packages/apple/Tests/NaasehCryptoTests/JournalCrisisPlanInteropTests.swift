import Foundation
import NaasehFeatures
import Security
import Testing

@Suite("Journal and Crisis Plan cryptography")
struct JournalCrisisPlanInteropTests {
    private struct Fixture: Decodable { let privateKey: String }
    private struct Projection: Codable, Equatable { let score: Int }
    private struct Body: Codable, Equatable { let notes: String }

    @Test("PIN wrap, ciphertext AAD, RSA recovery, and background zeroization interoperate")
    func lifecycle() async throws {
        let privateKey = try fixturePrivateKey()
        let publicKey = try #require(SecKeyCopyPublicKey(privateKey))
        let crypto = JournalCryptoService()
        let envelope = try await crypto.configure(
            ownerID: "owner", pin: "246810", recoveryPublicKey: JournalRecoveryKey(publicKey), parameters: .testing
        )
        let payload = Data("synthetic-registry-v1".utf8)
        var signingError: Unmanaged<CFError>?
        let signature = try #require(SecKeyCreateSignature(privateKey, .rsaSignatureMessagePSSSHA256, payload as CFData, &signingError) as Data?)
        #expect(JournalCryptoService.verifyRecoveryRegistry(canonicalPayload: payload, signature: signature, signingPublicKey: JournalRecoveryKey(publicKey)))
        let encrypted = try await crypto.sealEntry(
            ownerID: "owner", entryID: "18D45A02-68EF-4E26-8BB8-249144E14461",
            localDate: "2026-10-07", projection: Projection(score: 7), body: Body(notes: "private")
        )
        #expect(encrypted.dateToken.count == 43)
        #expect(encrypted.projection.ciphertext.contains("private") == false)
        await crypto.applicationDidEnterBackground()
        await #expect(throws: JournalCryptoError.locked) {
            try await crypto.open(Projection.self, envelope: encrypted.projection, ownerID: "owner", recordID: encrypted.entryID, dateToken: encrypted.dateToken)
        }
        try await crypto.recover(envelope, recoveryPrivateKey: JournalRecoveryKey(privateKey))
        #expect(try await crypto.open(Body.self, envelope: encrypted.body, ownerID: "owner", recordID: encrypted.entryID, dateToken: encrypted.dateToken) == Body(notes: "private"))
        await crypto.lock()
        await #expect(throws: JournalCryptoError.invalidPIN) { try await crypto.unlock(envelope, pin: "wrong") }
        try await crypto.unlock(envelope, pin: "246810")
        let rotated = try await crypto.rotate(envelope, pin: "246810", recoveryPublicKey: JournalRecoveryKey(publicKey), parameters: .testing)
        #expect(rotated.version == 2)
        #expect(rotated.keyVersion == 2)
    }

    private func fixturePrivateKey() throws -> SecKey {
        let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test-fixtures/fixtures/apple/crypto/rsa-oaep-fixture.json").standardized
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
        let data = try #require(Data(base64Encoded: fixture.privateKey))
        var error: Unmanaged<CFError>?
        return try #require(SecKeyCreateWithData(data as CFData, [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits: 2048,
        ] as CFDictionary, &error))
    }
}
