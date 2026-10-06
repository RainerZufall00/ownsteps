import Foundation
import OwnStepsAPI

/// Readers ([D17]), comments and the change feed ([D16]).
extension ServerClient {
    // MARK: Following a trip

    /// Redeems a share link for a viewer token. The password is only needed
    /// if the trip has one; the server answers `share_password_wrong` then.
    public func redeem(
        shareLink: String,
        password: String?,
        name: String,
        deviceName: String
    ) async throws -> Components.Schemas.ViewerToken {
        let output = try await client.redeemShareLink(
            body: .json(.init(shareLink: shareLink, password: password, name: name, deviceName: deviceName))
        )
        switch output {
        case .created(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    /// With a viewer token: forget this device on the server.
    public func unfollow() async throws {
        switch try await client.unfollowTrip() {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    // MARK: Managing readers (authors)

    public func viewers(tripID: Int) async throws -> [Components.Schemas.Viewer] {
        switch try await client.listViewers(path: .init(tripId: String(tripID))) {
        case .ok(let response): return try response.body.json.items
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func removeViewer(id: Int) async throws {
        switch try await client.removeViewer(path: .init(viewerId: String(id))) {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func removeAllViewers(tripID: Int) async throws {
        switch try await client.removeAllViewers(path: .init(tripId: String(tripID))) {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    // MARK: Comments

    /// Authors comment under their account name, readers under theirs.
    public func comment(stepID: Int, body: String) async throws -> Components.Schemas.Comment {
        let output = try await client.createComment(
            path: .init(stepId: String(stepID)),
            body: .json(.init(body: body))
        )
        switch output {
        case .created(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    public func deleteComment(id: Int) async throws {
        switch try await client.deleteComment(path: .init(commentId: String(id))) {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    // MARK: Views

    /// Reports steps the reader has looked at, so the authors see how often
    /// each was read. The server ignores authors, so callers needn't know
    /// who they are.
    public func recordViews(tripID: Int, stepIDs: [Int]) async throws {
        let output = try await client.recordViews(
            path: .init(tripId: String(tripID)),
            body: .json(.init(stepIds: stepIDs))
        )
        switch output {
        case .noContent: return
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }

    // MARK: Changes

    /// Changes after `cursor`; without one, only the current cursor.
    public func changes(since cursor: Int?) async throws -> Components.Schemas.ChangeFeed {
        let output = try await client.getChanges(query: .init(since: cursor.map(String.init)))
        switch output {
        case .ok(let response): return try response.body.json
        case .default(let status, let response): throw problem(response.body, status: status)
        }
    }
}
