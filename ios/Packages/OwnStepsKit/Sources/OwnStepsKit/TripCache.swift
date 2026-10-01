import Foundation
import GRDB
import OwnStepsAPI

/// What the app has seen of each server, so trips stay readable offline
/// ([D22]). Responses are stored as they came – the generated types are
/// Codable – keyed by account and trip.
public final class TripCache: Sendable {
    private let database: DatabaseQueue

    public struct Cached<Value: Sendable>: Sendable {
        public let value: Value
        public let fetchedAt: Date
    }

    public init(database: AppDatabase) {
        self.database = database.queue
    }

    /// For tests and previews.
    public static func inMemory() throws -> TripCache {
        TripCache(database: try AppDatabase.inMemory())
    }

    // MARK: Trip lists

    public func saveTrips(_ trips: [Components.Schemas.Trip], for accountID: UUID) throws {
        let json = try JSONEncoder().encode(trips)
        try database.write { db in
            try db.execute(
                sql: "INSERT OR REPLACE INTO trip_list (account_id, json, fetched_at) VALUES (?, ?, ?)",
                arguments: [accountID.uuidString, json, Date().timeIntervalSince1970]
            )
        }
    }

    public func trips(for accountID: UUID) throws -> Cached<[Components.Schemas.Trip]>? {
        try database.read { db in
            guard let row = try Row.fetchOne(
                db,
                sql: "SELECT json, fetched_at FROM trip_list WHERE account_id = ?",
                arguments: [accountID.uuidString]
            ) else { return nil }
            let trips = try JSONDecoder().decode([Components.Schemas.Trip].self, from: row["json"] as Data)
            return Cached(value: trips, fetchedAt: Date(timeIntervalSince1970: row["fetched_at"]))
        }
    }

    // MARK: Trip details

    public func saveTrip(_ trip: Components.Schemas.TripDetail, for accountID: UUID) throws {
        let json = try JSONEncoder().encode(trip)
        try database.write { db in
            try db.execute(
                sql: """
                INSERT OR REPLACE INTO trip_detail (account_id, trip_id, json, fetched_at)
                VALUES (?, ?, ?, ?)
                """,
                arguments: [accountID.uuidString, trip.id, json, Date().timeIntervalSince1970]
            )
        }
    }

    public func trip(_ tripID: Int, for accountID: UUID) throws -> Cached<Components.Schemas.TripDetail>? {
        try database.read { db in
            guard let row = try Row.fetchOne(
                db,
                sql: "SELECT json, fetched_at FROM trip_detail WHERE account_id = ? AND trip_id = ?",
                arguments: [accountID.uuidString, tripID]
            ) else { return nil }
            let trip = try JSONDecoder().decode(Components.Schemas.TripDetail.self, from: row["json"] as Data)
            return Cached(value: trip, fetchedAt: Date(timeIntervalSince1970: row["fetched_at"]))
        }
    }

    /// A trip the server no longer has (deleted, or no longer visible).
    public func removeTrip(_ tripID: Int, for accountID: UUID) throws {
        try database.write { db in
            try db.execute(
                sql: "DELETE FROM trip_detail WHERE account_id = ? AND trip_id = ?",
                arguments: [accountID.uuidString, tripID]
            )
        }
    }

    /// Signing out forgets everything the account brought onto the device.
    public func removeAll(for accountID: UUID) throws {
        try database.write { db in
            for table in ["trip_list", "trip_detail"] {
                try db.execute(sql: "DELETE FROM \(table) WHERE account_id = ?", arguments: [accountID.uuidString])
            }
        }
    }
}
