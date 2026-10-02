import Foundation
import Testing
@testable import OwnStepsKit

@Suite(.serialized) struct ShareExtensionTests {
    let account = UUID()
    let root = FileManager.default.temporaryDirectory.appending(path: "group-\(UUID().uuidString)")
    var files: QueueFiles { QueueFiles(directory: root.appending(path: "Uploads")) }
    var inbox: ShareInbox { ShareInbox(directory: root.appending(path: "Inbox")) }

    func media(_ name: String) throws -> UploadQueue.NewMedia {
        let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
        try Data("bytes of \(name)".utf8).write(to: file)
        return .init(file: file, mime: "image/jpeg")
    }

    func submitter(server: StubTransport, transport: FakeTransport) -> ShareSubmitter {
        ShareSubmitter(
            files: files,
            inbox: inbox,
            client: ServerClient(baseURL: URL(string: "https://trips.example.com")!, token: "osa_t", transport: server),
            transport: transport,
            sessionID: "ownsteps.share.test"
        )
    }

    func appQueue(
        transport: FakeTransport,
        server: StubTransport = StubTransport(),
        clock: TestClock = TestClock(now: Date())
    ) throws -> UploadQueue {
        UploadQueue(
            database: try AppDatabase.inMemory(),
            directory: files.directory,
            transport: transport,
            now: { clock.now },
            clientFor: { _ in
                ServerClient(baseURL: URL(string: "https://trips.example.com")!, token: "osa_t", transport: server)
            }
        )
    }

    @Test func sendsFromTheExtensionAndTheAppHearsTheResult() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let extensionSession = FakeTransport()

        let outcome = try await submitter(server: server, transport: extensionSession).submit(
            accountID: account, tripID: 1, body: "From the share sheet", occurredAt: Date(),
            media: [try media("a"), try media("b")]
        )
        #expect(outcome == .sending)
        #expect(extensionSession.started.count == 2)
        #expect(extensionSession.started[0].request.url?.path() == "/api/v1/steps/42/media")
        // The bodies live in the shared folder, where the app finds them.
        #expect(extensionSession.started[0].body.path().hasPrefix(files.directory.path()))

        // Later the app starts, takes the submission over and joins the session.
        let appSession = FakeTransport()
        appSession.active = Set(extensionSession.started.map(\.id))
        let queue = try appQueue(transport: appSession)
        await queue.importInbox(inbox)
        #expect(inbox.submissions().isEmpty)
        #expect(await queue.shareSessionIDs() == ["ownsteps.share.test"])

        // Still running in the extension's session: not started again.
        await queue.reconcile()
        await queue.process()
        #expect(appSession.started.isEmpty)
        var snapshot = try queue.snapshot(accountID: account, tripID: 1)
        #expect(snapshot.localSteps.isEmpty)
        #expect(snapshot.uploadsByStepID[42]?.count == 2)

        for id in extensionSession.started.map(\.id) {
            await queue.handleCompletion(
                uploadID: id, statusCode: 201, body: Data(#"{"photo":{"id":7},"step":{}}"#.utf8), error: nil
            )
        }
        snapshot = try queue.snapshot(accountID: account, tripID: 1)
        #expect(snapshot.isEmpty)
        #expect(await queue.shareSessionIDs().isEmpty)
    }

    @Test func savesForLaterOfflineAndTheAppSendsIt() async throws {
        let offline = StubTransport()
        offline.failWith = URLError(.notConnectedToInternet)
        let extensionSession = FakeTransport()

        let outcome = try await submitter(server: offline, transport: extensionSession).submit(
            accountID: account, tripID: 1, body: "", occurredAt: Date(), media: [try media("a")]
        )
        #expect(outcome == .savedForLater)
        #expect(extensionSession.started.isEmpty)

        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let appSession = FakeTransport()
        let queue = try appQueue(transport: appSession, server: server)
        await queue.importInbox(inbox)
        let local = try #require(try queue.snapshot(accountID: account, tripID: 1).localSteps.first)
        // No text: appears with its first photo ([E7]).
        #expect(local.step.publish == false)

        await queue.process()
        #expect(appSession.started.count == 1)
        #expect(try String(contentsOf: appSession.started[0].body, encoding: .utf8).contains("bytes of a"))
    }

    @Test func forgetsUploadsTheExtensionSawFinish() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let extensionSession = FakeTransport()
        _ = try await submitter(server: server, transport: extensionSession).submit(
            accountID: account, tripID: 1, body: "x", occurredAt: Date(), media: [try media("a"), try media("b")]
        )
        let (first, second) = (extensionSession.started[0], extensionSession.started[1])

        inbox.recordCompletion(uploadID: first.id, statusCode: 201, files: files)
        inbox.recordCompletion(uploadID: second.id, statusCode: 500, files: files)
        #expect(inbox.submissions().first?.1.uploads.map(\.clientUUID) == [second.id])
        #expect(!FileManager.default.fileExists(atPath: first.body.path(percentEncoded: false)))

        // The last one done: the app has nothing left to take over.
        inbox.recordCompletion(uploadID: second.id, statusCode: 201, files: files)
        #expect(inbox.submissions().isEmpty)
    }

    @Test func requeuesExtensionUploadsTheSystemDropped() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        _ = try await submitter(server: server, transport: FakeTransport()).submit(
            accountID: account, tripID: 1, body: "x", occurredAt: Date(), media: [try media("a")]
        )
        let appSession = FakeTransport() // knows nothing of the extension's transfer
        let queue = try appQueue(transport: appSession)
        await queue.importInbox(inbox)
        await queue.reconcile()
        await queue.process()
        #expect(appSession.started.count == 1)
        #expect(await queue.shareSessionIDs().isEmpty)
    }

    @Test func leavesSubmissionsAloneUntilTheExtensionIsDone() async throws {
        // As the extension leaves it while still creating the step.
        let step = PendingStep.new(
            accountID: account, tripID: 1, body: "x", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), now: Date()
        )
        try inbox.write(ShareSubmission(step: step, uploads: [], updatedAt: Date()))

        let clock = TestClock(now: Date())
        let queue = try appQueue(transport: FakeTransport(), clock: clock)
        await queue.importInbox(inbox)
        #expect(inbox.submissions().count == 1)
        #expect(try queue.snapshot(accountID: account, tripID: 1).localSteps.isEmpty)

        // The extension was ended halfway: taken over after a while.
        clock.now = clock.now.addingTimeInterval(11 * 60)
        await queue.importInbox(inbox)
        #expect(inbox.submissions().isEmpty)
        #expect(try queue.snapshot(accountID: account, tripID: 1).localSteps.count == 1)
    }

    @Test func keepsRowsTheQueueAlreadyHas() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let extensionSession = FakeTransport()
        _ = try await submitter(server: server, transport: extensionSession).submit(
            accountID: account, tripID: 1, body: "x", occurredAt: Date(), media: [try media("a")]
        )
        let submission = try #require(inbox.submissions().first?.1)
        let queue = try appQueue(transport: FakeTransport())
        await queue.importInbox(inbox)
        await queue.handleCompletion(
            uploadID: extensionSession.started[0].id, statusCode: nil, body: nil, error: URLError(.timedOut)
        )

        // The same submission once more must not reset the retry state.
        try inbox.write(submission)
        await queue.importInbox(inbox)
        let upload = try #require(try queue.snapshot(accountID: account, tripID: 1).uploadsByStepID[42]?.first)
        #expect(upload.state == .queued)
        #expect(upload.attempts == 1)
    }

    @Test func remembersIgnoredAssets() throws {
        let queue = try appQueue(transport: FakeTransport())
        try queue.ignoreAssets(["a", "b", "a"], accountID: account)
        #expect(try queue.ignoredAssetIDs(accountID: account) == ["a", "b"])
        #expect(try queue.ignoredAssetIDs(accountID: UUID()).isEmpty)
    }
}

@Suite struct ShareTargetsTests {
    @Test func listsRecentTripsFirstAndSurvivesTheRoundTrip() throws {
        let account = UUID()
        let old = try JSONDecoder.api.decode(Components.Schemas.Trip.self, from: Data(tripJSON(id: 1, lastStep: "2026-07-03T10:00:00.000Z").utf8))
        let recent = try JSONDecoder.api.decode(Components.Schemas.Trip.self, from: Data(tripJSON(id: 2, lastStep: "2026-09-20T10:00:00.000Z").utf8))
        let targets = ShareTargets(from: [account: [old, recent]])
        #expect(targets.trips(for: account).map(\.id) == [2, 1])

        let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).json")
        try targets.save(to: file)
        #expect(ShareTargets.load(from: file) == targets)
        #expect(ShareTargets.load(from: file.appending(path: "missing")).trips.isEmpty)
    }

    func tripJSON(id: Int, lastStep: String) -> String {
        """
        {"id":\(id),"title":"Trip \(id)","summary":null,"startDate":null,"endDate":null,"coverPhotoId":null,
         "stepCount":1,"photoCount":0,"firstStepAt":"2026-07-01T10:00:00.000Z","lastStepAt":"\(lastStep)",
         "updatedAt":"2026-07-01T10:00:00.000Z"}
        """
    }
}

@Suite struct PhotoSuggestionsTests {
    let calendar = TripCalendar(timeZone: TimeZone(identifier: "Europe/Oslo")!)
    let now = ISO8601DateFormatter().date(from: "2026-10-01T12:00:00Z")!

    func date(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }

    @Test func usesTheEnteredDatesInTheServerZone() throws {
        let window = try #require(PhotoSuggestions.window(
            startDate: "2026-07-01", endDate: "2026-07-20", firstStepAt: nil, lastStepAt: nil,
            calendar: calendar, now: now
        ))
        // Midnight in Oslo, summer time.
        #expect(window.start == date("2026-06-30T22:00:00Z"))
        #expect(window.end == date("2026-07-20T22:00:00Z"))
    }

    @Test func fallsBackToTheStepsAndStopsTwoWeeksAfterTheLastOne() throws {
        let window = try #require(PhotoSuggestions.window(
            startDate: nil, endDate: nil,
            firstStepAt: date("2026-07-03T08:00:00Z"), lastStepAt: date("2026-07-10T08:00:00Z"),
            calendar: calendar, now: now
        ))
        #expect(window.start == date("2026-07-02T22:00:00Z"))
        #expect(window.end == date("2026-07-24T08:00:00Z"))
    }

    @Test func runsUntilNowForATripUnderway() throws {
        let window = try #require(PhotoSuggestions.window(
            startDate: "2026-09-28", endDate: nil, firstStepAt: nil, lastStepAt: nil,
            calendar: calendar, now: now
        ))
        #expect(window.end == now)
    }

    @Test func hasNoWindowWithoutAnyDate() {
        #expect(PhotoSuggestions.window(
            startDate: nil, endDate: nil, firstStepAt: nil, lastStepAt: nil, calendar: calendar, now: now
        ) == nil)
    }

    @Test func leavesOutUploadedIgnoredAndKnownPhotos() throws {
        let taken = date("2026-07-03T16:30:00Z")
        let candidates = [
            PhotoSuggestions.Candidate(id: "uploaded", creationDate: taken, pixelWidth: 10, pixelHeight: 10),
            PhotoSuggestions.Candidate(id: "ignored", creationDate: taken, pixelWidth: 10, pixelHeight: 10),
            // On the server already: same second, size turned by the orientation.
            PhotoSuggestions.Candidate(id: "web", creationDate: taken, pixelWidth: 3000, pixelHeight: 4000),
            // Read two hours off by the server's zone – still the same photo.
            PhotoSuggestions.Candidate(id: "zone", creationDate: taken.addingTimeInterval(7200), pixelWidth: 3000, pixelHeight: 4000),
            // Same size, different second: a different photo.
            PhotoSuggestions.Candidate(id: "new", creationDate: taken.addingTimeInterval(37), pixelWidth: 4000, pixelHeight: 3000),
            PhotoSuggestions.Candidate(id: "video", creationDate: taken, pixelWidth: 1920, pixelHeight: 1080, durationMs: 9000),
        ]
        let server = try JSONDecoder.api.decode(
            [Components.Schemas.Photo].self,
            from: Data("""
            [{"id":1,"width":4000,"height":3000,"placeholder":null,"caption":null,"mediaType":"photo",
              "durationMs":null,"takenAt":"2026-07-03T16:30:00.000Z","lat":null,"lon":null,"clientUuid":null,"fileKey":"k"},
             {"id":2,"width":640,"height":360,"placeholder":null,"caption":null,"mediaType":"video",
              "durationMs":5000,"takenAt":"2026-07-03T16:30:00.000Z","lat":null,"lon":null,"clientUuid":null,"fileKey":"k"}]
            """.utf8)
        )
        let left = PhotoSuggestions.filter(candidates, uploaded: ["uploaded"], ignored: ["ignored"], serverPhotos: server)
        // The video is longer than the one on the server, so it's another one.
        #expect(left.map(\.id) == ["new", "video"])
    }
}

extension JSONDecoder {
    /// Dates like the server writes them.
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: text) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: text))
            }
            return date
        }
        return decoder
    }
}

@Suite struct InviteTests {
    @Test func readsTheAppLinkAPastedLinkAndAPlainOne() throws {
        let app = try #require(Invite(URL(string: "ownsteps://join?url=https%3A%2F%2Ftrips.example.com%2Fs%2FabcDEF")!))
        #expect(app.serverURL.absoluteString == "https://trips.example.com")
        #expect(app.shareLink.absoluteString == "https://trips.example.com/s/abcDEF")

        let pasted = try #require(Invite(text: "  trips.example.com/journal/s/xyz#step-4 "))
        #expect(pasted.serverURL.absoluteString == "https://trips.example.com/journal")

        let local = try #require(Invite(text: "http://localhost:2555/s/tok"))
        #expect(local.serverURL.absoluteString == "http://localhost:2555")
    }

    @Test func refusesWhatIsNoShareLink() {
        #expect(Invite(text: "https://trips.example.com") == nil)
        #expect(Invite(text: "https://trips.example.com/s/") == nil)
        #expect(Invite(URL(string: "ownsteps://auth?code=1")!) == nil)
        #expect(Invite(text: "http://trips.example.com/s/abc") == nil) // plain HTTP outside the LAN
    }
}

@Suite struct TripNewsTests {
    func trip(_ steps: [(id: Int, comments: [(Int, String)])]) throws -> Components.Schemas.TripDetail {
        let stepsJSON = steps.map { step -> String in
            let comments = step.comments.map { id, author -> String in
                #"{"id":\#(id),"stepId":\#(step.id),"authorName":"\#(author)","body":"Line one\nline two","createdAt":"2026-07-03T10:00:00.000Z"}"#
            }.joined(separator: ",")
            return #"{"id":\#(step.id),"tripId":1,"clientUuid":null,"body":"Fjords","placeName":"Bergen","countryCode":null,"lat":null,"lon":null,"occurredAt":"2026-07-03T10:00:00.000Z","updatedAt":"2026-07-03T10:00:00.000Z","photos":[],"comments":[\#(comments)]}"#
        }.joined(separator: ",")
        let json = #"{"id":1,"title":"Norway","summary":null,"startDate":null,"endDate":null,"coverPhotoId":null,"stepCount":1,"photoCount":0,"firstStepAt":null,"lastStepAt":null,"updatedAt":"2026-07-03T10:00:00.000Z","steps":[\#(stepsJSON)]}"#
        return try JSONDecoder.api.decode(Components.Schemas.TripDetail.self, from: Data(json.utf8))
    }

    @Test func readersHearAboutNewStepsOnly() throws {
        let old = try trip([(1, [])])
        let new = try trip([(1, [(5, "Oma")]), (2, [])])
        let items = TripNews.items(old: old, new: new, reader: true, ownName: "Oma")
        #expect(items.map(\.stepID) == [2])
        #expect(items.first?.title == "Norway · Bergen")
    }

    @Test func authorsHearAboutOthersComments() throws {
        let old = try trip([(1, [(5, "Oma")])])
        let new = try trip([(1, [(5, "Oma"), (6, "Anna"), (7, "Opa")]), (2, [(8, "Opa")])])
        let items = TripNews.items(old: old, new: new, reader: false, ownName: "Anna")
        #expect(items.map(\.stepID) == [1, 2])
        #expect(items.first?.title == "Opa · Norway")
        #expect(items.first?.body == "Line one line two")
    }

    @Test func staysQuietWithoutAnEarlierCopy() throws {
        #expect(TripNews.items(old: nil, new: try trip([(1, [])]), reader: true, ownName: "x").isEmpty)
    }
}
