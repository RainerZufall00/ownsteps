import Foundation

/// Turns whatever someone types or pastes into the base URL of an OwnSteps
/// server: "trips.example.com", "https://trips.example.com/",
/// or a whole share link like "https://trips.example.com/s/abc".
public enum ServerAddress {
    public enum Problem: Error, Equatable, Sendable {
        case empty
        case invalid
        /// Plain HTTP is only allowed inside the local network ([D26]).
        case insecure
    }

    public static func normalize(_ input: String) throws(Problem) -> URL {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw .empty }
        if !text.contains("://") { text = "https://" + text }

        guard var components = URLComponents(string: text),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              let host = components.host, !host.isEmpty
        else { throw .invalid }

        if scheme == "http" && !isLocal(host) { throw .insecure }

        // A pasted share link or page: keep only what precedes /s/, /trips/ …
        var path = components.path
        for marker in ["/s/", "/trips/", "/api/", "/login", "/settings"] {
            if let range = path.range(of: marker) {
                path = String(path[..<range.lowerBound])
            }
        }
        while path.hasSuffix("/") { path.removeLast() }

        components.scheme = scheme
        components.host = host.lowercased()
        components.path = path
        components.query = nil
        components.fragment = nil
        components.user = nil
        components.password = nil
        guard let url = components.url else { throw .invalid }
        return url
    }

    /// Hosts App Transport Security lets through without TLS
    /// (`NSAllowsLocalNetworking`): localhost, .local names and private IPs.
    static func isLocal(_ host: String) -> Bool {
        let host = host.lowercased()
        if host == "localhost" || host.hasSuffix(".local") || host == "::1" { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        switch (parts[0], parts[1]) {
        case (10, _), (127, _), (192, 168), (169, 254): return true
        case (172, 16...31): return true
        default: return false
        }
    }
}
