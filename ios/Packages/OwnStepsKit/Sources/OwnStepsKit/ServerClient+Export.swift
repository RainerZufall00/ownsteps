import Foundation
import OwnStepsAPI

/// Keeping a trip: the offline album and sending it to Immich (authors).
extension ServerClient {
    /// Downloads the trip as an offline album (a ZIP) into a temporary file
    /// with the server's file name – ready for the share sheet. Directly,
    /// not through the generated client, so the file isn't held in memory.
    public func downloadAlbum(tripID: Int, session: URLSession = .shared) async throws -> URL {
        let request = authorized(URLRequest(url: baseURL.appending(path: "api/v1/trips/\(tripID)/export")))
        let (file, response) = try await session.download(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            try? FileManager.default.removeItem(at: file)
            throw APIError.unexpected(status: status)
        }
        let name = http.suggestedFilename.flatMap { $0.isEmpty ? nil : $0 } ?? "trip-\(tripID).zip"
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appending(path: name)
        try FileManager.default.moveItem(at: file, to: destination)
        return destination
    }

    public func immichStatus(tripID: Int) async throws -> Components.Schemas.ImmichStatus {
        switch try await client.immichStatus(path: .init(tripId: String(tripID))) {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    /// Starts sending the trip to the author's Immich (connected in the web).
    public func startImmichExport(tripID: Int) async throws -> Components.Schemas.ImmichStatus {
        switch try await client.startImmichExport(path: .init(tripId: String(tripID))) {
        case .accepted(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }
}

extension ServerClient {
    // MARK: Immich connection

    public func immichConnection() async throws -> Components.Schemas.ImmichConnection {
        switch try await client.getImmichConnection() {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    /// Checks address and key against Immich (on the server) and stores them.
    public func connectImmich(url: String, apiKey: String) async throws -> Components.Schemas.ImmichConnection {
        switch try await client.connectImmich(body: .json(.init(url: url, apiKey: apiKey))) {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func disconnectImmich() async throws {
        switch try await client.disconnectImmich() {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }
}
