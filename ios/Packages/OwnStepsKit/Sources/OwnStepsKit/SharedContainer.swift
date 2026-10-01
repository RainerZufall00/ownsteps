import Foundation

/// What the app and the Share Extension share through the app group: the
/// account list, the upload folder, the inbox and the trips to choose from.
/// The identifiers come from the Info.plist (`AppGroupIdentifier`,
/// `KeychainAccessGroup`), which derives them from the bundle ID prefix.
public struct SharedContainer: Sendable {
    public let groupIdentifier: String
    public let url: URL

    public init?(groupIdentifier: String?) {
        guard let groupIdentifier, !groupIdentifier.isEmpty,
              let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier)
        else { return nil }
        self.groupIdentifier = groupIdentifier
        self.url = url
    }

    /// The app group named in the running bundle's Info.plist – nil when the
    /// build has none (e.g. a fork signed without app groups).
    public static var current: SharedContainer? {
        SharedContainer(groupIdentifier: Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier") as? String)
    }

    /// The keychain group the tokens live in, shared with the extension.
    public static var keychainAccessGroup: String? {
        (Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    public var uploadsDirectory: URL { url.appending(path: "Uploads", directoryHint: .isDirectory) }
    public var inbox: ShareInbox { ShareInbox(directory: url.appending(path: "Inbox", directoryHint: .isDirectory)) }
    public var targetsFile: URL { url.appending(path: "share-targets.json") }
    public var defaults: UserDefaults? { UserDefaults(suiteName: groupIdentifier) }

    /// Settings key: upload videos as they are instead of at 1080p ([D20]).
    /// In the shared defaults, so the Share Extension follows it too.
    public static let originalVideosKey = "uploadOriginalVideos"
}

/// The trips the Share Extension offers, as the app last saw them. The
/// extension doesn't touch the database; the app writes this file whenever
/// it refreshed the trip list.
public struct ShareTargets: Codable, Sendable, Equatable {
    public struct Trip: Codable, Sendable, Equatable, Identifiable {
        public var id: Int
        public var title: String
        public var startDate: String?
        public var endDate: String?
        /// Latest step or change – the extension offers recent trips first.
        public var lastActivity: Date

        public init(id: Int, title: String, startDate: String?, endDate: String?, lastActivity: Date) {
            self.id = id
            self.title = title
            self.startDate = startDate
            self.endDate = endDate
            self.lastActivity = lastActivity
        }
    }

    /// Trips per account ID (as string – JSON object keys).
    public var trips: [String: [Trip]]

    public init(trips: [String: [Trip]] = [:]) {
        self.trips = trips
    }

    public init(from server: [UUID: [Components.Schemas.Trip]]) {
        var trips: [String: [Trip]] = [:]
        for (accountID, list) in server {
            trips[accountID.uuidString] = list
                .map {
                    Trip(
                        id: $0.id, title: $0.title, startDate: $0.startDate, endDate: $0.endDate,
                        lastActivity: max($0.lastStepAt ?? $0.updatedAt, $0.updatedAt)
                    )
                }
                .sorted { $0.lastActivity > $1.lastActivity }
        }
        self.trips = trips
    }

    public func trips(for accountID: UUID) -> [Trip] {
        trips[accountID.uuidString] ?? []
    }

    public static func load(from url: URL) -> ShareTargets {
        guard let data = try? Data(contentsOf: url) else { return ShareTargets() }
        return (try? JSONDecoder().decode(ShareTargets.self, from: data)) ?? ShareTargets()
    }

    public func save(to url: URL) throws {
        try JSONEncoder().encode(self).write(to: url, options: .atomic)
    }
}
