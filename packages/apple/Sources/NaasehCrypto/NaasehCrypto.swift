import CArgon2
import CryptoKit
import Foundation
import Security

public enum NaasehCrypto {
    public struct AESGCMSealedBox: Equatable, Sendable {
        public let nonce: Data
        public let ciphertext: Data
        public let tag: Data

        public init(nonce: Data, ciphertext: Data, tag: Data) {
            self.nonce = nonce
            self.ciphertext = ciphertext
            self.tag = tag
        }
    }

    public static func aesGCMSeal(
        plaintext: Data,
        key: Data,
        nonce: Data,
        authenticatedData: Data
    ) throws -> AESGCMSealedBox {
        guard key.count == 32, nonce.count == 12 else { throw NaasehCryptoError.invalidInput }
        let symmetricKey = SymmetricKey(data: key)
        let cryptoNonce = try AES.GCM.Nonce(data: nonce)
        let sealed = try AES.GCM.seal(
            plaintext,
            using: symmetricKey,
            nonce: cryptoNonce,
            authenticating: authenticatedData
        )
        return AESGCMSealedBox(nonce: nonce, ciphertext: sealed.ciphertext, tag: sealed.tag)
    }

    public static func aesGCMOpen(
        _ box: AESGCMSealedBox,
        key: Data,
        authenticatedData: Data
    ) throws -> Data {
        guard key.count == 32, box.nonce.count == 12, box.tag.count == 16 else {
            throw NaasehCryptoError.invalidInput
        }
        do {
            let sealed = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: box.nonce),
                ciphertext: box.ciphertext,
                tag: box.tag
            )
            return try AES.GCM.open(
                sealed,
                using: SymmetricKey(data: key),
                authenticating: authenticatedData
            )
        } catch {
            throw NaasehCryptoError.authenticationFailed
        }
    }

    public static func hkdfSHA256(
        inputKeyMaterial: Data,
        salt: Data,
        info: Data,
        outputByteCount: Int
    ) throws -> Data {
        guard outputByteCount > 0, outputByteCount <= 255 * 32 else {
            throw NaasehCryptoError.invalidInput
        }
        let key = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: inputKeyMaterial),
            salt: salt,
            info: info,
            outputByteCount: outputByteCount
        )
        return key.withUnsafeBytes { Data($0) }
    }

    public static func sha256(_ data: Data) -> Data {
        Data(SHA256.hash(data: data))
    }

    public static func argon2id(
        password: Data,
        salt: Data,
        iterations: UInt32,
        memoryKiB: UInt32,
        parallelism: UInt32,
        outputByteCount: Int
    ) throws -> Data {
        guard !password.isEmpty, salt.count >= 8, iterations > 0, memoryKiB >= 8,
              parallelism > 0, outputByteCount >= 16, outputByteCount <= 64
        else {
            throw NaasehCryptoError.invalidInput
        }

        var output = Data(repeating: 0, count: outputByteCount)
        let result = password.withUnsafeBytes { passwordBytes in
            salt.withUnsafeBytes { saltBytes in
                output.withUnsafeMutableBytes { outputBytes in
                    argon2id_hash_raw(
                        iterations,
                        memoryKiB,
                        parallelism,
                        passwordBytes.baseAddress,
                        password.count,
                        saltBytes.baseAddress,
                        salt.count,
                        outputBytes.baseAddress,
                        outputByteCount
                    )
                }
            }
        }
        guard result == ARGON2_OK.rawValue else {
            output.resetBytes(in: output.startIndex ..< output.endIndex)
            throw NaasehCryptoError.argon2Failure(result)
        }
        return output
    }

    public static func rsaOAEPWrap(_ plaintext: Data, publicKey: SecKey) throws -> Data {
        try rsaOperation(plaintext, key: publicKey, algorithm: .rsaEncryptionOAEPSHA256, encrypt: true)
    }

    public static func rsaOAEPUnwrap(_ ciphertext: Data, privateKey: SecKey) throws -> Data {
        try rsaOperation(
            ciphertext,
            key: privateKey,
            algorithm: .rsaEncryptionOAEPSHA256,
            encrypt: false
        )
    }

    public static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func base64URLDecode(_ value: String) throws -> Data {
        guard value.range(of: #"^[A-Za-z0-9_-]*$"#, options: .regularExpression) != nil else {
            throw NaasehCryptoError.invalidInput
        }
        var standard = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
        guard let decoded = Data(base64Encoded: standard) else { throw NaasehCryptoError.invalidInput }
        return decoded
    }

    private static func rsaOperation(
        _ input: Data,
        key: SecKey,
        algorithm: SecKeyAlgorithm,
        encrypt: Bool
    ) throws -> Data {
        let supported = encrypt
            ? SecKeyIsAlgorithmSupported(key, .encrypt, algorithm)
            : SecKeyIsAlgorithmSupported(key, .decrypt, algorithm)
        guard supported else { throw NaasehCryptoError.unsupportedKey }

        var error: Unmanaged<CFError>?
        let result = encrypt
            ? SecKeyCreateEncryptedData(key, algorithm, input as CFData, &error)
            : SecKeyCreateDecryptedData(key, algorithm, input as CFData, &error)
        guard let result else {
            throw NaasehCryptoError.securityFailure(error?.takeRetainedValue().localizedDescription)
        }
        return result as Data
    }
}

public enum NaasehCryptoError: Error, Equatable, Sendable {
    case invalidInput
    case authenticationFailed
    case argon2Failure(Int32)
    case unsupportedKey
    case securityFailure(String?)
}

public final class SecureBytes: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [UInt8]

    public init(_ data: Data) {
        storage = Array(data)
    }

    public func withData<Result>(_ body: (Data) throws -> Result) rethrows -> Result {
        try lock.withLock { try body(Data(storage)) }
    }

    public func zeroize() {
        lock.withLock {
            storage.withUnsafeMutableBytes { bytes in
                guard let address = bytes.baseAddress else { return }
                memset_s(address, bytes.count, 0, bytes.count)
            }
            storage.removeAll(keepingCapacity: false)
        }
    }

    deinit { zeroize() }
}

public enum ProtectedDataExclusion: String, CaseIterable, Sendable {
    case logs
    case crashReports
    case URLs
    case clipboard
    case notifications
    case siriOutput
    case spotlight
    case previews
    case feedback
}
