import Foundation
import NaasehFeatures
import Security
import Testing

@Suite("Hidden memo interoperability")
struct HiddenMemoInteropTests {
    private struct RSAFixture: Decodable { let privateKey: String }
    @Test("unlock, edit, relock, wrong PIN, and background lock are fail closed")
    func pinLifecycle() async throws {
        let service = HiddenMemoService(argon2: .testing)
        let package = try await service.create(
            taskID: "task-1", memoID: "memo-1", text: "private details", pin: "246810"
        )
        #expect(package.aad == "naaseh:hidden-memo:1:task-1:memo-1")
        #expect(try await service.unlock(package, pin: "246810") == "private details")
        await #expect(throws: HiddenMemoError.invalidPIN) {
            try await service.unlock(package, pin: "135791")
        }
        let edited = try await service.edit(package, text: "changed")
        #expect(try await service.unlockedText(memoID: "memo-1") == "changed")
        await service.applicationDidEnterBackground()
        await #expect(throws: HiddenMemoError.locked) {
            try await service.unlockedText(memoID: "memo-1")
        }
        #expect(edited.ciphertext != package.ciphertext)
    }

    @Test("RSA recovery unlocks the same web-compatible AES package")
    func recovery() async throws {
        let file = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test-fixtures/fixtures/apple/crypto/rsa-oaep-fixture.json").standardized
        let fixture = try JSONDecoder().decode(RSAFixture.self, from: Data(contentsOf: file))
        let keyData = try #require(Data(base64Encoded: fixture.privateKey))
        let attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits: 2048,
        ]
        var error: Unmanaged<CFError>?
        let privateKey = try #require(SecKeyCreateWithData(keyData as CFData, attributes as CFDictionary, &error))
        let publicKey = try #require(SecKeyCopyPublicKey(privateKey))
        let service = HiddenMemoService(argon2: .testing)
        let package = try await service.create(
            taskID: "task-2",
            memoID: "memo-2",
            text: "recover me",
            pin: "246810",
            recoveryPublicKey: HiddenMemoRecoveryKey(publicKey)
        )
        #expect(try await service.recover(package, privateKey: HiddenMemoRecoveryKey(privateKey)) == "recover me")
    }
}
