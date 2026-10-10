import CryptoKit
import Foundation
import NaasehCrypto
import Security

public struct JournalArgon2Parameters: Codable, Equatable, Sendable {
    public let memoryKiB: UInt32
    public let iterations: UInt32
    public let parallelism: UInt32
    public static let production = Self(memoryKiB: 65_536, iterations: 3, parallelism: 1)
    public static let testing = Self(memoryKiB: 8, iterations: 1, parallelism: 1)
}

public struct JournalCiphertextEnvelope: Codable, Equatable, Sendable {
    public let recordKind: String
    public let schemaVersion: Int
    public let keyVersion: Int
    public let iv: String
    public let ciphertext: String
    public let byteSize: Int
}

public struct JournalOwnerWrap: Codable, Equatable, Sendable {
    public let algorithm: String
    public let salt: String
    public let parameters: JournalArgon2Parameters
    public let iv: String
    public let ciphertext: String
    public init(salt: String, parameters: JournalArgon2Parameters, iv: String, ciphertext: String) {
        algorithm = "ARGON2ID-AES-256-GCM"; self.salt = salt; self.parameters = parameters; self.iv = iv; self.ciphertext = ciphertext
    }
}

public struct JournalRecoveryWrap: Codable, Equatable, Sendable {
    public let algorithm: String
    public let authority: String
    public let keyVersion: Int
    public let ciphertext: String
    public init(keyVersion: Int, ciphertext: String) {
        algorithm = "RSA-OAEP-256"; authority = "recovery"; self.keyVersion = keyVersion; self.ciphertext = ciphertext
    }
}

public struct JournalKeyEnvelope: Codable, Equatable, Sendable {
    public let id: String
    public let ownerID: String
    public let version: Int
    public let keyVersion: Int
    public let ownerWrap: JournalOwnerWrap
    public let recoveryWrap: JournalRecoveryWrap
    public let createdAt: Date
    public let updatedAt: Date
    public init(ownerID: String, version: Int, keyVersion: Int, ownerWrap: JournalOwnerWrap, recoveryWrap: JournalRecoveryWrap, createdAt: Date, updatedAt: Date) {
        id = "journal-key"; self.ownerID = ownerID; self.version = version; self.keyVersion = keyVersion
        self.ownerWrap = ownerWrap; self.recoveryWrap = recoveryWrap; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}

public struct JournalEncryptedEntry: Codable, Equatable, Sendable {
    public let entryID: String
    public let dateToken: String
    public let projection: JournalCiphertextEnvelope
    public let body: JournalCiphertextEnvelope
}

public enum JournalCryptoError: Error, Equatable, Sendable {
    case locked, invalidEnvelope, invalidPIN, oversizedRecord
}

public struct JournalRecoveryKey: @unchecked Sendable {
    public let value: SecKey
    public init(_ value: SecKey) { self.value = value }
}

public actor JournalCryptoService {
    private var masterKey: SecureBytes?
    private var keyVersion = 1

    public init() {}

    public func configure(
        ownerID: String,
        pin: String,
        recoveryPublicKey: JournalRecoveryKey,
        parameters: JournalArgon2Parameters = .production,
        now: Date = Date()
    ) throws -> JournalKeyEnvelope {
        let jmk = try randomData(count: 32)
        let salt = try randomData(count: 16)
        let pinKey = try derivePINKey(pin: pin, salt: salt, parameters: parameters)
        let nonce = try randomData(count: 12)
        let aad = Data("journal|\(ownerID)|journal-key|owner-wrap|1".utf8)
        let sealed = try NaasehCrypto.aesGCMSeal(plaintext: jmk, key: pinKey, nonce: nonce, authenticatedData: aad)
        let recovery = try NaasehCrypto.rsaOAEPWrap(jmk, publicKey: recoveryPublicKey.value)
        masterKey?.zeroize()
        masterKey = SecureBytes(jmk)
        keyVersion = 1
        return JournalKeyEnvelope(
            ownerID: ownerID,
            version: 1,
            keyVersion: 1,
            ownerWrap: .init(
                salt: NaasehCrypto.base64URLEncode(salt), parameters: parameters,
                iv: NaasehCrypto.base64URLEncode(nonce),
                ciphertext: NaasehCrypto.base64URLEncode(sealed.ciphertext + sealed.tag)
            ),
            recoveryWrap: .init(keyVersion: 1, ciphertext: NaasehCrypto.base64URLEncode(recovery)),
            createdAt: now,
            updatedAt: now
        )
    }

    public func unlock(_ envelope: JournalKeyEnvelope, pin: String) throws {
        let salt = try NaasehCrypto.base64URLDecode(envelope.ownerWrap.salt)
        let nonce = try NaasehCrypto.base64URLDecode(envelope.ownerWrap.iv)
        let combined = try NaasehCrypto.base64URLDecode(envelope.ownerWrap.ciphertext)
        guard combined.count > 16 else { throw JournalCryptoError.invalidEnvelope }
        let key = try derivePINKey(pin: pin, salt: salt, parameters: envelope.ownerWrap.parameters)
        do {
            let plaintext = try NaasehCrypto.aesGCMOpen(
                .init(nonce: nonce, ciphertext: combined.dropLast(16), tag: combined.suffix(16)),
                key: key,
                authenticatedData: Data("journal|\(envelope.ownerID)|journal-key|owner-wrap|1".utf8)
            )
            guard plaintext.count == 32 else { throw JournalCryptoError.invalidEnvelope }
            masterKey?.zeroize(); masterKey = SecureBytes(plaintext); keyVersion = envelope.keyVersion
        } catch { throw JournalCryptoError.invalidPIN }
    }

    public func recover(_ envelope: JournalKeyEnvelope, recoveryPrivateKey: JournalRecoveryKey) throws {
        let wrapped = try NaasehCrypto.base64URLDecode(envelope.recoveryWrap.ciphertext)
        let value = try NaasehCrypto.rsaOAEPUnwrap(wrapped, privateKey: recoveryPrivateKey.value)
        guard value.count == 32 else { throw JournalCryptoError.invalidEnvelope }
        masterKey?.zeroize(); masterKey = SecureBytes(value); keyVersion = envelope.keyVersion
    }

    public func rotate(
        _ current: JournalKeyEnvelope,
        pin: String,
        recoveryPublicKey: JournalRecoveryKey,
        parameters: JournalArgon2Parameters = .production,
        now: Date = Date()
    ) throws -> JournalKeyEnvelope {
        let base = try configure(
            ownerID: current.ownerID, pin: pin, recoveryPublicKey: recoveryPublicKey,
            parameters: parameters, now: now
        )
        let nextKeyVersion = current.keyVersion + 1
        keyVersion = nextKeyVersion
        return JournalKeyEnvelope(
            ownerID: current.ownerID, version: current.version + 1, keyVersion: nextKeyVersion,
            ownerWrap: base.ownerWrap,
            recoveryWrap: .init(keyVersion: nextKeyVersion, ciphertext: base.recoveryWrap.ciphertext),
            createdAt: current.createdAt, updatedAt: now
        )
    }

    public nonisolated static func verifyRecoveryRegistry(
        canonicalPayload: Data,
        signature: Data,
        signingPublicKey: JournalRecoveryKey
    ) -> Bool {
        guard SecKeyIsAlgorithmSupported(signingPublicKey.value, .verify, .rsaSignatureMessagePSSSHA256) else { return false }
        var error: Unmanaged<CFError>?
        return SecKeyVerifySignature(
            signingPublicKey.value, .rsaSignatureMessagePSSSHA256,
            canonicalPayload as CFData, signature as CFData, &error
        )
    }

    public func sealEntry<Projection: Codable & Sendable, Body: Codable & Sendable>(
        ownerID: String,
        entryID: String,
        localDate: String,
        projection: Projection,
        body: Body
    ) throws -> JournalEncryptedEntry {
        let token = try dateToken(ownerID: ownerID, localDate: localDate)
        return try .init(
            entryID: entryID,
            dateToken: token,
            projection: seal(projection, ownerID: ownerID, recordID: entryID, kind: "projection", dateToken: token),
            body: seal(body, ownerID: ownerID, recordID: entryID, kind: "body", dateToken: token)
        )
    }

    public func open<Value: Decodable & Sendable>(
        _ type: Value.Type,
        envelope: JournalCiphertextEnvelope,
        ownerID: String,
        recordID: String,
        dateToken: String? = nil
    ) throws -> Value {
        let key = try requiredKey()
        let nonce = try NaasehCrypto.base64URLDecode(envelope.iv)
        let combined = try NaasehCrypto.base64URLDecode(envelope.ciphertext)
        guard combined.count > 16 else { throw JournalCryptoError.invalidEnvelope }
        let plaintext = try NaasehCrypto.aesGCMOpen(
            .init(nonce: nonce, ciphertext: combined.dropLast(16), tag: combined.suffix(16)),
            key: key,
            authenticatedData: aad(ownerID: ownerID, recordID: recordID, kind: envelope.recordKind, dateToken: dateToken)
        )
        return try JSONDecoder().decode(type, from: plaintext)
    }

    public func crisisPlanKey(ownerID: String, planID: String, generation: Int) throws -> Data {
        try NaasehCrypto.hkdfSHA256(
            inputKeyMaterial: requiredKey(), salt: NaasehCrypto.sha256(Data(planID.utf8)),
            info: Data("crisis-plan|\(ownerID)|\(planID)|\(generation)".utf8), outputByteCount: 32
        )
    }

    public func lock() { masterKey?.zeroize(); masterKey = nil }
    public func applicationDidEnterBackground() { lock() }

    private func seal<Value: Codable>(
        _ value: Value, ownerID: String, recordID: String, kind: String, dateToken: String?
    ) throws -> JournalCiphertextEnvelope {
        let plaintext = try JSONEncoder().encode(value)
        guard plaintext.count <= 307_200 else { throw JournalCryptoError.oversizedRecord }
        let nonce = try randomData(count: 12)
        let sealed = try NaasehCrypto.aesGCMSeal(
            plaintext: plaintext, key: requiredKey(), nonce: nonce,
            authenticatedData: aad(ownerID: ownerID, recordID: recordID, kind: kind, dateToken: dateToken)
        )
        return .init(
            recordKind: kind, schemaVersion: 1, keyVersion: keyVersion,
            iv: NaasehCrypto.base64URLEncode(nonce),
            ciphertext: NaasehCrypto.base64URLEncode(sealed.ciphertext + sealed.tag),
            byteSize: plaintext.count
        )
    }

    private func dateToken(ownerID: String, localDate: String) throws -> String {
        let key = SymmetricKey(data: try requiredKey())
        return NaasehCrypto.base64URLEncode(Data(HMAC<SHA256>.authenticationCode(
            for: Data("journal-date|\(ownerID)|\(localDate)".utf8), using: key
        )))
    }

    private func aad(ownerID: String, recordID: String, kind: String, dateToken: String?) -> Data {
        Data("journal|\(ownerID)|\(recordID)|\(kind)|1|\(keyVersion)|\(dateToken ?? "")".utf8)
    }

    private func requiredKey() throws -> Data {
        guard let masterKey else { throw JournalCryptoError.locked }
        return masterKey.withData { $0 }
    }

    private func derivePINKey(pin: String, salt: Data, parameters: JournalArgon2Parameters) throws -> Data {
        try NaasehCrypto.argon2id(
            password: Data(pin.utf8), salt: salt, iterations: parameters.iterations,
            memoryKiB: parameters.memoryKiB, parallelism: parameters.parallelism, outputByteCount: 32
        )
    }

    private func randomData(count: Int) throws -> Data {
        var data = Data(repeating: 0, count: count)
        let status = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        guard status == errSecSuccess else { throw NaasehCryptoError.securityFailure(nil) }
        return data
    }
}
