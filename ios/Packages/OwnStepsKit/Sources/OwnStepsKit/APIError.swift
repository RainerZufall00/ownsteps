import Foundation
import OwnStepsAPI

/// What can go wrong talking to a server, reduced to what the app needs to
/// decide what to show.
public enum APIError: Error, Equatable, Sendable {
    /// The server answered with a problem document; `code` is stable ([D12]).
    case problem(code: String, status: Int)
    /// The address answers, but not like an OwnSteps server.
    case notOwnSteps
    /// The server is older than this app supports, or the other way round.
    case incompatible(serverVersion: String)
    /// Anything the API description doesn't cover.
    case unexpected(status: Int)

    public var code: String? {
        if case let .problem(code, _) = self { return code }
        return nil
    }

    /// The token is gone or revoked – the account needs signing in again.
    public var isUnauthorized: Bool {
        if case let .problem(_, status) = self { return status == 401 }
        return false
    }

    static func from(_ problem: Components.Schemas.Problem) -> APIError {
        .problem(code: problem.code, status: problem.status)
    }
}
