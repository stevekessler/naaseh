import Foundation
import Security

public enum NativeTelemetryKeyStore {
    private static let service = "link.thepandas.naaseh.telemetryKey"
    private static let account = "device"

    public static func loadOrCreate() throws -> Data {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrSynchronizable: kCFBooleanFalse as Any,
            kSecReturnData: kCFBooleanTrue as Any,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let lookup = SecItemCopyMatching(query as CFDictionary, &item)
        if lookup == errSecSuccess, let key = item as? Data, key.count == 32 { return key }
        guard lookup == errSecItemNotFound else { throw SecureAccountStoreError.keychain(lookup) }

        var key = Data(repeating: 0, count: 32)
        let random = key.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
        }
        guard random == errSecSuccess else { throw SecureAccountStoreError.keychain(random) }
        var insert = query
        insert.removeValue(forKey: kSecReturnData)
        insert.removeValue(forKey: kSecMatchLimit)
        insert[kSecValueData] = key
        insert[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let saved = SecItemAdd(insert as CFDictionary, nil)
        if saved == errSecDuplicateItem {
            return try loadOrCreate()
        }
        guard saved == errSecSuccess else { throw SecureAccountStoreError.keychain(saved) }
        return key
    }
}
