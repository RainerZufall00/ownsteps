import Foundation
import GRDB

/// A step written on the device that the server may not have yet.
public struct PendingStep: Codable, Hashable, Sendable, Identifiable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "pending_step"
    // Match the column types: UUIDs as text, dates as Unix seconds. (GRDB
    // wants functions here; static properties would be silently ignored.)
    public static func databaseUUIDEncodingStrategy(for column: String) -> DatabaseUUIDEncodingStrategy { .uppercaseString }
    public static func databaseDateEncodingStrategy(for column: String) -> DatabaseDateEncodingStrategy { .timeIntervalSince1970 }
    public static func databaseDateDecodingStrategy(for column: String) -> DatabaseDateDecodingStrategy { .timeIntervalSince1970 }

    public var clientUUID: String
    public var accountID: UUID
    public var tripID: Int
    public var body: String
    public var placeName: String?
    public var lat: Double?
    public var lon: Double?
    public var occurredAt: Date
    /// False while the step has no text or place – it then becomes visible
    /// with its first photo ([E7]).
    public var publish: Bool
    public var serverStepID: Int?
    public var lastError: String?
    public var createdAt: Date

    public var id: String { clientUUID }

    enum CodingKeys: String, CodingKey {
        case clientUUID = "client_uuid"
        case accountID = "account_id"
        case tripID = "trip_id"
        case body
        case placeName = "place_name"
        case lat, lon
        case occurredAt = "occurred_at"
        case publish
        case serverStepID = "server_step_id"
        case lastError = "last_error"
        case createdAt = "created_at"
    }
}

/// One photo or video on its way to the server.
public struct PendingUpload: Codable, Hashable, Sendable, Identifiable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "pending_upload"
    // Match the column types: UUIDs as text, dates as Unix seconds. (GRDB
    // wants functions here; static properties would be silently ignored.)
    public static func databaseUUIDEncodingStrategy(for column: String) -> DatabaseUUIDEncodingStrategy { .uppercaseString }
    public static func databaseDateEncodingStrategy(for column: String) -> DatabaseDateEncodingStrategy { .timeIntervalSince1970 }
    public static func databaseDateDecodingStrategy(for column: String) -> DatabaseDateDecodingStrategy { .timeIntervalSince1970 }

    public enum State: String, Codable, Sendable {
        /// Waiting for its step to exist on the server, or for its turn.
        case queued
        /// Handed to the background session.
        case uploading
        /// The server said no in a way a retry won't change (e.g. too large).
        case failed
    }

    public var clientUUID: String
    public var accountID: UUID
    public var tripID: Int
    /// Set when the step was written on the device.
    public var stepClientUUID: String?
    /// Set once the step exists on the server.
    public var stepID: Int?
    public var sortIndex: Int
    /// The library asset it came from, for photo suggestions ([D22]).
    public var assetID: String?
    public var fileName: String
    public var posterName: String?
    public var thumbnailName: String?
    public var mime: String
    public var durationMs: Int?
    public var byteCount: Int64
    public var state: State
    public var attempts: Int
    public var notBefore: Date?
    public var lastError: String?
    public var photoID: Int?
    public var createdAt: Date

    public var id: String { clientUUID }
    public var isVideo: Bool { mime.hasPrefix("video/") }

    enum CodingKeys: String, CodingKey {
        case clientUUID = "client_uuid"
        case accountID = "account_id"
        case tripID = "trip_id"
        case stepClientUUID = "step_client_uuid"
        case stepID = "step_id"
        case sortIndex = "sort_index"
        case assetID = "asset_id"
        case fileName = "file_name"
        case posterName = "poster_name"
        case thumbnailName = "thumbnail_name"
        case mime
        case durationMs = "duration_ms"
        case byteCount = "byte_count"
        case state, attempts
        case notBefore = "not_before"
        case lastError = "last_error"
        case photoID = "photo_id"
        case createdAt = "created_at"
    }
}

/// What's still on the way for one trip, for the timeline.
public struct UploadSnapshot: Sendable, Equatable {
    public struct LocalStep: Sendable, Equatable, Identifiable {
        public var step: PendingStep
        public var uploads: [PendingUpload]
        public var id: String { step.clientUUID }
    }

    /// Steps the server doesn't have yet, newest first.
    public var localSteps: [LocalStep] = []
    /// Uploads still pending for steps the server already has.
    public var uploadsByStepID: [Int: [PendingUpload]] = [:]

    public var isEmpty: Bool { localSteps.isEmpty && uploadsByStepID.isEmpty }

    public init() {}
}
