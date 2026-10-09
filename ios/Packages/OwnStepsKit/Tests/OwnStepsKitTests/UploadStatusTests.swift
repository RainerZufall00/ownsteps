import Foundation
import Testing
@testable import OwnStepsKit

private let account = UUID()

private func upload(
    _ id: String,
    _ state: PendingUpload.State = .queued,
    error: String? = nil,
    trip: Int = 7
) -> PendingUpload {
    PendingUpload(
        clientUUID: id, accountID: account, tripID: trip, stepClientUUID: nil, stepID: 1,
        sortIndex: 0, assetID: nil, fileName: "\(id).jpg", posterName: nil, thumbnailName: nil,
        mime: "image/jpeg", durationMs: nil, byteCount: 1000, state: state, attempts: 0,
        notBefore: nil, lastError: error, photoID: nil, createdAt: .now, sessionID: nil, caption: nil
    )
}

private func step(error: String? = nil) -> PendingStep {
    var step = PendingStep.new(
        accountID: account, tripID: 9, body: "Hi", placeName: nil, lat: nil, lon: nil,
        occurredAt: .now, now: .now
    )
    step.lastError = error
    return step
}

@Suite struct UploadStatusTests {
    @Test func showsNothingForAnEmptyQueue() {
        var tracker = UploadStatusTracker()
        #expect(tracker.status(for: .init(), progress: [:]) == nil)
    }

    @Test func countsFinishedUploadsAcrossTheBatch() throws {
        var tracker = UploadStatusTracker()
        let all = [upload("a", .uploading), upload("b"), upload("c")]
        let firstStatus = tracker.status(for: .init(uploads: all), progress: ["a": 0.5])
        let first = try #require(firstStatus)
        #expect(first.phase == .uploading)
        #expect(first.done == 0 && first.total == 3)
        #expect(abs(first.fraction - 0.5 / 3) < 0.001)

        // "a" reached the server and left the queue; "b" runs.
        let secondStatus = tracker.status(for: .init(uploads: [upload("b", .uploading), upload("c")]), progress: ["b": 0.2])
        let second = try #require(secondStatus)
        #expect(second.done == 1 && second.total == 3)
        #expect(abs(second.fraction - 1.2 / 3) < 0.001)
        #expect(second.accountID == account && second.tripID == 7)
    }

    @Test func callsFullySentUploadsProcessing() {
        var tracker = UploadStatusTracker()
        let status = tracker.status(for: .init(uploads: [upload("a", .uploading)]), progress: ["a": 1])
        #expect(status?.phase == .processing)
    }

    @Test func waitsForAConnectionAfterAFailedTry() {
        var tracker = UploadStatusTracker()
        #expect(tracker.status(for: .init(uploads: [upload("a", error: "offline")]), progress: [:])?.phase == .waitingForConnection)
    }

    @Test func saysOfflineEvenWhileUploadsRun() {
        var tracker = UploadStatusTracker()
        let overview = UploadOverview(unsentSteps: [step()], uploads: [upload("a", .uploading)])
        #expect(tracker.status(for: overview, progress: ["a": 0.3], online: false)?.phase == .waitingForConnection)
    }

    @Test func countsATurnedDownStepAsFailed() {
        var tracker = UploadStatusTracker()
        var turnedDown = step(error: "trip_not_found")
        // Its media can't go anywhere and mustn't look like a running batch.
        var media = upload("a", trip: 9)
        media.stepClientUUID = turnedDown.clientUUID
        media.stepID = nil
        turnedDown.tripID = 9
        let status = tracker.status(for: .init(unsentSteps: [turnedDown], uploads: [media]), progress: [:])
        #expect(status?.phase == .failed && status?.failed == 1 && status?.tripID == 9)
    }

    @Test func sendsTheStepBeforeItsMedia() {
        var tracker = UploadStatusTracker()
        let status = tracker.status(for: .init(unsentSteps: [step()], uploads: [upload("a")]), progress: [:])
        #expect(status?.phase == .sendingStep)
    }

    @Test func showsFinishedBrieflyThenNothing() {
        var tracker = UploadStatusTracker()
        let start = Date.now
        _ = tracker.status(for: .init(uploads: [upload("a", .uploading)]), progress: ["a": 1], now: start)
        let done = tracker.status(for: .init(), progress: [:], now: start.addingTimeInterval(1))
        #expect(done?.phase == .finished && done?.done == 1)
        // A progress update in between doesn't cut it short.
        #expect(tracker.status(for: .init(), progress: [:], now: start.addingTimeInterval(2))?.phase == .finished)
        #expect(tracker.status(for: .init(), progress: [:], now: start.addingTimeInterval(1 + UploadStatusTracker.finishedDuration)) == nil)
    }

    @Test func keepsShowingFailuresUntilTheyAreHandled() {
        var tracker = UploadStatusTracker()
        let status = tracker.status(for: .init(uploads: [upload("a", .failed, trip: 3)]), progress: [:])
        #expect(status?.phase == .failed && status?.failed == 1)
        #expect(status?.tripID == 3)
        // Failed ones don't count towards the next batch.
        let next = tracker.status(for: .init(uploads: [upload("a", .failed), upload("b", .uploading)]), progress: [:])
        #expect(next?.phase == .uploading && next?.total == 1 && next?.failed == 1)
    }
}
