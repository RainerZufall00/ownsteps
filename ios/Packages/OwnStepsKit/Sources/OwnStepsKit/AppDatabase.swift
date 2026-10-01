import Foundation
import GRDB

/// The app's one SQLite file: the trip cache and the upload queue.
public final class AppDatabase: Sendable {
    let queue: DatabaseQueue

    public init(path: String) throws {
        queue = try DatabaseQueue(path: path)
        try Self.migrator.migrate(queue)
    }

    /// For tests and previews.
    public static func inMemory() throws -> AppDatabase {
        try AppDatabase(queue: DatabaseQueue())
    }

    private init(queue: DatabaseQueue) throws {
        self.queue = queue
        try Self.migrator.migrate(queue)
    }

    /// Append only, like the server's MIGRATIONS: installed apps have run
    /// every entry already.
    private static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1_trip_cache") { db in
            try db.create(table: "trip_list") { t in
                t.primaryKey("account_id", .text)
                t.column("json", .blob).notNull()
                t.column("fetched_at", .double).notNull()
            }
            try db.create(table: "trip_detail") { t in
                t.column("account_id", .text).notNull()
                t.column("trip_id", .integer).notNull()
                t.column("json", .blob).notNull()
                t.column("fetched_at", .double).notNull()
                t.primaryKey(["account_id", "trip_id"])
            }
        }
        migrator.registerMigration("v2_upload_queue") { db in
            // Steps written on the device; `server_step_id` is set once the
            // server has them. The client UUID makes creating them idempotent.
            try db.create(table: "pending_step") { t in
                t.primaryKey("client_uuid", .text)
                t.column("account_id", .text).notNull()
                t.column("trip_id", .integer).notNull()
                t.column("body", .text).notNull()
                t.column("place_name", .text)
                t.column("lat", .double)
                t.column("lon", .double)
                t.column("occurred_at", .double).notNull()
                t.column("publish", .boolean).notNull()
                t.column("server_step_id", .integer)
                t.column("last_error", .text)
                t.column("created_at", .double).notNull()
            }
            // One row per photo or video. The prepared file waits in the
            // app's upload folder until the server confirmed it.
            try db.create(table: "pending_upload") { t in
                t.primaryKey("client_uuid", .text)
                t.column("account_id", .text).notNull()
                t.column("trip_id", .integer).notNull()
                t.column("step_client_uuid", .text)
                    .references("pending_step", column: "client_uuid", onDelete: .cascade)
                t.column("step_id", .integer)
                t.column("sort_index", .integer).notNull()
                t.column("asset_id", .text)
                t.column("file_name", .text).notNull()
                t.column("poster_name", .text)
                // Small preview for the timeline until the server has it.
                t.column("thumbnail_name", .text)
                t.column("mime", .text).notNull()
                t.column("duration_ms", .integer)
                t.column("byte_count", .integer).notNull()
                t.column("state", .text).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                // Backoff after transient failures; nil means "now".
                t.column("not_before", .double)
                t.column("last_error", .text)
                t.column("photo_id", .integer)
                t.column("created_at", .double).notNull()
            }
            // Library photos that made it to a server – for suggesting the
            // ones that haven't ([D22]). Per device on purpose.
            try db.create(table: "uploaded_asset") { t in
                t.column("account_id", .text).notNull()
                t.column("asset_id", .text).notNull()
                t.column("photo_id", .integer).notNull()
                t.column("uploaded_at", .double).notNull()
                t.primaryKey(["account_id", "asset_id"])
            }
        }
        return migrator
    }
}
