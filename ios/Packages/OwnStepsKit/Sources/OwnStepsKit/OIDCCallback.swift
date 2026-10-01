import Foundation

/// The end of the app's OIDC sign-in: `ownsteps://auth?code=…&state=…`
/// or `ownsteps://auth?error=…&state=…`.
public enum OIDCCallback {
    public static let scheme = "ownsteps"

    public enum Problem: Error, Equatable, Sendable {
        /// Not our callback, or the state doesn't match the one we sent.
        case mismatch
        /// The server reports why sign-in failed (e.g. `oidc_not_allowed`).
        case failed(String)
    }

    public static func code(from url: URL, expectedState: String) throws(Problem) -> String {
        guard url.scheme == scheme, url.host() == "auth",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { throw .mismatch }
        let value = { (name: String) in items.first { $0.name == name }?.value }
        guard value("state") == expectedState else { throw .mismatch }
        if let error = value("error") { throw .failed(error) }
        guard let code = value("code"), !code.isEmpty else { throw .mismatch }
        return code
    }
}
