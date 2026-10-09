import Foundation
import GRDB

/// Hands files to whatever actually uploads them – the background
/// `URLSession` in the app, a fake in tests.
public protocol UploadTransport: Sendable {
    func start(request: URLRequest, bodyFile: URL, uploadID: String) async
    /// Uploads the transport is still working on, e.g. after a relaunch.
    func activeUploadIDs() async -> Set<String>
}

/// The way steps and photos written on the road reach the server ([D19]).
///
/// Everything is recorded in the database first, so nothing is lost when
/// the app is closed or the connection drops. `process()` then works through
/// it: create the steps the server doesn't have yet (idempotent through the
/// client UUID), then hand every file to the transport as a multipart body
/// on disk. The transport reports back through `handleCompletion`.
public actor UploadQueue {
    public struct NewMedia: Sendable {
        /// Prepared file (JPEG, or the exported video); moved into the queue.
        public var file: URL
        /// Videos only: the poster frame as JPEG.
        public var poster: URL?
        /// A small JPEG shown in the timeline until the upload is through.
        public var thumbnail: URL?
        public var mime: String
        public var durationMs: Int?
        public var assetID: String?
        /// Shown below the photo or video; written before uploading.
        public var caption: String?

        public init(
            file: URL,
            poster: URL? = nil,
            thumbnail: URL? = nil,
            mime: String,
            durationMs: Int? = nil,
            assetID: String? = nil,
            caption: String? = nil
        ) {
            self.file = file
            self.poster = poster
            self.thumbnail = thumbnail
            self.mime = mime
            self.durationMs = durationMs
            self.assetID = assetID
            self.caption = caption
        }
    }

    private let database: DatabaseQueue
    private let files: QueueFiles
    private let transport: any UploadTransport
    private let clientFor: @Sendable (UUID) -> ServerClient?
    private let now: @Sendable () -> Date
    private var processing = false

    public init(
        database: AppDatabase,
        directory: URL,
        transport: any UploadTransport,
        now: @escaping @Sendable () -> Date = Date.init,
        clientFor: @escaping @Sendable (UUID) -> ServerClient?
    ) {
        self.database = database.queue
        self.files = QueueFiles(directory: directory)
        self.transport = transport
        self.now = now
        self.clientFor = clientFor
    }

    // MARK: Adding

    /// A new step with its media. Returns the step's client UUID.
    @discardableResult
    public func enqueueStep(
        accountID: UUID,
        tripID: Int,
        body: String,
        placeName: String?,
        lat: Double?,
        lon: Double?,
        occurredAt: Date,
        media: [NewMedia]
    ) throws -> String {
        let step = PendingStep.new(
            accountID: accountID, tripID: tripID, body: body, placeName: placeName,
            lat: lat, lon: lon, occurredAt: occurredAt, now: now()
        )
        let uploads = try media.enumerated().map { index, item in
            try files.adopt(
                item, accountID: accountID, tripID: tripID, index: index,
                stepClientUUID: step.clientUUID, now: now()
            )
        }
        try database.write { db in
            try step.insert(db)
            for upload in uploads { try upload.insert(db) }
        }
        return step.clientUUID
    }

    /// More photos for a step the server already has.
    public func enqueueMedia(accountID: UUID, tripID: Int, stepID: Int, media: [NewMedia]) throws {
        let uploads = try media.enumerated().map { index, item in
            var upload = try files.adopt(
                item, accountID: accountID, tripID: tripID, index: index, stepClientUUID: nil, now: now()
            )
            upload.stepID = stepID
            return upload
        }
        try database.write { db in
            for upload in uploads { try upload.insert(db) }
        }
    }

    /// Takes over what the Share Extension wrote ([D21]). Run before the
    /// background sessions reconnect, so their results find their rows.
    /// Rows the queue already has stay as they are – a submission read twice
    /// must not reset an upload in progress.
    public func importInbox(_ inbox: ShareInbox) {
        inbox.takeOver(now: now()) { submission in
            try database.write { db in
                try submission.step.insert(db, onConflict: .ignore)
                for upload in submission.uploads { try upload.insert(db, onConflict: .ignore) }
            }
        }
    }

    /// Background sessions of the Share Extension that still have uploads
    /// running – the app reconnects to them to hear how they ended.
    public func shareSessionIDs() async -> Set<String> {
        let ids = try? await database.read { db in
            try String.fetchAll(db, sql: """
                SELECT DISTINCT session_id FROM pending_upload
                WHERE session_id IS NOT NULL AND state = ?
                """, arguments: [PendingUpload.State.uploading.rawValue])
        }
        return Set(ids ?? [])
    }

    // MARK: Working through

    /// Creates missing steps and starts every upload that's due. Safe to
    /// call often – on launch, when the app comes to the foreground, after
    /// adding something.
    public func process() async {
        guard !processing else { return }
        processing = true
        defer { processing = false }

        await createSteps()
        await startUploads()
    }

    /// After a relaunch: uploads the transport no longer knows about go back
    /// to the queue.
    public func reconcile() async {
        let active = await transport.activeUploadIDs()
        try? await database.write { db in
            let uploading = try PendingUpload.filter(Column("state") == PendingUpload.State.uploading.rawValue).fetchAll(db)
            for var upload in uploading where !active.contains(upload.clientUUID) {
                upload.state = .queued
                upload.sessionID = nil
                try upload.update(db)
            }
        }
    }

    private func createSteps() async {
        let steps = (try? await database.read { db in
            try PendingStep.filter(Column("server_step_id") == nil).order(Column("created_at")).fetchAll(db)
        }) ?? []

        for var step in steps {
            guard let client = clientFor(step.accountID) else { continue }
            do {
                let created = try await client.createStep(
                    tripID: step.tripID,
                    clientUUID: step.clientUUID,
                    body: step.body,
                    placeName: step.placeName,
                    lat: step.lat,
                    lon: step.lon,
                    occurredAt: step.occurredAt,
                    publish: step.publish
                )
                step.serverStepID = created.id
                step.lastError = nil
                let stepID = created.id
                let clientUUID = step.clientUUID
                try await database.write { [step] db in
                    try step.update(db)
                    try db.execute(
                        sql: "UPDATE pending_upload SET step_id = ? WHERE step_client_uuid = ?",
                        arguments: [stepID, clientUUID]
                    )
                }
                try await cleanUp()
            } catch let error as APIError where !Self.isTransient(error) {
                step.lastError = error.code ?? "unexpected"
                try? await database.write { [step] db in try step.update(db) }
            } catch {
                // Offline or server trouble: the next run tries again.
                return
            }
        }
    }

    private func startUploads() async {
        let due = (try? await database.read { [now] db in
            try PendingUpload
                .filter(Column("state") == PendingUpload.State.queued.rawValue)
                .filter(Column("step_id") != nil)
                .filter(Column("not_before") == nil || Column("not_before") <= now().timeIntervalSince1970)
                .order(Column("created_at"), Column("sort_index"))
                .fetchAll(db)
        }) ?? []

        for var upload in due {
            guard let stepID = upload.stepID, let client = clientFor(upload.accountID) else { continue }
            do {
                let body = try files.bodyFile(for: upload)
                upload.state = .uploading
                upload.sessionID = nil
                try await database.write { [upload] db in try upload.update(db) }
                await transport.start(
                    request: client.mediaUploadRequest(stepID: stepID, contentType: body.contentType),
                    bodyFile: body.url,
                    uploadID: upload.clientUUID
                )
            } catch {
                upload.state = .failed
                upload.lastError = "file_missing"
                try? await database.write { [upload] db in try upload.update(db) }
            }
        }
    }

    // MARK: Results

    /// Called by the transport when an upload finished, one way or another.
    public func handleCompletion(uploadID: String, statusCode: Int?, body: Data?, error: (any Error)?) async {
        guard var upload = try? await database.read({ db in try PendingUpload.fetchOne(db, key: uploadID) }) else {
            return
        }

        if let statusCode, (200..<300).contains(statusCode) {
            let photoID = body.flatMap { try? JSONDecoder().decode(UploadResponse.self, from: $0) }?.photo.id
            let uploadedAt = now().timeIntervalSince1970
            try? await database.write { [upload] db in
                if let assetID = upload.assetID, let photoID {
                    try db.execute(
                        sql: """
                        INSERT OR REPLACE INTO uploaded_asset (account_id, asset_id, photo_id, uploaded_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        arguments: [upload.accountID.uuidString, assetID, photoID, uploadedAt]
                    )
                }
                _ = try upload.delete(db)
            }
            files.removeFiles(of: upload)
            try? await cleanUp()
            return
        }

        let code = body.flatMap(APIError.problemCode(in:))
        if let statusCode, (400..<500).contains(statusCode), !Self.retryableStatuses.contains(statusCode) {
            // A retry won't change "too large" or "unsupported format".
            upload.state = .failed
            upload.lastError = code ?? "http_\(statusCode)"
        } else {
            upload.state = .queued
            upload.sessionID = nil
            upload.attempts += 1
            upload.lastError = statusCode == 401 ? "not_signed_in" : (code ?? "network")
            upload.notBefore = now().addingTimeInterval(Self.backoff(attempts: upload.attempts))
        }
        try? await database.write { [upload] db in try upload.update(db) }
    }

    /// 30 s, 1 min, 2 min … capped at an hour.
    static func backoff(attempts: Int) -> TimeInterval {
        min(30 * pow(2, Double(max(attempts - 1, 0))), 3600)
    }

    /// Client errors a later attempt can get past: signed out (until the
    /// next sign-in), timeout, rate limit.
    private static let retryableStatuses: Set<Int> = [401, 408, 429]

    private static func isTransient(_ error: APIError) -> Bool {
        switch error {
        case .problem(_, let status): return status >= 500 || retryableStatuses.contains(status)
        case .unexpected(let status): return status >= 500 || status == 0
        default: return false
        }
    }

    /// Local steps whose uploads are all through aren't needed any more –
    /// the server's copy takes over.
    private func cleanUp() async throws {
        try await database.write { db in
            try db.execute(sql: """
                DELETE FROM pending_step
                WHERE server_step_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM pending_upload WHERE pending_upload.step_client_uuid = pending_step.client_uuid
                  )
                """)
        }
    }

    // MARK: Managing

    /// Gives a failed upload another try.
    public func retry(uploadID: String) async {
        try? await database.write { db in
            guard var upload = try PendingUpload.fetchOne(db, key: uploadID) else { return }
            upload.state = .queued
            upload.notBefore = nil
            upload.lastError = nil
            try upload.update(db)
        }
        await process()
    }

    public func remove(uploadID: String) async {
        guard let upload = try? await database.write({ db -> PendingUpload? in
            let upload = try PendingUpload.fetchOne(db, key: uploadID)
            _ = try upload?.delete(db)
            return upload
        }) else { return }
        files.removeFiles(of: upload)
        try? await cleanUp()
    }

    /// Throws away a step that never reached the server, with its media.
    public func removeStep(clientUUID: String) async {
        let uploads = (try? await database.write { db -> [PendingUpload] in
            let uploads = try PendingUpload.filter(Column("step_client_uuid") == clientUUID).fetchAll(db)
            _ = try PendingStep.deleteOne(db, key: clientUUID)
            return uploads
        }) ?? []
        uploads.forEach(files.removeFiles)
    }

    /// A deleted trip takes what was still queued for it along.
    public func removeAll(for accountID: UUID, tripID: Int) async {
        let uploads = (try? await database.write { db -> [PendingUpload] in
            let trip = Column("account_id") == accountID.uuidString && Column("trip_id") == tripID
            let uploads = try PendingUpload.filter(trip).fetchAll(db)
            try PendingStep.filter(trip).deleteAll(db)
            try PendingUpload.filter(trip).deleteAll(db)
            return uploads
        }) ?? []
        uploads.forEach(files.removeFiles)
    }

    /// Signing out forgets what the account still had queued.
    public func removeAll(for accountID: UUID) async {
        let uploads = (try? await database.write { db -> [PendingUpload] in
            let uploads = try PendingUpload.filter(Column("account_id") == accountID.uuidString).fetchAll(db)
            try PendingStep.filter(Column("account_id") == accountID.uuidString).deleteAll(db)
            try PendingUpload.filter(Column("account_id") == accountID.uuidString).deleteAll(db)
            try db.execute(sql: "DELETE FROM uploaded_asset WHERE account_id = ?", arguments: [accountID.uuidString])
            try db.execute(sql: "DELETE FROM ignored_asset WHERE account_id = ?", arguments: [accountID.uuidString])
            return uploads
        }) ?? []
        uploads.forEach(files.removeFiles)
    }

    // MARK: Reading

    /// Whether the account still has steps or media on their way – what
    /// must not vanish when the server signs the device out.
    public nonisolated func hasPending(accountID: UUID) throws -> Bool {
        try database.read { db in
            let account = Column("account_id") == accountID.uuidString
            return try PendingStep.filter(account).filter(Column("server_step_id") == nil).fetchCount(db) > 0
                || PendingUpload.filter(account).fetchCount(db) > 0
        }
    }

    /// Where an upload's preview lives, if it has one.
    public nonisolated func thumbnailURL(for upload: PendingUpload) -> URL? {
        upload.thumbnailName.map(files.url)
    }

    public nonisolated func snapshot(accountID: UUID, tripID: Int) throws -> UploadSnapshot {
        try database.read { db in try Self.snapshot(db, accountID: accountID, tripID: tripID) }
    }

    /// Keeps the timeline up to date while uploads move along.
    public nonisolated func observe(accountID: UUID, tripID: Int) -> AsyncValueObservation<UploadSnapshot> {
        ValueObservation
            .tracking { db in try Self.snapshot(db, accountID: accountID, tripID: tripID) }
            .removeDuplicates()
            .values(in: database)
    }

    /// Everything on its way, across accounts and trips – for the app-wide
    /// upload indicator.
    public nonisolated func observeAll() -> AsyncValueObservation<UploadOverview> {
        ValueObservation
            .tracking { db in
                UploadOverview(
                    unsentSteps: try PendingStep
                        .filter(Column("server_step_id") == nil)
                        .order(Column("created_at"))
                        .fetchAll(db),
                    uploads: try PendingUpload
                        .order(Column("created_at"), Column("sort_index"))
                        .fetchAll(db)
                )
            }
            .removeDuplicates()
            .values(in: database)
    }

    /// Library assets already uploaded for an account ([D22]).
    public nonisolated func uploadedAssetIDs(accountID: UUID) throws -> Set<String> {
        try database.read { db in
            Set(try String.fetchAll(
                db,
                sql: "SELECT asset_id FROM uploaded_asset WHERE account_id = ?",
                arguments: [accountID.uuidString]
            ))
        }
    }

    /// Library assets the user doesn't want suggested ([D22]).
    public nonisolated func ignoredAssetIDs(accountID: UUID) throws -> Set<String> {
        try database.read { db in
            Set(try String.fetchAll(
                db,
                sql: "SELECT asset_id FROM ignored_asset WHERE account_id = ?",
                arguments: [accountID.uuidString]
            ))
        }
    }

    public nonisolated func ignoreAssets(_ assetIDs: [String], accountID: UUID) throws {
        try database.write { db in
            for id in assetIDs {
                try db.execute(
                    sql: "INSERT OR IGNORE INTO ignored_asset (account_id, asset_id) VALUES (?, ?)",
                    arguments: [accountID.uuidString, id]
                )
            }
        }
    }

    static func snapshot(_ db: Database, accountID: UUID, tripID: Int) throws -> UploadSnapshot {
        let steps = try PendingStep
            .filter(Column("account_id") == accountID.uuidString && Column("trip_id") == tripID)
            .fetchAll(db)
        let uploads = try PendingUpload
            .filter(Column("account_id") == accountID.uuidString && Column("trip_id") == tripID)
            .order(Column("sort_index"))
            .fetchAll(db)

        var snapshot = UploadSnapshot()
        let byStep = Dictionary(grouping: uploads.filter { $0.stepClientUUID != nil }) { $0.stepClientUUID! }
        snapshot.localSteps = steps
            .filter { $0.serverStepID == nil }
            .sorted { $0.occurredAt > $1.occurredAt }
            .map { .init(step: $0, uploads: byStep[$0.clientUUID] ?? []) }
        for upload in uploads {
            guard let stepID = upload.stepID else { continue }
            if let local = steps.first(where: { $0.clientUUID == upload.stepClientUUID }), local.serverStepID == nil {
                continue
            }
            snapshot.uploadsByStepID[stepID, default: []].append(upload)
        }
        return snapshot
    }
}

private struct UploadResponse: Decodable {
    let photo: CreatedPhoto
}

extension String {
    /// nil for an empty string – for optional fields from text inputs.
    public var nilIfEmpty: String? { isEmpty ? nil : self }
}
