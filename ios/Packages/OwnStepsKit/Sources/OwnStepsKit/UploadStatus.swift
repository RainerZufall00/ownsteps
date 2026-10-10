import Foundation

/// Everything still on its way to any server – what the app-wide upload
/// indicator is computed from.
public struct UploadOverview: Sendable, Equatable {
    /// Steps written on the device that the server doesn't have yet.
    public var unsentSteps: [PendingStep] = []
    /// Every queued, running or failed upload, oldest first.
    public var uploads: [PendingUpload] = []

    public init(unsentSteps: [PendingStep] = [], uploads: [PendingUpload] = []) {
        self.unsentSteps = unsentSteps
        self.uploads = uploads
    }
}

/// One line of state for the app-wide upload indicator.
public struct UploadStatus: Sendable, Equatable {
    public enum Phase: Sendable, Equatable {
        /// A step without media is waiting for the server to take it.
        case sendingStep
        /// Bytes are on their way.
        case uploading
        /// Everything is sent; the server is still resizing and storing it.
        case processing
        /// Something is due but the device is offline, or the last try of
        /// an upload found no connection.
        case waitingForConnection
        /// Only steps and uploads that a retry won't fix by itself are left.
        case failed
        /// The queue just emptied without failures; shown briefly.
        case finished
    }

    public var phase: Phase
    /// Uploads finished since the queue was last empty.
    public var done: Int
    /// `done` plus what's still queued or running (failed ones don't count).
    public var total: Int
    /// 0…1 across `total`, counting running uploads by their sent bytes.
    public var fraction: Double
    /// Uploads and steps the server turned down.
    public var failed: Int
    /// The trip a tap opens: the first failed upload's, else the first pending one's.
    public var accountID: UUID?
    public var tripID: Int?
}

/// Turns the queue and the uploads' progress into an `UploadStatus`.
///
/// Rows disappear from the queue once the server has an upload, so "3 of 5"
/// needs memory: every upload seen since the queue was last empty counts
/// towards the total, and those gone since count as done.
public struct UploadStatusTracker: Sendable {
    /// How long "finished" stays up.
    public static let finishedDuration: TimeInterval = 3

    private var seen: Set<String> = []
    private var finishedUntil: Date?
    private var lastFinished: UploadStatus?

    public init() {}

    /// The status to show now, or nil for nothing at all. `progress` holds
    /// the sent fraction of running uploads by ID; `online` is whether the
    /// device has a network path at all.
    ///
    /// The queue marks steps and uploads differently: a step's `lastError`
    /// means the server turned it down (offline tries leave no trace), an
    /// upload's means its last try failed and it waits to try again.
    public mutating func status(
        for overview: UploadOverview,
        progress: [String: Double],
        online: Bool = true,
        now: Date = .now
    ) -> UploadStatus? {
        let failedSteps = overview.unsentSteps.filter { $0.lastError != nil }
        let pendingSteps = overview.unsentSteps.filter { $0.lastError == nil }
        let stuck = Set(failedSteps.map(\.clientUUID))
        let failed = overview.uploads.filter { $0.state == .failed }
        // Media of a turned-down step can't go anywhere until it's handled.
        let active = overview.uploads.filter {
            $0.state != .failed && !stuck.contains($0.stepClientUUID ?? "")
        }
        let activeIDs = Set(active.map(\.id))
        let allIDs = Set(overview.uploads.map(\.id))
        seen.formUnion(activeIDs)
        let done = seen.subtracting(allIDs).count
        let total = done + active.count
        let failures = failed.count + failedSteps.count
        let failedTarget = failed.first.map { ($0.accountID, $0.tripID) }
            ?? failedSteps.first.map { ($0.accountID, $0.tripID) }
        let pendingTarget = active.first.map { ($0.accountID, $0.tripID) }
            ?? pendingSteps.first.map { ($0.accountID, $0.tripID) }
        let target = failedTarget ?? pendingTarget

        func make(_ phase: UploadStatus.Phase, fraction: Double = 0) -> UploadStatus {
            UploadStatus(
                phase: phase,
                done: done,
                total: total,
                fraction: fraction,
                failed: failures,
                accountID: target?.0,
                tripID: target?.1
            )
        }

        guard active.isEmpty, pendingSteps.isEmpty else {
            finishedUntil = nil
            // Running uploads just wait for the network too; say why nothing moves.
            if !online { return make(.waitingForConnection) }
            let running = active.filter { $0.state == .uploading }
            if !running.isEmpty {
                let sent = active.reduce(0.0) { $0 + min(progress[$1.id] ?? 0, 1) }
                let fraction = total > 0 ? (Double(done) + sent) / Double(total) : 0
                // Sent completely but no answer yet: the server is working on it.
                let sending = running.contains { (progress[$0.id] ?? 0) < 1 }
                return make(sending ? .uploading : .processing, fraction: fraction)
            }
            if active.contains(where: { $0.lastError != nil }) { return make(.waitingForConnection) }
            // Media of a step the server doesn't have yet waits for the step.
            if active.isEmpty || !pendingSteps.isEmpty { return make(.sendingStep) }
            return make(.uploading, fraction: total > 0 ? Double(done) / Double(total) : 0)
        }

        // Nothing left to do: the batch is over.
        if failures > 0 {
            seen = []
            finishedUntil = nil
            return make(.failed)
        }
        if done > 0 {
            finishedUntil = now.addingTimeInterval(Self.finishedDuration)
            lastFinished = make(.finished, fraction: 1)
            seen = []
        }
        if let until = finishedUntil, now < until { return lastFinished }
        finishedUntil = nil
        return nil
    }
}
