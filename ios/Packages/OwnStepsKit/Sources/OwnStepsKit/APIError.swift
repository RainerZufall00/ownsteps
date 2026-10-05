import Foundation
import OpenAPIRuntime
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

    /// The generated client wraps transport failures in `ClientError`; the
    /// cause inside (usually a `URLError`) is what's worth showing.
    public static func underlying(_ error: any Error) -> any Error {
        var current = error
        while let wrapped = current as? ClientError {
            current = wrapped.underlyingError
        }
        return current
    }

    static func from(_ problem: Components.Schemas.Problem) -> APIError {
        .problem(code: problem.code, status: problem.status)
    }

    /// The `code` of a problem document – for responses that bypass the
    /// generated client (uploads).
    static func problemCode(in body: Data) -> String? {
        struct Problem: Decodable { let code: String }
        return (try? JSONDecoder().decode(Problem.self, from: body))?.code
    }

    /// A failed upload response as an error, like the generated client's.
    static func from(responseBody body: Data, status: Int) -> APIError {
        problemCode(in: body).map { .problem(code: $0, status: status) } ?? .unexpected(status: status)
    }
}
