import Foundation
import NaasehCrypto
import Security

public enum SecureItemKind: String, CaseIterable, Sendable {
    case sessionCookie, csrfToken, preAuthentication, trustedDevice, deviceRootKey, telemetryKey, offlineSession

    var service: String { "link.thepandas.naaseh.\(rawValue)" }
}

public enum SecureItemAccessibility: Sendable {
    case afterFirstUnlockThisDeviceOnly
    case whenUnlockedThisDeviceOnly
}

public struct SecureItemPolicy: Equatable, Sendable {
    public let synchronizable: Bool
    public let accessibility: SecureItemAccessibility
    public let requiresUserPresence: Bool
    public let accessGroup: String?
}

public protocol SecureItemBackend: Sendable {
    func save(data: Data, service: String, account: String, policy: SecureItemPolicy) async throws
    func load(service: String, account: String) async throws -> Data?
    func remove(service: String, account: String) async throws
}

public enum SecureAccountStoreError: Error, Equatable, Sendable {
    case keychain(OSStatus)
    case missingRootKey
}

public actor SecureAccountStore {
    private let backend: any SecureItemBackend
    private let accessGroup: String?

    public init(
        backend: any SecureItemBackend = KeychainSecureItemBackend(),
        accessGroup: String? = nil
    ) {
        self.backend = backend
        self.accessGroup = accessGroup
    }

    public func save(_ kind: SecureItemKind, _ data: Data, accountID: String) async throws {
        let requiresPresence = kind == .deviceRootKey
        try await backend.save(
            data: data,
            service: kind.service,
            account: accountID,
            policy: .init(
                synchronizable: false,
                accessibility: requiresPresence ? .whenUnlockedThisDeviceOnly : .afterFirstUnlockThisDeviceOnly,
                requiresUserPresence: requiresPresence,
                accessGroup: accessGroup
            )
        )
    }

    public func load(_ kind: SecureItemKind, accountID: String) async throws -> Data? {
        try await backend.load(service: kind.service, account: accountID)
    }

    public func requireRootKey(accountID: String) async throws -> Data {
        guard let key = try await load(.deviceRootKey, accountID: accountID), key.count == 32 else {
            throw SecureAccountStoreError.missingRootKey
        }
        return key
    }

    public func createRootKeyIfNeeded(accountID: String) async throws -> Data {
        if let existing = try await load(.deviceRootKey, accountID: accountID), existing.count == 32 {
            return existing
        }
        var bytes = Data(repeating: 0, count: 32)
        let status = bytes.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
        }
        guard status == errSecSuccess else { throw SecureAccountStoreError.keychain(status) }
        try await save(.deviceRootKey, bytes, accountID: accountID)
        return bytes
    }

    public func derivedAccountKey(accountID: String, purpose: String) async throws -> SecureBytes {
        let root = try await requireRootKey(accountID: accountID)
        defer {
            var mutable = root
            mutable.resetBytes(in: mutable.startIndex ..< mutable.endIndex)
        }
        let derived = try NaasehCrypto.hkdfSHA256(
            inputKeyMaterial: root,
            salt: NaasehCrypto.sha256(Data(accountID.utf8)),
            info: Data("naaseh:\(purpose):v1".utf8),
            outputByteCount: 32
        )
        return SecureBytes(derived)
    }

    public func saveSession(_ session: NativeAuthenticatedSession) async throws {
        try await save(.sessionCookie, Data(session.credential.cookieValue.utf8), accountID: session.user.id)
        try await save(.csrfToken, Data(session.csrfToken.utf8), accountID: session.user.id)
    }

    public struct OfflineSession: Codable, Sendable {
        public let session: NativeAuthenticatedSession
        public let validatedAt: Date
        public init(session: NativeAuthenticatedSession, validatedAt: Date) {
            self.session = session
            self.validatedAt = validatedAt
        }
    }

    // A fixed Keychain lookup permits cold offline launches without a plaintext account index.
    public func saveOfflineSession(_ value: OfflineSession) async throws {
        try await save(.offlineSession, JSONEncoder().encode(value), accountID: "active-session")
    }

    public func loadOfflineSession() async throws -> OfflineSession? {
        guard let data = try await load(.offlineSession, accountID: "active-session") else { return nil }
        return try JSONDecoder().decode(OfflineSession.self, from: data)
    }

    public func clearOfflineSession(accountID: String) async throws {
        if try await loadOfflineSession()?.session.user.id == accountID {
            try await backend.remove(service: SecureItemKind.offlineSession.service, account: "active-session")
        }
    }

    public func savePreAuthentication(_ value: String, accountID: String) async throws {
        try await save(.preAuthentication, Data(value.utf8), accountID: accountID)
    }

    public func saveTrustedDevice(_ value: String, accountID: String) async throws {
        try await save(.trustedDevice, Data(value.utf8), accountID: accountID)
    }

    public func purge(accountID: String) async throws {
        var failure: Error?
        do { try await clearOfflineSession(accountID: accountID) } catch { failure = error }
        // Continue through every item even if one Keychain deletion fails.
        let kinds = [SecureItemKind.deviceRootKey] + SecureItemKind.allCases.filter { $0 != .deviceRootKey }
        for kind in kinds {
            do { try await backend.remove(service: kind.service, account: accountID) }
            catch { failure = error }
        }
        if let failure { throw failure }
    }
}

public actor MemorySecureItemBackend: SecureItemBackend {
    private var values: [String: Data] = [:]
    public private(set) var lastPolicy: SecureItemPolicy?

    public init() {}

    public func save(data: Data, service: String, account: String, policy: SecureItemPolicy) {
        values["\(service):\(account)"] = data
        lastPolicy = policy
    }

    public func load(service: String, account: String) -> Data? { values["\(service):\(account)"] }

    public func remove(service: String, account: String) {
        values.removeValue(forKey: "\(service):\(account)")
    }
}

public actor KeychainSecureItemBackend: SecureItemBackend {
    public init() {}

    public func save(data: Data, service: String, account: String, policy: SecureItemPolicy) throws {
        try remove(service: service, account: account)
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: kCFBooleanFalse as Any,
            kSecValueData: data,
        ]
        if let accessGroup = policy.accessGroup {
            query[kSecAttrAccessGroup] = accessGroup
        }
        if policy.requiresUserPresence {
            var error: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .userPresence,
                &error
            ) else {
                throw SecureAccountStoreError.keychain(errSecParam)
            }
            query[kSecAttrAccessControl] = access
        } else {
            query[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw SecureAccountStoreError.keychain(status) }
    }

    public func load(service: String, account: String) throws -> Data? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: kCFBooleanFalse as Any,
            kSecReturnData: kCFBooleanTrue as Any,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw SecureAccountStoreError.keychain(status)
        }
        return data
    }

    public func remove(service: String, account: String) throws {
        let status = SecItemDelete([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: kSecAttrSynchronizableAny,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SecureAccountStoreError.keychain(status)
        }
    }
}
