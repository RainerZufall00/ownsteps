import Foundation
import OwnStepsAPI

/// Everything an author changes. Optional fields left `nil` keep their value
/// on the server; an empty string clears a text or date field.
extension ServerClient {
    // MARK: Trips

    public func createTrip(
        title: String,
        summary: String?,
        startDate: String?,
        endDate: String?
    ) async throws -> Components.Schemas.Trip {
        let output = try await client.createTrip(
            body: .json(.init(title: title, summary: summary, startDate: startDate, endDate: endDate))
        )
        switch output {
        case .created(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func updateTrip(
        id: Int,
        _ patch: Components.Schemas.TripPatch
    ) async throws -> Components.Schemas.Trip {
        let output = try await client.updateTrip(path: .init(tripId: String(id)), body: .json(patch))
        switch output {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    /// The upload request for a trip's cover (multipart, field `file`).
    public func coverUploadRequest(tripID: Int, contentType: String) -> URLRequest {
        uploadRequest(path: "api/v1/trips/\(tripID)/cover", contentType: contentType)
    }

    // MARK: Steps

    /// Idempotent through `clientUUID`: a retry returns the step created the
    /// first time ([D19]).
    public func createStep(
        tripID: Int,
        clientUUID: String,
        body: String,
        placeName: String?,
        lat: Double?,
        lon: Double?,
        occurredAt: Date,
        publish: Bool
    ) async throws -> Components.Schemas.Step {
        let output = try await client.createStep(
            path: .init(tripId: String(tripID)),
            body: .json(.init(
                clientUuid: clientUUID,
                body: body,
                placeName: placeName,
                lat: lat,
                lon: lon,
                occurredAt: occurredAt,
                publish: publish
            ))
        )
        switch output {
        case .created(let response): return try response.body.json
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func updateStep(id: Int, _ patch: Components.Schemas.StepPatch) async throws -> Components.Schemas.Step {
        let output = try await client.updateStep(path: .init(stepId: String(id)), body: .json(patch))
        switch output {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func deleteStep(id: Int) async throws {
        switch try await client.deleteStep(path: .init(stepId: String(id))) {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    /// The upload request for one photo or video (multipart, see `UploadQueue`).
    public func mediaUploadRequest(stepID: Int, contentType: String) -> URLRequest {
        uploadRequest(path: "api/v1/steps/\(stepID)/media", contentType: contentType)
    }

    // MARK: Photos

    /// `nil` or an empty caption removes it.
    public func updateCaption(photoID: Int, caption: String?) async throws -> Components.Schemas.Photo {
        let output = try await client.updatePhoto(
            path: .init(photoId: String(photoID)),
            body: .json(.init(caption: caption ?? ""))
        )
        switch output {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func deletePhoto(id: Int) async throws {
        switch try await client.deletePhoto(path: .init(photoId: String(id))) {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    // MARK: Helpers

    private func uploadRequest(path: String, contentType: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }
}
