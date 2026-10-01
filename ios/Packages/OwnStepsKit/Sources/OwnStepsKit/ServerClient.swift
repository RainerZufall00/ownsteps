import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@_exported import OwnStepsAPI

/// One OwnSteps server, seen through the generated API client.
public struct ServerClient: Sendable {
    public let baseURL: URL
    let token: String?
    let client: Client

    public init(
        baseURL: URL,
        token: String? = nil,
        transport: any ClientTransport = URLSessionTransport()
    ) {
        self.baseURL = baseURL
        self.token = token
        // The server writes dates with milliseconds ("…T08:30:00.000Z").
        let configuration = Configuration(dateTranscoder: .iso8601WithFractionalSeconds)
        self.client = Client(
            serverURL: baseURL,
            configuration: configuration,
            transport: transport,
            middlewares: token.map { [BearerMiddleware(token: $0)] } ?? []
        )
    }

    // MARK: Server info

    /// Checks the address really is an OwnSteps server this app can talk to.
    public func info(appVersion: String) async throws -> Components.Schemas.Info {
        let output: Operations.GetInfo.Output
        do {
            output = try await client.getInfo()
        } catch let error as ClientError where error.underlyingError is URLError {
            // Unreachable, unknown host, TLS trouble: say so, not "wrong server".
            throw error.underlyingError
        } catch {
            // Anything that isn't our JSON – a web page, a 404 – lands here.
            throw APIError.notOwnSteps
        }
        switch output {
        case .ok(let response):
            let info = try response.body.json
            guard info.apiVersion == 1,
                  AppVersion(appVersion) >= AppVersion(info.minAppVersion)
            else { throw APIError.incompatible(serverVersion: info.version) }
            return info
        case .default:
            throw APIError.notOwnSteps
        }
    }

    // MARK: Signing in

    public struct SignedIn: Sendable, Equatable {
        public let token: String
        public let user: Components.Schemas.User
    }

    public func signIn(email: String, password: String, deviceName: String) async throws -> SignedIn {
        let output = try await client.createToken(
            body: .json(.init(email: email, password: password, deviceName: deviceName))
        )
        switch output {
        case .created(let response):
            let body = try response.body.json
            return SignedIn(token: body.token, user: body.user)
        case .default(let status, let response):
            throw problem(response.body, status: status)
        }
    }

    /// The page the app opens in an `ASWebAuthenticationSession`.
    public func oidcStartURL(pkce: PKCE, state: String, deviceName: String) -> URL {
        var components = URLComponents(
            url: baseURL.appending(path: "api/v1/auth/oidc/start"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "device_name", value: deviceName),
        ]
        return components.url!
    }

    public func exchange(code: String, pkce: PKCE) async throws -> SignedIn {
        let output = try await client.exchangeOidcCode(
            body: .json(.init(code: code, codeVerifier: pkce.verifier))
        )
        switch output {
        case .created(let response):
            let body = try response.body.json
            return SignedIn(token: body.token, user: body.user)
        case .default(let status, let response):
            throw problem(response.body, status: status)
        }
    }

    /// Signs this device out on the server; the token stops working.
    public func signOut() async throws {
        switch try await client.revokeToken() {
        case .noContent:
            return
        case .default(let status, let response):
            throw problem(response.body, status: status)
        }
    }

    // MARK: Trips

    public func trips() async throws -> [Components.Schemas.Trip] {
        switch try await client.listTrips() {
        case .ok(let response):
            return try response.body.json.items
        case .default(let status, let response):
            throw problem(response.body, status: status)
        }
    }

    /// A trip with its published steps, oldest first.
    public func trip(id: Int) async throws -> Components.Schemas.TripDetail {
        switch try await client.getTrip(path: .init(tripId: String(id))) {
        case .ok(let response):
            return try response.body.json
        case .default(let status, let response):
            throw problem(response.body, status: status)
        }
    }

    // MARK: Media

    /// Photo and video files go around the generated client: images are
    /// cached by `MediaStore`, videos streamed by AVPlayer.
    public func mediaRequest(photoID: Int, variant: MediaVariant) -> URLRequest {
        // MediaStore keeps the files; nothing goes into URLCache.
        var request = URLRequest(
            url: baseURL.appending(path: "api/v1/photos/\(photoID)/\(variant.rawValue)"),
            cachePolicy: .reloadIgnoringLocalCacheData
        )
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    // MARK: Helpers

    func problem<Body>(_ body: Body, status: Int) -> APIError {
        // Every error response is a problem document; the generated enums
        // differ per operation, so look for the payload by type.
        if let problem = Mirror(reflecting: body).children.first?.value
            as? Components.Schemas.Problem
        {
            return .from(problem)
        }
        return .unexpected(status: status)
    }
}

/// Adds the device or viewer token to every request.
struct BearerMiddleware: ClientMiddleware {
    let token: String

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[.authorization] = "Bearer \(token)"
        return try await next(request, body, baseURL)
    }
}

/// "1.2.3" compared component by component; missing parts count as 0.
struct AppVersion: Comparable {
    let parts: [Int]

    init(_ text: String) {
        parts = text.split(separator: ".").map { Int($0) ?? 0 }
    }

    static func == (lhs: AppVersion, rhs: AppVersion) -> Bool {
        !(lhs < rhs) && !(rhs < lhs)
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        for index in 0..<max(lhs.parts.count, rhs.parts.count) {
            let left = index < lhs.parts.count ? lhs.parts[index] : 0
            let right = index < rhs.parts.count ? rhs.parts[index] : 0
            if left != right { return left < right }
        }
        return false
    }
}
