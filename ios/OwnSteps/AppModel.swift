import AuthenticationServices
import Foundation
import OwnStepsKit
import SwiftUI
import UIKit

/// A server that answered `/api/v1/info` and waits for someone to sign in.
struct PendingServer: Hashable {
    let url: URL
    let info: Components.Schemas.Info
}

/// The app's state: which servers it's signed in to. Tokens stay in the
/// Keychain, the account list in UserDefaults.
@Observable
final class AppModel {
    private(set) var accounts: [Account]
    /// Shown once on the welcome screen, e.g. after the server revoked the token.
    var notice: String?
    private let tokens: any TokenStore
    private let store: AccountStore

    init(tokens: any TokenStore = KeychainTokenStore(), store: AccountStore = AccountStore()) {
        self.tokens = tokens
        self.store = store
        self.accounts = store.load()
    }

    var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// Shown to the authors in the web UI's device list ([D15]).
    var deviceName: String { UIDevice.current.name }

    var authorAccounts: [Account] { accounts.filter { $0.kind == .author } }

    // MARK: Connecting

    func connect(to address: String) async throws -> PendingServer {
        let url = try ServerAddress.normalize(address)
        let info = try await ServerClient(baseURL: url).info(appVersion: appVersion)
        return PendingServer(url: url, info: info)
    }

    func signIn(on server: PendingServer, email: String, password: String) async throws {
        let signedIn = try await ServerClient(baseURL: server.url)
            .signIn(email: email, password: password, deviceName: deviceName)
        try add(signedIn, on: server)
    }

    /// OIDC through the server ([D14]): the system browser sheet runs the
    /// provider's sign-in, the server hands back a one-time code via
    /// `ownsteps://auth`, and only this app can redeem it (PKCE).
    func signInWithOIDC(
        on server: PendingServer,
        using session: WebAuthenticationSession
    ) async throws {
        let client = ServerClient(baseURL: server.url)
        let pkce = PKCE.generate()
        let state = PKCE.generate().verifier
        let callback = try await session.authenticate(
            using: client.oidcStartURL(pkce: pkce, state: state, deviceName: deviceName),
            callback: .customScheme(OIDCCallback.scheme),
            additionalHeaderFields: [:]
        )
        let code = try OIDCCallback.code(from: callback, expectedState: state)
        try add(try await client.exchange(code: code, pkce: pkce), on: server)
    }

    private func add(_ signedIn: ServerClient.SignedIn, on server: PendingServer) throws {
        // Signing in again to the same server replaces the old account.
        for old in accounts where old.kind == .author && old.serverURL == server.url {
            try? tokens.removeToken(for: old.id)
        }
        let account = Account(
            serverURL: server.url,
            serverName: server.info.name,
            kind: .author,
            displayName: signedIn.user.name,
            email: signedIn.user.email
        )
        try tokens.setToken(signedIn.token, for: account.id)
        accounts.removeAll { $0.kind == .author && $0.serverURL == server.url }
        accounts.append(account)
        store.save(accounts)
    }

    // MARK: Using an account

    func client(for account: Account) -> ServerClient {
        ServerClient(baseURL: account.serverURL, token: try? tokens.token(for: account.id))
    }

    /// Signs out on the server (best effort – offline it just forgets the
    /// token) and removes the account from the device.
    func signOut(_ account: Account) async {
        try? await client(for: account).signOut()
        forget(account)
    }

    /// For tokens the server no longer accepts – e.g. signed out in the web UI.
    func signedOutByServer(_ account: Account) {
        notice = String(localized: "\(account.serverURL.host() ?? account.serverName) signed this device out.")
        forget(account)
    }

    func forget(_ account: Account) {
        try? tokens.removeToken(for: account.id)
        accounts.removeAll { $0.id == account.id }
        store.save(accounts)
    }
}
