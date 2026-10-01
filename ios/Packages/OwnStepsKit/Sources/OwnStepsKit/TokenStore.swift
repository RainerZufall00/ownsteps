import Foundation
import Security

/// Where tokens live. The Keychain in the app; tests use the in-memory one.
public protocol TokenStore: Sendable {
    func token(for accountID: UUID) throws -> String?
    func setToken(_ token: String, for accountID: UUID) throws
    func removeToken(for accountID: UUID) throws
}

public struct KeychainError: Error, Equatable {
    public let status: OSStatus
}

/// Tokens in the Keychain, readable only while the device is unlocked once
/// after boot – background refresh must work with the screen locked.
public struct KeychainTokenStore: TokenStore {
    let service: String
    /// Shared with the Share Extension. Nil, or a group the build isn't
    /// entitled to, keeps tokens in the app's own group.
    let accessGroup: String?

    public init(service: String = "ownsteps.tokens", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    /// Without a group, a query matches the item in whichever group it is.
    private func query(for accountID: UUID, group: String? = nil) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountID.uuidString,
        ]
        if let group { query[kSecAttrAccessGroup as String] = group }
        return query
    }

    public func token(for accountID: UUID) throws -> String? {
        var search = query(for: accountID)
        search[kSecReturnData as String] = true
        search[kSecReturnAttributes as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(search as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let item = result as? [String: Any],
              let data = item[kSecValueData as String] as? Data,
              let token = String(data: data, encoding: .utf8)
        else { throw KeychainError(status: status) }

        // Saved before the extension existed: move it where the extension
        // can read it too.
        if let accessGroup, let group = item[kSecAttrAccessGroup as String] as? String, group != accessGroup,
           add(token, for: accountID, group: accessGroup) == errSecSuccess
        {
            SecItemDelete(query(for: accountID, group: group) as CFDictionary)
        }
        return token
    }

    public func setToken(_ token: String, for accountID: UUID) throws {
        try removeToken(for: accountID)
        var status = add(token, for: accountID, group: accessGroup)
        if status == errSecMissingEntitlement, accessGroup != nil {
            // Built without the shared keychain group.
            status = add(token, for: accountID, group: nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    private func add(_ token: String, for accountID: UUID, group: String?) -> OSStatus {
        var item = query(for: accountID, group: group)
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil)
    }

    /// Removes the token from every group it might be in.
    public func removeToken(for accountID: UUID) throws {
        let status = SecItemDelete(query(for: accountID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status)
        }
    }
}

public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private var tokens: [UUID: String] = [:]
    private let lock = NSLock()

    public init() {}

    public func token(for accountID: UUID) throws -> String? {
        lock.withLock { tokens[accountID] }
    }

    public func setToken(_ token: String, for accountID: UUID) throws {
        lock.withLock { tokens[accountID] = token }
    }

    public func removeToken(for accountID: UUID) throws {
        _ = lock.withLock { tokens.removeValue(forKey: accountID) }
    }
}
