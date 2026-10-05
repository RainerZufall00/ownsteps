import CoreLocation
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import OwnStepsKit

// MARK: Media preparation

/// An HEIC like the iPhone writes it, with GPS, capture time and orientation.
func makeHEIC(gps: CLLocationCoordinate2D?, orientation: Int = 6) throws -> Data {
    let width = 64, height = 48
    let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    )!
    context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let image = context.makeImage()!

    let output = NSMutableData()
    let destination = try #require(CGImageDestinationCreateWithData(output, UTType.heic.identifier as CFString, 1, nil))
    var properties: [CFString: Any] = [
        kCGImagePropertyOrientation: orientation,
        kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2027:07:03 18:30:00"],
    ]
    if let gps {
        properties[kCGImagePropertyGPSDictionary] = MediaPreparation.gpsDictionary(
            for: CLLocation(latitude: gps.latitude, longitude: gps.longitude)
        )
    }
    CGImageDestinationAddImage(destination, image, properties as CFDictionary)
    #expect(CGImageDestinationFinalize(destination))
    return output as Data
}

func properties(of data: Data) -> [CFString: Any] {
    let source = CGImageSourceCreateWithData(data as CFData, nil)!
    return CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as! [CFString: Any]
}

@Suite struct MediaPreparationTests {
    @Test func turnsHEICIntoJPEGKeepingTheMetadata() throws {
        let heic = try makeHEIC(gps: .init(latitude: 60.3913, longitude: -5.3221))
        let jpeg = try MediaPreparation.jpeg(from: heic)

        let source = try #require(CGImageSourceCreateWithData(jpeg as CFData, nil))
        #expect(CGImageSourceGetType(source) as String? == UTType.jpeg.identifier)
        let props = properties(of: jpeg)
        #expect(props[kCGImagePropertyOrientation] as? Int == 6)
        let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any]
        #expect(exif?[kCGImagePropertyExifDateTimeOriginal] as? String == "2027:07:03 18:30:00")
        let location = try #require(MediaPreparation.location(in: jpeg))
        #expect(abs(location.latitude - 60.3913) < 0.0001)
        #expect(abs(location.longitude + 5.3221) < 0.0001)
    }

    @Test func writesTheLibraryLocationIntoPhotosWithoutGPS() throws {
        let heic = try makeHEIC(gps: nil)
        #expect(MediaPreparation.location(in: heic) == nil)
        let jpeg = try MediaPreparation.jpeg(from: heic, location: CLLocation(latitude: -33.86, longitude: 151.21))
        let location = try #require(MediaPreparation.location(in: jpeg))
        #expect(abs(location.latitude + 33.86) < 0.0001)
        #expect(abs(location.longitude - 151.21) < 0.0001)
    }

    @Test func keepsExistingGPSOverTheLibraryLocation() throws {
        let heic = try makeHEIC(gps: .init(latitude: 10, longitude: 20))
        let jpeg = try MediaPreparation.jpeg(from: heic, location: CLLocation(latitude: 50, longitude: 50))
        #expect(MediaPreparation.location(in: jpeg)?.latitude == 10)
    }

    @Test func rejectsData() {
        #expect(throws: MediaPreparation.Problem.unreadableImage) {
            try MediaPreparation.jpeg(from: Data("not an image".utf8))
        }
    }
}

// MARK: Multipart

@Suite struct MultipartBodyTests {
    @Test func writesFieldsAndFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appending(path: "a.jpg")
        try Data("JPEGDATA".utf8).write(to: file)

        let body = MultipartBody(boundary: "XYZ")
        let out = dir.appending(path: "body")
        let size = try body.write([
            .field(name: "clientUuid", value: "u-1"),
            .file(name: "file", fileName: "a.jpg", mime: "image/jpeg", url: file),
        ], to: out)

        let text = try String(contentsOf: out, encoding: .utf8)
        #expect(text == """
        --XYZ\r
        Content-Disposition: form-data; name="clientUuid"\r
        \r
        u-1\r
        --XYZ\r
        Content-Disposition: form-data; name="file"; filename="a.jpg"\r
        Content-Type: image/jpeg\r
        \r
        JPEGDATA\r
        --XYZ--\r

        """)
        #expect(size == Int64(text.utf8.count))
        #expect(body.contentType == "multipart/form-data; boundary=XYZ")
    }
}

// MARK: Queue

final class FakeTransport: UploadTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _started: [(request: URLRequest, body: URL, id: String)] = []
    var active: Set<String> = []

    var started: [(request: URLRequest, body: URL, id: String)] { lock.withLock { _started } }

    func start(request: URLRequest, bodyFile: URL, uploadID: String) async {
        lock.withLock { _started.append((request, bodyFile, uploadID)) }
    }

    func activeUploadIDs() async -> Set<String> { active }
}

/// A clock the test moves forward.
final class TestClock: @unchecked Sendable {
    var now: Date

    init(now: Date = Date(timeIntervalSince1970: 1_800_000_000)) {
        self.now = now
    }
}

let stepJSON = """
{"id":42,"tripId":1,"clientUuid":"x","body":"Fjords","placeName":null,"countryCode":null,
 "lat":null,"lon":null,"occurredAt":"2027-07-03T18:30:00.000Z","updatedAt":"2027-07-03T18:30:00.000Z",
 "photos":[],"comments":[]}
"""

@Suite(.serialized) struct UploadQueueTests {
    let account = UUID()
    let directory = FileManager.default.temporaryDirectory.appending(path: "queue-\(UUID().uuidString)")

    func media(_ name: String, video: Bool = false) throws -> UploadQueue.NewMedia {
        let staging = FileManager.default.temporaryDirectory.appending(path: "staging-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        let file = staging.appending(path: video ? "\(name).mp4" : "\(name).jpg")
        try Data("bytes of \(name)".utf8).write(to: file)
        var poster: URL?
        if video {
            poster = staging.appending(path: "\(name)-poster.jpg")
            try Data("poster".utf8).write(to: poster!)
        }
        return .init(file: file, poster: poster, mime: video ? "video/mp4" : "image/jpeg",
                     durationMs: video ? 5000 : nil, assetID: "asset-\(name)")
    }

    func makeQueue(server: StubTransport, transport: FakeTransport, clock: TestClock) throws -> UploadQueue {
        UploadQueue(
            database: try AppDatabase.inMemory(),
            directory: directory,
            transport: transport,
            now: { clock.now },
            clientFor: { _ in
                ServerClient(baseURL: URL(string: "https://trips.example.com")!, token: "osa_t", transport: server)
            }
        )
    }

    @Test func createsTheStepThenUploadsEachFile() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let transport = FakeTransport()
        let queue = try makeQueue(server: server, transport: transport, clock: TestClock())

        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: " Fjords ", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), media: [try media("a"), try media("clip", video: true)]
        )
        var snapshot = try queue.snapshot(accountID: account, tripID: 1)
        #expect(snapshot.localSteps.count == 1)
        #expect(snapshot.localSteps[0].step.body == "Fjords")
        #expect(snapshot.localSteps[0].uploads.count == 2)

        await queue.process()

        #expect(server.requests.map(\.path) == ["/api/v1/trips/1/steps"])
        #expect(transport.started.count == 2)
        let first = transport.started[0]
        #expect(first.request.url?.path() == "/api/v1/steps/42/media")
        #expect(first.request.value(forHTTPHeaderField: "Authorization") == "Bearer osa_t")
        #expect(first.request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)

        // The video's body carries file, poster, duration and the client UUID.
        let videoBody = try String(contentsOf: transport.started[1].body, encoding: .utf8)
        #expect(videoBody.contains("bytes of clip"))
        #expect(videoBody.contains("name=\"poster\""))
        #expect(videoBody.contains("5000"))
        #expect(videoBody.contains(transport.started[1].id))

        snapshot = try queue.snapshot(accountID: account, tripID: 1)
        #expect(snapshot.localSteps.isEmpty)
        #expect(snapshot.uploadsByStepID[42]?.map(\.state) == [.uploading, .uploading])
    }

    @Test func knowsWhetherAnythingIsStillOnItsWay() async throws {
        let server = StubTransport()
        let queue = try makeQueue(server: server, transport: FakeTransport(), clock: TestClock())
        #expect(try queue.hasPending(accountID: account) == false)

        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "Offline", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), media: []
        )
        #expect(try queue.hasPending(accountID: account))
        #expect(try queue.hasPending(accountID: UUID()) == false)

        await queue.removeAll(for: account)
        #expect(try queue.hasPending(accountID: account) == false)
    }

    @Test func finishesSucceedsFailsAndRetries() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let transport = FakeTransport()
        let clock = TestClock()
        let queue = try makeQueue(server: server, transport: transport, clock: clock)
        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "x", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), media: [try media("ok"), try media("big"), try media("flaky")]
        )
        await queue.process()
        let ids = transport.started.map(\.id)

        await queue.handleCompletion(
            uploadID: ids[0], statusCode: 201, body: Data(#"{"photo":{"id":7},"step":{}}"#.utf8), error: nil
        )
        await queue.handleCompletion(
            uploadID: ids[1], statusCode: 413,
            body: Data(#"{"type":"urn:ownsteps:problem:image_too_large","title":"","status":413,"code":"image_too_large"}"#.utf8),
            error: nil
        )
        await queue.handleCompletion(uploadID: ids[2], statusCode: nil, body: nil, error: URLError(.networkConnectionLost))

        let uploads = try #require(try queue.snapshot(accountID: account, tripID: 1).uploadsByStepID[42])
        #expect(uploads.count == 2)
        let failed = try #require(uploads.first { $0.id == ids[1] })
        #expect(failed.state == .failed)
        #expect(failed.lastError == "image_too_large")
        let retrying = try #require(uploads.first { $0.id == ids[2] })
        #expect(retrying.state == .queued)
        #expect(retrying.attempts == 1)
        #expect(try queue.uploadedAssetIDs(accountID: account) == ["asset-ok"])
        // The finished upload's files are gone.
        #expect(!FileManager.default.fileExists(atPath: transport.started[0].body.path(percentEncoded: false)))

        // Backoff: not again right away …
        await queue.process()
        #expect(transport.started.count == 3)
        // … but after the wait, with the body written the first time.
        clock.now = clock.now.addingTimeInterval(31)
        await queue.process()
        #expect(transport.started.count == 4)
        #expect(transport.started[3].id == ids[2])
        #expect(transport.started[3].body == transport.started[2].body)

        // A failed one goes again only when asked.
        await queue.retry(uploadID: ids[1])
        #expect(transport.started.last?.id == ids[1])
    }

    @Test func waitsOfflineAndKeepsEverything() async throws {
        let server = StubTransport() // no canned answer: behaves like an unreachable server
        server.failWith = URLError(.notConnectedToInternet)
        let transport = FakeTransport()
        let queue = try makeQueue(server: server, transport: transport, clock: TestClock())
        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "Written on the mountain", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), media: [try media("a")]
        )
        await queue.process()
        #expect(transport.started.isEmpty)
        #expect(try queue.snapshot(accountID: account, tripID: 1).localSteps.count == 1)
    }

    @Test func remembersWhyTheServerRefusedAStep() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (
            404, "application/problem+json",
            #"{"type":"urn:ownsteps:problem:trip_not_found","title":"","status":404,"code":"trip_not_found"}"#
        )
        let queue = try makeQueue(server: server, transport: FakeTransport(), clock: TestClock())
        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "x", placeName: nil, lat: nil, lon: nil, occurredAt: Date(), media: []
        )
        await queue.process()
        #expect(try queue.snapshot(accountID: account, tripID: 1).localSteps.first?.step.lastError == "trip_not_found")
    }

    @Test func publishesTextlessStepsOnlyWithTheirFirstPhoto() async throws {
        let queue = try makeQueue(server: StubTransport(), transport: FakeTransport(), clock: TestClock())
        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "  ", placeName: " ", lat: nil, lon: nil,
            occurredAt: Date(), media: [try media("a")]
        )
        let step = try #require(try queue.snapshot(accountID: account, tripID: 1).localSteps.first?.step)
        #expect(step.publish == false)
        #expect(step.placeName == nil)
    }

    @Test func requeuesUploadsTheSystemForgot() async throws {
        let server = StubTransport()
        server.responses["createStep"] = (201, "application/json", stepJSON)
        let transport = FakeTransport()
        let queue = try makeQueue(server: server, transport: transport, clock: TestClock())
        try await queue.enqueueStep(
            accountID: account, tripID: 1, body: "x", placeName: nil, lat: nil, lon: nil,
            occurredAt: Date(), media: [try media("a"), try media("b")]
        )
        await queue.process()
        transport.active = [transport.started[0].id]

        await queue.reconcile()
        let states = try #require(try queue.snapshot(accountID: account, tripID: 1).uploadsByStepID[42]).map(\.state)
        #expect(states == [.uploading, .queued])
    }
}

@Suite struct PreviewAndDateTests {
    @Test func makesUprightThumbnails() throws {
        // Stored 64×48 with orientation 6 (rotated): the preview is portrait.
        let thumb = try #require(MediaPreparation.thumbnail(fromImage: try makeHEIC(gps: nil), maxPixels: 32))
        let props = properties(of: thumb)
        #expect(props[kCGImagePropertyPixelWidth] as? Int == 24)
        #expect(props[kCGImagePropertyPixelHeight] as? Int == 32)
    }

    @Test func readsTheCaptureTimeInTheServerZone() throws {
        let date = try #require(MediaPreparation.captureDate(
            in: try makeHEIC(gps: nil), timeZone: TimeZone(identifier: "Europe/Oslo")!
        ))
        // 18:30 in Oslo in July is 16:30 UTC.
        #expect(ISO8601DateFormatter().string(from: date) == "2027-07-03T16:30:00Z")
    }
}
