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
    /// Shared with the Share Extension through the app group's keychain
    /// access group, once that exists.
    let accessGroup: String?

    public init(service: String = "ownsteps.tokens", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    private func query(for accountID: UUID) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountID.uuidString,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    public func token(for accountID: UUID) throws -> String? {
        var query = query(for: accountID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainError(status: status)
        }
        return String(data: data, encoding: .utf8)
    }

    public func setToken(_ token: String, for accountID: UUID) throws {
        try removeToken(for: accountID)
        var item = query(for: accountID)
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

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
