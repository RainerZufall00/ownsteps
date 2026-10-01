import CryptoKit
import Foundation

/// PKCE between the app and its server: the one-time code that comes back
/// through `ownsteps://auth` is worthless without the verifier, which never
/// leaves the app ([D14]).
public struct PKCE: Sendable, Equatable {
    public let verifier: String
    public var challenge: String { Self.challenge(for: verifier) }

    public init(verifier: String) {
        self.verifier = verifier
    }

    /// 32 random bytes → 43 characters, the minimum RFC 7636 allows.
    public static func generate() -> PKCE {
        PKCE(verifier: randomBase64URL(byteCount: 32))
    }

    public static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func randomBase64URL(byteCount: Int) -> String {
        var generator = SystemRandomNumberGenerator()
        let bytes = (0..<byteCount).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
        return base64URL(Data(bytes))
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
