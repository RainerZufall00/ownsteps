import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import OwnStepsKit

/// Answers requests with canned responses and remembers what it was asked.
final class StubTransport: ClientTransport, @unchecked Sendable {
    var responses: [String: (status: Int, contentType: String, body: String)] = [:]
    private(set) var requests: [HTTPRequest] = []

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        requests.append(request)
        guard let canned = responses[operationID] else {
            return (HTTPResponse(status: .notFound), HTTPBody("<html>404</html>"))
        }
        var response = HTTPResponse(status: .init(code: canned.status))
        response.headerFields[.contentType] = canned.contentType
        return (response, HTTPBody(canned.body))
    }
}

let infoJSON = """
{"name":"OwnSteps","version":"0.1.0","apiVersion":1,"minAppVersion":"1.0.0",
 "setupComplete":true,"timeZone":"Europe/Berlin","auth":{"password":true,"oidc":true,"oidcLabel":"Pocket ID"},
 "features":["viewers","changes"]}
"""

@Suite struct ServerClientTests {
    let base = URL(string: "https://trips.example.com")!

    @Test func readsServerInfo() async throws {
        let transport = StubTransport()
        transport.responses["getInfo"] = (200, "application/json", infoJSON)
        let info = try await ServerClient(baseURL: base, transport: transport)
            .info(appVersion: "1.0.0")
        #expect(info.auth.oidcLabel == "Pocket ID")
        #expect(transport.requests.first?.path == "/api/v1/info")
    }

    @Test func refusesTooOldApps() async {
        let transport = StubTransport()
        transport.responses["getInfo"] = (
            200, "application/json",
            infoJSON.replacingOccurrences(of: "\"minAppVersion\":\"1.0.0\"", with: "\"minAppVersion\":\"2.0.0\"")
        )
        await #expect(throws: APIError.incompatible(serverVersion: "0.1.0")) {
            try await ServerClient(baseURL: base, transport: transport).info(appVersion: "1.0.0")
        }
    }

    @Test func recognizesForeignServers() async {
        let transport = StubTransport()
        await #expect(throws: APIError.notOwnSteps) {
            try await ServerClient(baseURL: base, transport: transport).info(appVersion: "1.0.0")
        }
    }

    @Test func mapsProblemDocuments() async {
        let transport = StubTransport()
        transport.responses["createToken"] = (
            401, "application/problem+json",
            #"{"type":"urn:ownsteps:problem:credentials_invalid","title":"x","status":401,"code":"credentials_invalid"}"#
        )
        await #expect(throws: APIError.problem(code: "credentials_invalid", status: 401)) {
            try await ServerClient(baseURL: base, transport: transport)
                .signIn(email: "a@b.c", password: "x", deviceName: "iPhone")
        }
    }

    @Test func sendsTheTokenAndParsesDates() async throws {
        let transport = StubTransport()
        transport.responses["listTrips"] = (
            200, "application/json",
            #"{"items":[{"id":1,"title":"Norway","summary":null,"startDate":"2026-07-01","endDate":null,"coverPhotoId":null,"stepCount":2,"photoCount":3,"firstStepAt":"2026-07-02T08:30:00.000Z","lastStepAt":null,"updatedAt":"2026-07-03T10:00:00.000Z"}],"nextCursor":null}"#
        )
        let trips = try await ServerClient(baseURL: base, token: "osa_secret", transport: transport).trips()
        #expect(trips.first?.title == "Norway")
        #expect(trips.first?.firstStepAt == ISO8601DateFormatter().date(from: "2026-07-02T08:30:00Z"))
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer osa_secret")
    }

    @Test func buildsTheOIDCStartURL() throws {
        let pkce = PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        let url = ServerClient(baseURL: URL(string: "https://example.com/ownsteps")!)
            .oidcStartURL(pkce: pkce, state: "s1", deviceName: "Matthias’ iPhone")
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.path == "/ownsteps/api/v1/auth/oidc/start")
        #expect(components.queryItems?.first { $0.name == "code_challenge" }?.value == pkce.challenge)
    }
}

@Suite struct TokenStoreTests {
    @Test func storesAndRemovesTokens() throws {
        let store = InMemoryTokenStore()
        let id = UUID()
        try store.setToken("osa_1", for: id)
        #expect(try store.token(for: id) == "osa_1")
        try store.removeToken(for: id)
        #expect(try store.token(for: id) == nil)
    }
}
