import Foundation
import NaasehCrypto
import NaasehTestSupport
import Security
import Testing

@Suite("Cross-language cryptography")
struct CryptoInteropTests {
    @Test("AES-256-GCM matches the NIST empty-plaintext vector")
    func aesGCMVector() throws {
        let sealed = try NaasehCrypto.aesGCMSeal(
            plaintext: Data(),
            key: Data(repeating: 0, count: 32),
            nonce: Data(repeating: 0, count: 12),
            authenticatedData: Data()
        )
        #expect(sealed.ciphertext.isEmpty)
        #expect(sealed.tag.hex == "530f8afbc74536b9a963b4f1c4cb738b")
        #expect(
            try NaasehCrypto.aesGCMOpen(
                sealed,
                key: Data(repeating: 0, count: 32),
                authenticatedData: Data()
            ).isEmpty
        )
    }

    @Test("HKDF-SHA256 matches RFC 5869 test case 1")
    func hkdfVector() throws {
        let output = try NaasehCrypto.hkdfSHA256(
            inputKeyMaterial: Data(hex: String(repeating: "0b", count: 22)),
            salt: Data(hex: "000102030405060708090a0b0c"),
            info: Data(hex: "f0f1f2f3f4f5f6f7f8f9"),
            outputByteCount: 42
        )
        #expect(
            output.hex
                == "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
        )
    }

    @Test("Argon2id matches the Node implementation")
    func argon2idVector() throws {
        let result = try NaasehCrypto.argon2id(
            password: Data("password".utf8),
            salt: Data("somesalt".utf8),
            iterations: 3,
            memoryKiB: 32,
            parallelism: 1,
            outputByteCount: 32
        )
        #expect(result.hex == "6d4c5fa26a057c23e3a4f72ae34c64e71398c851f2c79464e3e670ed41b543f9")
    }

    @Test("RSA-OAEP-SHA256 wraps and unwraps recovery material")
    func rsaOAEP() throws {
        let fixture = try AppleFixtureLoader.decode(
            RSAFixture.self,
            at: "crypto/rsa-oaep-fixture.json"
        )
        let publicAttributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPublic,
            kSecAttrKeySizeInBits: 2048,
        ]
        let privateAttributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits: 2048,
        ]
        var keyError: Unmanaged<CFError>?
        let publicData = try #require(Data(base64Encoded: fixture.publicKey))
        let privateData = try #require(Data(base64Encoded: fixture.privateKey))
        let publicKey = try #require(
            SecKeyCreateWithData(
                publicData as CFData,
                publicAttributes as CFDictionary,
                &keyError
            )
        )
        let privateKey = try #require(
            SecKeyCreateWithData(
                privateData as CFData,
                privateAttributes as CFDictionary,
                &keyError
            )
        )
        let plaintext = Data("recovery-key-material".utf8)
        let wrapped = try NaasehCrypto.rsaOAEPWrap(plaintext, publicKey: publicKey)
        #expect(try NaasehCrypto.rsaOAEPUnwrap(wrapped, privateKey: privateKey) == plaintext)
    }

    @Test("base64url is unpadded and rejects malformed input")
    func base64URL() throws {
        #expect(NaasehCrypto.base64URLEncode(Data([0xfb, 0xff])) == "-_8")
        #expect(try NaasehCrypto.base64URLDecode("-_8") == Data([0xfb, 0xff]))
        #expect(throws: NaasehCryptoError.self) { try NaasehCrypto.base64URLDecode("***") }
    }
}

private struct RSAFixture: Decodable {
    let privateKey: String
    let publicKey: String
}

private extension Data {
    init(hex: String) {
        self.init(stride(from: 0, to: hex.count, by: 2).map { offset in
            let start = hex.index(hex.startIndex, offsetBy: offset)
            return UInt8(hex[start ..< hex.index(start, offsetBy: 2)], radix: 16)!
        })
    }

    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
