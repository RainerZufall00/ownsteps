import Foundation

/// A step the Share Extension wrote, with its uploads – handed to the app
/// as a file instead of through the database ([D21]). Only the app opens
/// the SQLite file: iOS ends a suspended app that holds a lock on a file in
/// the shared container, and two processes writing one queue invite that.
public struct ShareSubmission: Codable, Sendable, Equatable {
    public var step: PendingStep
    public var uploads: [PendingUpload]
}

/// The folder the Share Extension drops submissions into. The app takes
/// them into its queue on every launch (`UploadQueue.importInbox`).
public struct ShareInbox: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    func write(_ submission: ShareSubmission) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(submission)
        // Atomic: the app never reads half a file.
        try data.write(to: directory.appending(path: "\(submission.step.clientUUID).json"), options: .atomic)
    }

    /// Uploads that finish while the extension still runs report to the
    /// extension, not the app. A finished one is taken off its submission
    /// (and its files deleted), so the app doesn't send it a second time.
    public func recordCompletion(uploadID: String, statusCode: Int?, files: QueueFiles) {
        guard let statusCode, (200..<300).contains(statusCode) else { return }
        Self.lock.withLock {
            guard let (url, found) = submissions().first(where: { $0.1.uploads.contains { $0.clientUUID == uploadID } })
            else { return }
            var submission = found
            submission.uploads.removeAll { upload in
                guard upload.clientUUID == uploadID else { return false }
                files.removeFiles(of: upload)
                return true
            }
            if submission.uploads.isEmpty, submission.step.serverStepID != nil {
                // Nothing left for the app to do.
                try? FileManager.default.removeItem(at: url)
            } else {
                try? write(submission)
            }
        }
    }

    /// Completions arrive on the session's queue, possibly at once.
    private static let lock = NSLock()

    func submissions() -> [(URL, ShareSubmission)] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        )) ?? []
        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { url in
                guard let data = try? Data(contentsOf: url),
                      let submission = try? JSONDecoder().decode(ShareSubmission.self, from: data)
                else { return nil }
                return (url, submission)
            }
            .sorted { $0.1.step.createdAt < $1.1.step.createdAt }
    }
}

/// What the Share Extension does with what was shared: record it in the
/// inbox first (so nothing is lost if the extension is ended), then create
/// the step and hand the files to a background session of its own. That
/// session keeps uploading after the extension is gone; iOS then wakes the
/// app, which by then has imported the submission and hears the results.
public struct ShareSubmitter: Sendable {
    public enum Outcome: Sendable, Equatable {
        /// The step exists on the server; the files are on their way.
        case sending
        /// Offline or the server is unwell: the app sends it later.
        case savedForLater
    }

    let files: QueueFiles
    let inbox: ShareInbox
    let client: ServerClient
    let transport: any UploadTransport
    let sessionID: String
    let now: @Sendable () -> Date

    public init(
        files: QueueFiles,
        inbox: ShareInbox,
        client: ServerClient,
        transport: any UploadTransport,
        sessionID: String,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.files = files
        self.inbox = inbox
        self.client = client
        self.transport = transport
        self.sessionID = sessionID
        self.now = now
    }

    public func submit(
        accountID: UUID,
        tripID: Int,
        body: String,
        occurredAt: Date,
        media: [UploadQueue.NewMedia]
    ) async throws -> Outcome {
        var submission = ShareSubmission(
            step: .new(
                accountID: accountID, tripID: tripID, body: body, placeName: nil,
                lat: nil, lon: nil, occurredAt: occurredAt, now: now()
            ),
            uploads: []
        )
        submission.uploads = try media.enumerated().map { index, item in
            try files.adopt(
                item, accountID: accountID, tripID: tripID, index: index,
                stepClientUUID: submission.step.clientUUID, now: now()
            )
        }
        try inbox.write(submission)

        let step = submission.step
        let created: Components.Schemas.Step
        do {
            created = try await client.createStep(
                tripID: tripID,
                clientUUID: step.clientUUID,
                body: step.body,
                placeName: nil,
                lat: nil,
                lon: nil,
                occurredAt: step.occurredAt,
                publish: step.publish
            )
        } catch {
            // The app tries again – and reports a refusal in the timeline.
            return .savedForLater
        }

        submission.step.serverStepID = created.id
        for index in submission.uploads.indices {
            submission.uploads[index].stepID = created.id
            let body = try files.bodyFile(for: submission.uploads[index])
            submission.uploads[index].state = .uploading
            submission.uploads[index].sessionID = sessionID
            // Recorded before the transfer starts: its result must find the row.
            try inbox.write(submission)
            await transport.start(
                request: client.mediaUploadRequest(stepID: created.id, contentType: body.contentType),
                bodyFile: body.url,
                uploadID: submission.uploads[index].clientUUID
            )
        }
        try inbox.write(submission)
        return .sending
    }
}
