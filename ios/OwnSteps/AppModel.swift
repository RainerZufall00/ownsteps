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
/// Keychain, the account list in UserDefaults – both shared with the Share
/// Extension through the app group.
@Observable
final class AppModel {
    private(set) var accounts: [Account]
    /// Shown once on the welcome screen, e.g. after the server revoked the token.
    var notice: String?
    /// An invitation to follow a trip, from `ownsteps://join` ([D18]).
    var pendingInvite: Invite?
    /// A trip to show, e.g. after tapping a notification.
    var openTrip: TripRoute?
    /// Trips as last seen, for offline reading ([D22]).
    let cache: TripCache
    /// Photos, loaded with the account's token and kept on disk.
    let media: MediaStore
    /// Steps and photos on their way to the server ([D19]).
    let uploads: UploadQueue
    /// The app's own upload session plus those the Share Extension started.
    let uploaders: UploaderGroup
    /// Progress of running uploads by upload ID, 0…1. Only in memory.
    private(set) var uploadProgress: [String: Double] = [:]
    /// App group shared with the Share Extension; nil if the build has none.
    let shared = SharedContainer.current
    /// Done once the Share Extension's submissions are in the queue and the
    /// upload sessions are connected – nothing may report results before.
    private var queueReady: Task<Void, Never>?
    private let tokens: any TokenStore
    private let store: AccountStore

    init(
        tokens: any TokenStore = KeychainTokenStore(accessGroup: SharedContainer.keychainAccessGroup),
        store: AccountStore = AccountStore(suiteName: SharedContainer.current?.groupIdentifier)
    ) {
        self.tokens = tokens
        self.store = store
        self.accounts = store.load()

        let support = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        // Without a working cache the app still works online; it just can't
        // keep anything for later. `path()` would percent-encode the space in
        // "Application Support" and point SQLite at a folder that doesn't exist.
        let databasePath = support.appending(path: "cache.sqlite").path(percentEncoded: false)
        let database: AppDatabase
        do {
            database = try AppDatabase(path: databasePath)
        } catch {
            assertionFailure("Database unavailable: \(error)")
            database = try! AppDatabase.inMemory()
        }
        self.cache = TripCache(database: database)
        self.media = MediaStore(directory: support.appending(path: "Media", directoryHint: .isDirectory))
        // Queued before the app group existed: move it where the queue looks now.
        let oldUploads = support.appending(path: "Uploads", directoryHint: .isDirectory)
        if let shared, let files = try? FileManager.default.contentsOfDirectory(at: oldUploads, includingPropertiesForKeys: nil) {
            try? FileManager.default.createDirectory(at: shared.uploadsDirectory, withIntermediateDirectories: true)
            for file in files {
                try? FileManager.default.moveItem(at: file, to: shared.uploadsDirectory.appending(path: file.lastPathComponent))
            }
            try? FileManager.default.removeItem(at: oldUploads)
        }
        self.uploaders = UploaderGroup(sharedContainerIdentifier: shared?.groupIdentifier)
        self.uploads = UploadQueue(
            database: database,
            // In the app group, where the Share Extension leaves its files.
            directory: shared?.uploadsDirectory ?? oldUploads,
            transport: uploaders,
            clientFor: { [tokens, store] accountID in
                guard let account = store.load().first(where: { $0.id == accountID }) else { return nil }
                return ServerClient(baseURL: account.serverURL, token: try? tokens.token(for: accountID))
            }
        )

        let (uploads, uploaders, inbox) = (self.uploads, self.uploaders, shared?.inbox)
        uploaders.onCompletion = { id, status, body, error in
            Task {
                await uploads.handleCompletion(uploadID: id, statusCode: status, body: body, error: error)
                await uploads.process()
                await uploaders.releaseIdleSessions()
            }
        }
        uploaders.onProgress = { [weak self] id, fraction in
            Task { @MainActor in self?.uploadProgress[id] = fraction }
        }
        queueReady = Task {
            if let inbox { await uploads.importInbox(inbox) }
            uploaders.main.activate()
            for id in await uploads.shareSessionIDs() { uploaders.uploader(for: id) }
        }
        publishShareTargets()
    }

    /// On launch and whenever the app comes back: take over what the Share
    /// Extension wrote, pick up where uploads left off and start what's due.
    func resumeUploads() {
        let (uploads, uploaders, inbox, ready) = (self.uploads, self.uploaders, shared?.inbox, queueReady)
        Task {
            await ready?.value
            if let inbox { await uploads.importInbox(inbox) }
            for id in await uploads.shareSessionIDs() { uploaders.uploader(for: id) }
            await uploads.reconcile()
            await uploads.process()
        }
    }

    /// iOS woke the app for finished uploads of one of its sessions.
    func handleBackgroundEvents(for identifier: String, completion: @escaping () -> Void) {
        let (uploaders, ready) = (self.uploaders, queueReady)
        Task {
            // The rows must exist before the session reports on them.
            await ready?.value
            let uploader = uploaders.uploader(for: identifier)
            uploader.backgroundEventsCompletion = completion
            uploader.activate()
        }
    }

    /// The trips the Share Extension offers, from what the app last loaded.
    func publishShareTargets() {
        guard let shared else { return }
        var trips: [UUID: [Components.Schemas.Trip]] = [:]
        for account in authorAccounts {
            trips[account.id] = (try? cache.trips(for: account.id))?.value ?? []
        }
        try? ShareTargets(from: trips).save(to: shared.targetsFile)
    }

    var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// Shown to the authors in the web UI's device list ([D15]).
    var deviceName: String { UIDevice.current.name }

    var authorAccounts: [Account] { accounts.filter { $0.kind == .author } }
    var readerAccounts: [Account] { accounts.filter { $0.kind == .viewer } }

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
            email: signedIn.user.email,
            timeZoneIdentifier: server.info.timeZone
        )
        try tokens.setToken(signedIn.token, for: account.id)
        accounts.removeAll { $0.kind == .author && $0.serverURL == server.url }
        accounts.append(account)
        store.save(accounts)
        startWatching(account)
    }

    // MARK: Following a trip ([D17])

    /// The name readers used last time, so a second invitation is quicker.
    var lastReaderName: String {
        get { UserDefaults.standard.string(forKey: "reader.name") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "reader.name") }
    }

    /// Redeems an invitation: the server's share link plus a name. The
    /// device then reads that one trip with a viewer token, no account needed.
    @discardableResult
    func follow(_ invite: Invite, name: String, password: String?) async throws -> Account {
        let server = try await connect(to: invite.serverURL.absoluteString)
        let redeemed = try await ServerClient(baseURL: server.url).redeem(
            shareLink: invite.shareLink.absoluteString,
            password: password?.nilIfEmpty,
            name: name,
            deviceName: deviceName
        )
        let account = Account(
            serverURL: server.url,
            serverName: server.info.name,
            kind: .viewer,
            displayName: redeemed.viewer.name,
            tripID: redeemed.trip.id,
            timeZoneIdentifier: server.info.timeZone
        )
        // Following the same trip again replaces the old device.
        for old in readerAccounts where old.serverURL == server.url && old.tripID == redeemed.trip.id {
            try? await client(for: old).unfollow()
            forget(old)
        }
        try tokens.setToken(redeemed.token, for: account.id)
        try? cache.saveTrips([redeemed.trip], for: account.id)
        accounts.append(account)
        store.save(accounts)
        lastReaderName = redeemed.viewer.name
        startWatching(account)
        return account
    }

    /// Stops following: the server forgets the device (best effort), the
    /// app forgets the trip.
    func unfollow(_ account: Account) async {
        try? await client(for: account).unfollow()
        forget(account)
    }

    // MARK: News ([D16])

    /// Ask for notifications and note where the change feed stands, so the
    /// first background check has something to compare with.
    private func startWatching(_ account: Account) {
        Task {
            await Notifications.requestPermission()
            await checkForNews(notify: false)
        }
    }

    private func cursorKey(_ account: Account) -> String { "changes.cursor.\(account.id.uuidString)" }

    /// Follows each server's change feed. Trips that changed are fetched
    /// again, which keeps the offline copy fresh; comparing with the old copy
    /// tells what's new. Only the background run notifies – in the
    /// foreground, the user sees it anyway.
    func checkForNews(notify: Bool) async {
        for account in accounts {
            let client = client(for: account)
            let key = cursorKey(account)
            do {
                guard let start = UserDefaults.standard.object(forKey: key) as? Int else {
                    let feed = try await client.changes(since: nil)
                    UserDefaults.standard.set(feed.cursor, forKey: key)
                    continue
                }
                var cursor = start
                var tripIDs = Set<Int>()
                var more = true
                while more {
                    let feed = try await client.changes(since: cursor)
                    tripIDs.formUnion(feed.changes.map(\.tripId))
                    cursor = feed.cursor
                    more = feed.hasMore && !feed.changes.isEmpty
                }
                for tripID in tripIDs {
                    await refreshTrip(tripID, of: account, client: client, notify: notify)
                }
                UserDefaults.standard.set(cursor, forKey: key)
            } catch {
                // Offline, signed out or sharing off: the next run tries again.
            }
        }
    }

    private func refreshTrip(_ tripID: Int, of account: Account, client: ServerClient, notify: Bool) async {
        let old = (try? cache.trip(tripID, for: account.id))?.value
        do {
            let fresh = try await client.trip(id: tripID)
            try? cache.saveTrip(fresh, for: account.id)
            guard notify, !Notifications.isMuted(account: account, tripID: tripID) else { return }
            let news = TripNews.items(old: old, new: fresh, reader: account.kind == .viewer, ownName: account.displayName)
            await Notifications.post(news, account: account)
        } catch let error as APIError where error.code == "trip_not_found" {
            try? cache.removeTrip(tripID, for: account.id)
        } catch {
            // Tried again with the next change.
        }
    }

    // MARK: Using an account

    func account(id: UUID) -> Account? {
        accounts.first { $0.id == id }
    }

    func calendar(for account: Account) -> TripCalendar {
        TripCalendar(timeZone: account.timeZone)
    }

    func client(for account: Account) -> ServerClient {
        ServerClient(baseURL: account.serverURL, token: try? tokens.token(for: account.id))
    }

    /// Signs out on the server (best effort – offline it just forgets the
    /// token) and removes the account from the device.
    func signOut(_ account: Account) async {
        if account.kind == .viewer {
            await unfollow(account)
            return
        }
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
        UserDefaults.standard.removeObject(forKey: cursorKey(account))
        try? cache.removeAll(for: account.id)
        Task {
            await media.removeAll(for: account.id)
            await uploads.removeAll(for: account.id)
        }
        accounts.removeAll { $0.id == account.id }
        store.save(accounts)
        publishShareTargets()
    }
}
