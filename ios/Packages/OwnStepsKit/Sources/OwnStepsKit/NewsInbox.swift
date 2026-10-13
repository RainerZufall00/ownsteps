import Foundation
import GRDB
import OwnStepsAPI

/// A new comment (authors) or step (readers) the device noticed while
/// refreshing a trip – what the bell lists ([D16]). Kept per device, like
/// the notifications: reading on the phone doesn't mark it on the iPad.
public struct NewsEntry: Sendable, Hashable, Identifiable {
    public let accountID: UUID
    public let kind: TripNews.Item.Kind
    /// The comment's or the step's ID.
    public let itemID: Int
    public let tripID: Int
    public let stepID: Int
    public let title: String
    public let body: String
    /// When it was written on the server.
    public let at: Date
    public let read: Bool

    public var id: String { "\(accountID.uuidString)-\(kind.rawValue)-\(itemID)" }
}

/// The bell: what's new in the trips, as the device noticed it. Every fresh
/// copy of a trip – change feed, trip screen, foreground or background –
/// passes through `record`, so it holds what a notification could miss:
/// background runs come when iOS lets them, and a trip opened in the app
/// was fetched before the change feed could compare it.
public final class NewsInbox: Sendable {
    private let database: DatabaseQueue
    /// Only the newest stay.
    static let keep = 200

    public init(database: AppDatabase) {
        self.database = database.queue
    }

    /// For tests and previews.
    public static func inMemory() throws -> NewsInbox {
        NewsInbox(database: try AppDatabase.inMemory())
    }

    public func record(_ items: [TripNews.Item], trip: Components.Schemas.TripDetail, for accountID: UUID) throws {
        let account = accountID.uuidString
        let present: [TripNews.Item.Kind: Set<Int>] = [
            .step: Set(trip.steps.map(\.id)),
            .comment: Set(trip.steps.flatMap(\.comments).map(\.id)),
        ]
        try database.write { db in
            // Seen twice (a trip screen and the change feed at once): the first one stays, read or not.
            for item in items {
                try db.execute(
                    sql: """
                    INSERT OR IGNORE INTO news (account_id, kind, item_id, trip_id, step_id, title, body, at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    arguments: [account, item.kind.rawValue, item.id, item.tripID, item.stepID, item.title, item.body, item.at.timeIntervalSince1970]
                )
            }
            // Deleted since: no longer news. Compared here, not in SQL – a
            // trip's comments can outnumber SQLite's variables.
            let stored = try Row.fetchAll(
                db,
                sql: "SELECT kind, item_id FROM news WHERE account_id = ? AND trip_id = ?",
                arguments: [account, trip.id]
            )
            for row in stored {
                let kind = TripNews.Item.Kind(rawValue: row["kind"]) ?? .comment
                let itemID: Int = row["item_id"]
                if present[kind]?.contains(itemID) != true {
                    try db.execute(
                        sql: "DELETE FROM news WHERE account_id = ? AND kind = ? AND item_id = ?",
                        arguments: [account, kind.rawValue, itemID]
                    )
                }
            }
            try db.execute(
                sql: "DELETE FROM news WHERE rowid NOT IN (SELECT rowid FROM news ORDER BY at DESC LIMIT ?)",
                arguments: [Self.keep]
            )
        }
    }

    /// Newest first.
    public func entries() throws -> [NewsEntry] {
        try database.read { db in
            try Row.fetchAll(db, sql: "SELECT * FROM news ORDER BY at DESC LIMIT ?", arguments: [Self.keep]).compactMap { row in
                guard let account = UUID(uuidString: row["account_id"]),
                      let kind = TripNews.Item.Kind(rawValue: row["kind"]) else { return nil }
                return NewsEntry(
                    accountID: account, kind: kind, itemID: row["item_id"], tripID: row["trip_id"], stepID: row["step_id"],
                    title: row["title"], body: row["body"], at: Date(timeIntervalSince1970: row["at"]), read: row["read"]
                )
            }
        }
    }

    public func markRead(_ entry: NewsEntry) throws {
        try database.write { db in
            try db.execute(
                sql: "UPDATE news SET read = 1 WHERE account_id = ? AND kind = ? AND item_id = ?",
                arguments: [entry.accountID.uuidString, entry.kind.rawValue, entry.itemID]
            )
        }
    }

    public func markAllRead() throws {
        try database.write { db in try db.execute(sql: "UPDATE news SET read = 1 WHERE NOT read") }
    }

    /// A trip the server no longer has, or with `tripID` nil, all of a signed-out account.
    public func remove(tripID: Int? = nil, for accountID: UUID) throws {
        try database.write { db in
            try db.execute(
                sql: "DELETE FROM news WHERE account_id = ? AND (? IS NULL OR trip_id = ?)",
                arguments: [accountID.uuidString, tripID, tripID]
            )
        }
    }
}
