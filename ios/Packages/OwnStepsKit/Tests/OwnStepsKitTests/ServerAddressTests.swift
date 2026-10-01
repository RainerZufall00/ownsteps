import Foundation
import Testing
@testable import OwnStepsKit

@Suite struct ServerAddressTests {
    @Test(arguments: [
        ("trips.example.com", "https://trips.example.com"),
        ("  https://Trips.Example.com/  ", "https://trips.example.com"),
        ("https://trips.example.com/s/AbC123", "https://trips.example.com"),
        ("https://example.com/ownsteps/s/abc?x=1#y", "https://example.com/ownsteps"),
        ("https://example.com:8443/trips/4/settings", "https://example.com:8443"),
        ("http://localhost:2555", "http://localhost:2555"),
        ("http://192.168.1.20:2555/", "http://192.168.1.20:2555"),
        ("http://nas.local", "http://nas.local"),
    ])
    func normalizes(input: String, expected: String) throws {
        #expect(try ServerAddress.normalize(input).absoluteString == expected)
    }

    @Test func rejectsPlainHTTPOnTheInternet() {
        #expect(throws: ServerAddress.Problem.insecure) {
            try ServerAddress.normalize("http://trips.example.com")
        }
    }

    @Test func rejectsGarbage() {
        #expect(throws: ServerAddress.Problem.empty) { try ServerAddress.normalize("   ") }
        #expect(throws: ServerAddress.Problem.invalid) { try ServerAddress.normalize("ftp://x.org") }
    }

    @Test func knowsLocalAddresses() {
        #expect(ServerAddress.isLocal("172.20.0.5"))
        #expect(ServerAddress.isLocal("10.0.0.1"))
        #expect(!ServerAddress.isLocal("172.32.0.1"))
        #expect(!ServerAddress.isLocal("8.8.8.8"))
    }
}

@Suite struct PKCETests {
    /// RFC 7636, appendix B – the server's `pkceChallenge()` gives the same.
    @Test func matchesTheRFC7636Example() {
        let pkce = PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        #expect(pkce.challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test func generatesLongEnoughVerifiers() {
        let pkce = PKCE.generate()
        #expect(pkce.verifier.count == 43)
        #expect(pkce.challenge.count == 43)
        #expect(PKCE.generate() != pkce)
    }
}

@Suite struct OIDCCallbackTests {
    @Test func extractsTheCode() throws {
        let url = URL(string: "ownsteps://auth?code=abc&state=s1")!
        #expect(try OIDCCallback.code(from: url, expectedState: "s1") == "abc")
    }

    @Test func rejectsAForeignState() {
        let url = URL(string: "ownsteps://auth?code=abc&state=other")!
        #expect(throws: OIDCCallback.Problem.mismatch) {
            try OIDCCallback.code(from: url, expectedState: "s1")
        }
    }

    @Test func reportsServerErrors() {
        let url = URL(string: "ownsteps://auth?error=oidc_not_allowed&state=s1")!
        #expect(throws: OIDCCallback.Problem.failed("oidc_not_allowed")) {
            try OIDCCallback.code(from: url, expectedState: "s1")
        }
    }
}

@Suite struct AppVersionTests {
    @Test func comparesComponentWise() {
        #expect(AppVersion("1.10.0") > AppVersion("1.9.9"))
        #expect(AppVersion("1.0") == AppVersion("1.0.0"))
        #expect(AppVersion("2") > AppVersion("1.99"))
    }
}
