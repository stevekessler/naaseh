import Foundation
import NaasehCrypto
import Security

public struct HiddenMemoArgon2Configuration: Sendable {
    public let iterations: UInt32
    public let memoryKiB: UInt32
    public let parallelism: UInt32

    public static let production = Self(iterations: 3, memoryKiB: 65_536, parallelism: 1)
    public static let testing = Self(iterations: 1, memoryKiB: 32, parallelism: 1)
}

public struct HiddenMemoPinWrap: Codable, Equatable, Sendable {
    public let version: String
    public let algorithm: String
    public let ciphertext: String
}

public struct HiddenMemoRecoveryWrap: Codable, Equatable, Sendable {
    public let keyVersion: String
    public let authority: String
    public let kmsKeyId: String
    public let algorithm: String
    public let ciphertext: String
}

public struct HiddenMemoPackage: Codable, Equatable, Sendable {
    public let version: Int
    public let taskId: String
    public let memoId: String
    public var ciphertext: String
    public var iv: String
    public let aad: String
    public let pinSalt: String
    public let pinWrap: HiddenMemoPinWrap
    public let recoveryWraps: [HiddenMemoRecoveryWrap]
    public let createdAt: String
    public var updatedAt: String
}

public enum HiddenMemoError: Error, Equatable, Sendable {
    case invalidPIN
    case locked
    case malformedPackage
    case recoveryUnavailable
}

public struct HiddenMemoRecoveryKey: @unchecked Sendable {
    fileprivate let value: SecKey
    public init(_ value: SecKey) { self.value = value }
}

public actor HiddenMemoService {
    private let argon2: HiddenMemoArgon2Configuration
    private var keys: [String: SecureBytes] = [:]
    private var textByMemoID: [String: String] = [:]

    public init(argon2: HiddenMemoArgon2Configuration = .production) {
        self.argon2 = argon2
    }

    public func create(
        taskID: String,
        memoID: String,
        text: String,
        pin: String,
        recoveryPublicKey: HiddenMemoRecoveryKey? = nil,
        now: Date = Date()
    ) throws -> HiddenMemoPackage {
        guard text.count <= 20_000 else { throw TaskValidationError.memoTooLong }
        let dek = try randomData(count: 32)
        let salt = try randomData(count: 16)
        let aad = "naaseh:hidden-memo:1:\(taskID):\(memoID)"
        let memoBox = try seal(Data(text.utf8), key: dek, aad: Data(aad.utf8))
        let pinKey = try derive(pin: pin, salt: salt)
        let pinBox = try seal(dek, key: pinKey, aad: Data("naaseh:hidden-memo:pin-wrap:pin-v1:\(memoID)".utf8))
        var recovery: [HiddenMemoRecoveryWrap] = []
        if let recoveryPublicKey {
            recovery.append(
                .init(
                    keyVersion: "memo-v1",
                    authority: "recovery",
                    kmsKeyId: "device-recovery-key",
                    algorithm: "RSA-OAEP-256",
                    ciphertext: NaasehCrypto.base64URLEncode(try NaasehCrypto.rsaOAEPWrap(dek, publicKey: recoveryPublicKey.value))
                )
            )
        }
        let timestamp = ISO8601DateFormatter().string(from: now)
        return HiddenMemoPackage(
            version: 1,
            taskId: taskID,
            memoId: memoID,
            ciphertext: (memoBox.ciphertext + memoBox.tag).base64EncodedString(),
            iv: memoBox.nonce.base64EncodedString(),
            aad: aad,
            pinSalt: salt.base64EncodedString(),
            pinWrap: .init(
                version: "pin-v1",
                algorithm: "AES-256-GCM",
                ciphertext: (pinBox.nonce + pinBox.ciphertext + pinBox.tag).base64EncodedString()
            ),
            recoveryWraps: recovery,
            createdAt: timestamp,
            updatedAt: timestamp
        )
    }

    public func unlock(_ package: HiddenMemoPackage, pin: String) throws -> String {
        do {
            guard let salt = Data(base64Encoded: package.pinSalt),
                  let wrapped = Data(base64Encoded: package.pinWrap.ciphertext),
                  wrapped.count >= 28
            else { throw HiddenMemoError.malformedPackage }
            let pinKey = try derive(pin: pin, salt: salt)
            let dek = try openPacked(
                wrapped,
                key: pinKey,
                aad: Data("naaseh:hidden-memo:pin-wrap:\(package.pinWrap.version):\(package.memoId)".utf8),
                nonceIsPrefixed: true
            )
            let text = try decryptText(package, dek: dek)
            keys[package.memoId]?.zeroize()
            keys[package.memoId] = SecureBytes(dek)
            textByMemoID[package.memoId] = text
            return text
        } catch let error as HiddenMemoError {
            throw error
        } catch {
            throw HiddenMemoError.invalidPIN
        }
    }

    public func recover(_ package: HiddenMemoPackage, privateKey: HiddenMemoRecoveryKey) throws -> String {
        guard let wrap = package.recoveryWraps.first(where: { $0.authority == "recovery" }),
              let ciphertext = try? NaasehCrypto.base64URLDecode(wrap.ciphertext)
        else { throw HiddenMemoError.recoveryUnavailable }
        let dek = try NaasehCrypto.rsaOAEPUnwrap(ciphertext, privateKey: privateKey.value)
        let text = try decryptText(package, dek: dek)
        keys[package.memoId]?.zeroize()
        keys[package.memoId] = SecureBytes(dek)
        textByMemoID[package.memoId] = text
        return text
    }

    public func edit(_ package: HiddenMemoPackage, text: String, now: Date = Date()) throws -> HiddenMemoPackage {
        guard text.count <= 20_000 else { throw TaskValidationError.memoTooLong }
        guard let key = keys[package.memoId] else { throw HiddenMemoError.locked }
        let box = try key.withData {
            try seal(Data(text.utf8), key: $0, aad: Data(package.aad.utf8))
        }
        var edited = package
        edited.ciphertext = (box.ciphertext + box.tag).base64EncodedString()
        edited.iv = box.nonce.base64EncodedString()
        edited.updatedAt = ISO8601DateFormatter().string(from: now)
        textByMemoID[package.memoId] = text
        return edited
    }

    public func unlockedText(memoID: String) throws -> String {
        guard keys[memoID] != nil, let text = textByMemoID[memoID] else {
            throw HiddenMemoError.locked
        }
        return text
    }

    public func relock(memoID: String) {
        keys.removeValue(forKey: memoID)?.zeroize()
        textByMemoID.removeValue(forKey: memoID)
    }

    public func applicationDidEnterBackground() {
        for key in keys.values { key.zeroize() }
        keys.removeAll(keepingCapacity: false)
        textByMemoID.removeAll(keepingCapacity: false)
    }

    public nonisolated static func redactedSnapshotText() -> String { "Hidden memo locked" }

    private func decryptText(_ package: HiddenMemoPackage, dek: Data) throws -> String {
        guard package.aad == "naaseh:hidden-memo:1:\(package.taskId):\(package.memoId)",
              let iv = Data(base64Encoded: package.iv),
              let packed = Data(base64Encoded: package.ciphertext),
              packed.count >= 16
        else { throw HiddenMemoError.malformedPackage }
        let plaintext = try NaasehCrypto.aesGCMOpen(
            .init(nonce: iv, ciphertext: Data(packed.dropLast(16)), tag: Data(packed.suffix(16))),
            key: dek,
            authenticatedData: Data(package.aad.utf8)
        )
        guard let text = String(data: plaintext, encoding: .utf8) else {
            throw HiddenMemoError.malformedPackage
        }
        return text
    }

    private func derive(pin: String, salt: Data) throws -> Data {
        try NaasehCrypto.argon2id(
            password: Data(pin.utf8),
            salt: salt,
            iterations: argon2.iterations,
            memoryKiB: argon2.memoryKiB,
            parallelism: argon2.parallelism,
            outputByteCount: 32
        )
    }

    private func seal(_ plaintext: Data, key: Data, aad: Data) throws -> NaasehCrypto.AESGCMSealedBox {
        try NaasehCrypto.aesGCMSeal(
            plaintext: plaintext,
            key: key,
            nonce: randomData(count: 12),
            authenticatedData: aad
        )
    }

    private func openPacked(_ packed: Data, key: Data, aad: Data, nonceIsPrefixed: Bool) throws -> Data {
        guard nonceIsPrefixed, packed.count >= 28 else { throw HiddenMemoError.malformedPackage }
        return try NaasehCrypto.aesGCMOpen(
            .init(
                nonce: Data(packed.prefix(12)),
                ciphertext: Data(packed.dropFirst(12).dropLast(16)),
                tag: Data(packed.suffix(16))
            ),
            key: key,
            authenticatedData: aad
        )
    }

    private func randomData(count: Int) throws -> Data {
        var data = Data(repeating: 0, count: count)
        let status = data.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!)
        }
        guard status == errSecSuccess else { throw HiddenMemoError.malformedPackage }
        return data
    }
}
