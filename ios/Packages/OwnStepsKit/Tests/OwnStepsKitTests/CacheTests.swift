import Foundation
import Testing
@testable import OwnStepsKit

@Suite struct TripCalendarTests {
    let berlin = TripCalendar(timeZone: TimeZone(identifier: "Europe/Berlin")!)

    @Test func countsDaysFromTheStart() throws {
        let start = try #require(berlin.date(fromCalendarDay: "2026-07-01"))
        // 23:30 UTC on July 3rd is already July 4th in Berlin.
        let late = try #require(ISO8601DateFormatter().date(from: "2026-07-03T23:30:00Z"))
        #expect(berlin.tripDay(of: start, start: start) == 1)
        #expect(berlin.tripDay(of: late, start: start) == 4)
    }

    @Test func readsCalendarDaysInTheServerZone() throws {
        let start = try #require(berlin.date(fromCalendarDay: "2026-07-01"))
        #expect(ISO8601DateFormatter().string(from: start) == "2026-06-30T22:00:00Z")
        #expect(berlin.date(fromCalendarDay: "nonsense") == nil)
    }

    @Test func writesCalendarDaysInTheServerZone() throws {
        // 23:30 UTC on July 3rd is already July 4th in Berlin.
        let late = try #require(ISO8601DateFormatter().date(from: "2026-07-03T23:30:00Z"))
        #expect(berlin.calendarDay(of: late) == "2026-07-04")
        let start = try #require(berlin.date(fromCalendarDay: "2026-07-01"))
        #expect(berlin.calendarDay(of: start) == "2026-07-01")
    }

    @Test func prefersTheEnteredStart() throws {
        let firstStep = try #require(ISO8601DateFormatter().date(from: "2026-07-03T10:00:00Z"))
        #expect(berlin.tripStart(startDate: "2026-07-01", firstStepAt: firstStep)
            == berlin.date(fromCalendarDay: "2026-07-01"))
        #expect(berlin.tripStart(startDate: nil, firstStepAt: firstStep) == firstStep)
    }
}

@Suite struct TripCacheTests {
    func trip(_ id: Int, title: String) -> Components.Schemas.Trip {
        .init(
            id: id, title: title, summary: nil, startDate: "2026-07-01", endDate: nil,
            coverPhotoId: nil, stepCount: 0, photoCount: 0, firstStepAt: nil, lastStepAt: nil,
            updatedAt: Date(timeIntervalSince1970: 1_800_000_000)
        )
    }

    @Test func keepsTripListsPerAccount() throws {
        let cache = try TripCache.inMemory()
        let alice = UUID(), bob = UUID()
        try cache.saveTrips([trip(1, title: "Norway")], for: alice)
        #expect(try cache.trips(for: alice)?.value.map(\.title) == ["Norway"])
        #expect(try cache.trips(for: bob) == nil)

        try cache.saveTrips([trip(2, title: "Iceland")], for: alice)
        #expect(try cache.trips(for: alice)?.value.map(\.title) == ["Iceland"])
    }

    @Test func forgetsEverythingOnSignOut() throws {
        let cache = try TripCache.inMemory()
        let alice = UUID()
        try cache.saveTrips([trip(1, title: "Norway")], for: alice)
        try cache.removeAll(for: alice)
        #expect(try cache.trips(for: alice) == nil)
    }
}

/// Serves canned bytes and counts requests.
final class CountingProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requests = 0
    nonisolated(unsafe) static var lastAuthorization: String?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests += 1
        Self.lastAuthorization = request.value(forHTTPHeaderField: "Authorization")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("webp-bytes".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@Suite(.serialized) struct MediaStoreTests {
    @Test func loadsOnceThenServesFromDisk() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CountingProtocol.self]
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        let client = ServerClient(baseURL: URL(string: "https://trips.example.com")!, token: "osa_t")
        let account = UUID()
        CountingProtocol.requests = 0

        let first = MediaStore(directory: directory, session: URLSession(configuration: configuration))
        let data = try await first.data(
            accountID: account, photoID: 7, fileKey: "k1", variant: .medium,
            request: client.mediaRequest(photoID: 7, variant: .medium)
        )
        #expect(String(decoding: data, as: UTF8.self) == "webp-bytes")
        #expect(CountingProtocol.lastAuthorization == "Bearer osa_t")

        // A fresh store (new app launch) finds the file on disk.
        let second = MediaStore(directory: directory, session: URLSession(configuration: configuration))
        _ = try await second.data(
            accountID: account, photoID: 7, fileKey: "k1", variant: .medium,
            request: client.mediaRequest(photoID: 7, variant: .medium)
        )
        #expect(CountingProtocol.requests == 1)

        // The same ID with other files – a server restored from a backup.
        _ = try await second.data(
            accountID: account, photoID: 7, fileKey: "k2", variant: .medium,
            request: client.mediaRequest(photoID: 7, variant: .medium)
        )
        #expect(CountingProtocol.requests == 2)

        await second.removeAll(for: account)
        _ = try await second.data(
            accountID: account, photoID: 7, fileKey: "k1", variant: .medium,
            request: client.mediaRequest(photoID: 7, variant: .medium)
        )
        #expect(CountingProtocol.requests == 3)
    }
}

@Suite struct TripDetailTests {
    /// Every field of `Trip` must be carried over – a new one in the API
    /// would otherwise be silently dropped by `withoutSteps`.
    @Test func keepsEveryTripField() throws {
        let json = #"{"id":7,"title":"Norway","summary":"Fjords","startDate":"2026-07-01","endDate":"2026-07-20","coverPhotoId":3,"stepCount":2,"photoCount":5,"firstStepAt":"2026-07-02T10:00:00.000Z","lastStepAt":"2026-07-04T10:00:00.000Z","updatedAt":"2026-07-04T11:00:00.000Z","share":{"enabled":true,"url":"https://example.com/s/x","hasPassword":false},"steps":[]}"#
        let detail = try JSONDecoder.api.decode(Components.Schemas.TripDetail.self, from: Data(json.utf8))
        let fields = Dictionary(uniqueKeysWithValues: Mirror(reflecting: detail).children.compactMap { child in
            child.label.map { ($0, String(describing: child.value)) }
        })
        let trip = Mirror(reflecting: detail.withoutSteps).children
        #expect(!trip.isEmpty)
        for child in trip {
            let label = try #require(child.label)
            #expect(fields[label] == String(describing: child.value), "\(label) differs")
        }
        #expect(Set(fields.keys).subtracting(trip.compactMap(\.label)) == ["steps"])
    }
}
