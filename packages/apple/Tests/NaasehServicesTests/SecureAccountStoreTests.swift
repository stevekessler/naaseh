import Foundation
import NaasehServices
import Testing

@Suite("Secure account store")
struct SecureAccountStoreTests {
    @Test("default Keychain policy uses the app's own access group")
    func defaultAccessGroup() async throws {
        let backend = MemorySecureItemBackend()
        let store = SecureAccountStore(backend: backend)
        try await store.save(.sessionCookie, Data("session".utf8), accountID: "u1")
        #expect(await backend.lastPolicy?.accessGroup == nil)
    }

    @Test("secrets are device-only, access-controlled, and account-partitioned")
    func accessPolicy() async throws {
        let backend = MemorySecureItemBackend()
        let store = SecureAccountStore(backend: backend, accessGroup: "group.link.thepandas.naaseh")
        try await store.save(.sessionCookie, Data("session".utf8), accountID: "u1")
        #expect(try await store.load(.sessionCookie, accountID: "u1") == Data("session".utf8))
        #expect(try await store.load(.sessionCookie, accountID: "u2") == nil)
        let policy = await backend.lastPolicy
        #expect(policy?.synchronizable == false)
        #expect(policy?.accessibility == .afterFirstUnlockThisDeviceOnly)
        #expect(policy?.requiresUserPresence == false)
    }

    @Test("root keys require user presence and missing keys fail closed")
    func rootKeyPolicy() async throws {
        let backend = MemorySecureItemBackend()
        let store = SecureAccountStore(backend: backend, accessGroup: "group.link.thepandas.naaseh")
        try await store.save(.deviceRootKey, Data(repeating: 1, count: 32), accountID: "u1")
        #expect(await backend.lastPolicy?.requiresUserPresence == true)
        await backend.remove(service: "link.thepandas.naaseh.deviceRootKey", account: "u1")
        await #expect(throws: SecureAccountStoreError.missingRootKey) {
            _ = try await store.requireRootKey(accountID: "u1")
        }
    }

    @Test("account and purpose derivation is deterministic and isolated")
    func derivation() async throws {
        let backend = MemorySecureItemBackend()
        let store = SecureAccountStore(backend: backend, accessGroup: "group.link.thepandas.naaseh")
        try await store.save(.deviceRootKey, Data(repeating: 3, count: 32), accountID: "u1")
        let first = try await store.derivedAccountKey(accountID: "u1", purpose: "records")
        let second = try await store.derivedAccountKey(accountID: "u1", purpose: "records")
        let telemetry = try await store.derivedAccountKey(accountID: "u1", purpose: "telemetry")
        let firstData = first.withData { $0 }
        #expect(firstData == second.withData { $0 })
        #expect(firstData != telemetry.withData { $0 })
        first.zeroize()
        #expect(first.withData { $0.isEmpty })
    }

    @Test("purge removes every secret for only the selected account")
    func purge() async throws {
        let backend = MemorySecureItemBackend()
        let store = SecureAccountStore(backend: backend, accessGroup: "group.link.thepandas.naaseh")
        for account in ["u1", "u2"] {
            try await store.save(.sessionCookie, Data(account.utf8), accountID: account)
            try await store.save(.csrfToken, Data(account.utf8), accountID: account)
        }
        try await store.purge(accountID: "u1")
        #expect(try await store.load(.sessionCookie, accountID: "u1") == nil)
        #expect(try await store.load(.csrfToken, accountID: "u2") != nil)
    }
}
