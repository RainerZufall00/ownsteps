import Foundation

/// A signed-in server, as the app remembers it. The token isn't part of it –
/// that lives in the Keychain under the account's ID.
public struct Account: Codable, Identifiable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        /// Device token: reads and writes everything on that server.
        case author
        /// Viewer token: reads one trip ([D17]). One app can follow trips on
        /// several servers.
        case viewer
    }

    public let id: UUID
    public let serverURL: URL
    public let serverName: String
    public let kind: Kind
    public var displayName: String
    public var email: String?
    /// Viewers only: the trip they follow.
    public var tripID: Int?
    /// The server's time zone from `/info` – dates and trip days are shown
    /// in it, like the web does ([E12]).
    public var timeZoneIdentifier: String?

    /// How the server is named in lists and messages.
    public var host: String { serverURL.host() ?? serverName }

    public var timeZone: TimeZone {
        timeZoneIdentifier.flatMap(TimeZone.init(identifier:)) ?? .current
    }

    /// The account's server, with its token from `tokens` – signed out if
    /// there is none.
    public func client(tokens: any TokenStore) -> ServerClient {
        ServerClient(baseURL: serverURL, token: try? tokens.token(for: id))
    }

    public init(
        id: UUID = UUID(),
        serverURL: URL,
        serverName: String,
        kind: Kind,
        displayName: String,
        email: String? = nil,
        tripID: Int? = nil,
        timeZoneIdentifier: String? = nil
    ) {
        self.id = id
        self.serverURL = serverURL
        self.serverName = serverName
        self.kind = kind
        self.displayName = displayName
        self.email = email
        self.tripID = tripID
        self.timeZoneIdentifier = timeZoneIdentifier
    }
}

/// The list of accounts, kept in UserDefaults (no secrets in there).
public struct AccountStore: Sendable {
    private let key = "accounts.v1"
    private let defaultsName: String?

    /// `suiteName` is the app group, so the Share Extension sees the accounts.
    public init(suiteName: String? = nil) {
        self.defaultsName = suiteName
    }

    private var defaults: UserDefaults {
        defaultsName.flatMap(UserDefaults.init(suiteName:)) ?? .standard
    }

    public func load() -> [Account] {
        // Saved before the app group existed: carry the list over once.
        if defaults.data(forKey: key) == nil, defaults != .standard,
           let old = UserDefaults.standard.data(forKey: key)
        {
            defaults.set(old, forKey: key)
            UserDefaults.standard.removeObject(forKey: key)
        }
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Account].self, from: data)) ?? []
    }

    public func save(_ accounts: [Account]) {
        guard let data = try? JSONEncoder().encode(accounts) else { return }
        defaults.set(data, forKey: key)
    }
}
