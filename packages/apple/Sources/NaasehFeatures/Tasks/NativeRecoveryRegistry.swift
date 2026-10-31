import Foundation
import NaasehContracts
import NaasehCrypto
import Security

public struct NativeMemoRecoveryRecipient: @unchecked Sendable {
    public let keyID: String
    public let version: String
    public let key: SecKey
    public init(keyID: String, version: String, key: SecKey) { self.keyID = keyID; self.version = version; self.key = key }
}

public enum NativeRSAKeys {
    public static func publicKey(spki: Data) throws -> SecKey {
        // SubjectPublicKeyInfo: SEQUENCE { AlgorithmIdentifier, BIT STRING RSAPublicKey }.
        let bytes = [UInt8](spki)
        func read(_ cursor: inout Int, expected: UInt8) throws -> Range<Int> {
            guard cursor + 2 <= bytes.count, bytes[cursor] == expected else { throw HiddenMemoError.malformedPackage }
            cursor += 1; let lead = Int(bytes[cursor]); cursor += 1
            var length = lead
            if lead & 0x80 != 0 {
                let count = lead & 0x7f
                guard count > 0, count <= 4, cursor + count <= bytes.count else { throw HiddenMemoError.malformedPackage }
                length = 0
                for _ in 0..<count { length = length * 256 + Int(bytes[cursor]); cursor += 1 }
            }
            guard length <= bytes.count - cursor else { throw HiddenMemoError.malformedPackage }
            let range = cursor..<cursor + length; cursor += length
            return range
        }
        var cursor = 0; let sequence = try read(&cursor, expected: 0x30)
        guard cursor == bytes.count else { throw HiddenMemoError.malformedPackage }
        cursor = sequence.lowerBound
        _ = try read(&cursor, expected: 0x30)
        let bitString = try read(&cursor, expected: 0x03)
        guard bitString.count > 1, bytes[bitString.lowerBound] == 0, cursor == sequence.upperBound else { throw HiddenMemoError.malformedPackage }
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateWithData(Data(bytes[(bitString.lowerBound + 1)..<bitString.upperBound]) as CFData,
            [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic] as CFDictionary, &error) else {
            throw HiddenMemoError.malformedPackage
        }
        return key
    }
    public static func ephemeral() throws -> (privateKey: SecKey, spki: Data) {
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey([kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeySizeInBits: 2048,
                                               kSecPrivateKeyAttrs: [kSecAttrIsPermanent: false]] as CFDictionary, &error),
              let publicKey = SecKeyCopyPublicKey(key), let der = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            throw HiddenMemoError.recoveryUnavailable
        }
        func tlv(_ tag: UInt8, _ body: Data) -> Data {
            let length = body.count
            let prefix: [UInt8] = length < 128 ? [UInt8(length)] : [0x82, UInt8((length >> 8) & 255), UInt8(length & 255)]
            return Data([tag] + prefix) + body
        }
        let algorithm = Data([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00])
        return (key, tlv(0x30, algorithm + tlv(0x03, Data([0]) + der)))
    }
}

public enum NativeRecoveryRegistry {
    public static func recipients(_ registry: JSONValue, now: Date = Date()) throws -> [NativeMemoRecoveryRecipient] {
        guard case var .object(fields) = registry,
              fields["schema"] == .string("naaseh-recovery-key-registry/v1"), fields["region"] == .string("us-west-2"),
              case let .string(signature) = fields.removeValue(forKey: "signature"), let signatureData = Data(base64Encoded: signature),
              case let .string(signingSPKI) = fields["signingPublicKeySpki"], let signingData = Data(base64Encoded: signingSPKI),
              case let .string(generated) = fields["generatedAt"], let date = NativeAccountTaskTimer.date(generated),
              date <= now.addingTimeInterval(300), date >= now.addingTimeInterval(-86400),
              case let .array(keys) = fields["keys"] else { throw HiddenMemoError.recoveryUnavailable }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let canonical = try encoder.encode(JSONValue.object(fields))
        let signer = try NativeRSAKeys.publicKey(spki: signingData)
        guard JournalCryptoService.verifyRecoveryRegistry(canonicalPayload: canonical, signature: signatureData,
                                                          signingPublicKey: JournalRecoveryKey(signer)) else { throw HiddenMemoError.recoveryUnavailable }
        let recipients = try keys.compactMap { value -> NativeMemoRecoveryRecipient? in
            guard case let .object(entry) = value, entry["state"] == .string("active") else { return nil }
            guard entry["authority"] == .string("recovery"), entry["region"] == .string("us-west-2"),
                  entry["algorithm"] == .string("RSAES_OAEP_SHA_256"),
                  case let .string(keyID) = entry["keyId"], keyID.hasPrefix("arn:aws:kms:us-west-2:"),
                  case let .number(version) = entry["version"], case let .string(spki) = entry["publicKey"], let data = Data(base64Encoded: spki) else {
                throw HiddenMemoError.recoveryUnavailable
            }
            return .init(keyID: keyID, version: "\(version)", key: try NativeRSAKeys.publicKey(spki: data))
        }
        guard !recipients.isEmpty else { throw HiddenMemoError.recoveryUnavailable }
        return recipients
    }
}
