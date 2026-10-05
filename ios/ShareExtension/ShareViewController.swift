import OwnStepsKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Entry point of the Share Extension ([D21]): photos and videos shared
/// from Photos or another app become a new step. Hosts the SwiftUI form.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let model = ShareModel(providers: providers)
        let root = ShareView(model: model) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }

        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}

/// A trip on one of the signed-in servers.
struct TripChoice: Hashable {
    let accountID: UUID
    let tripID: Int

    /// How the choice is remembered for next time.
    var key: String { "\(accountID.uuidString)/\(tripID)" }
}

/// What the extension knows and does. It reads the accounts, tokens and the
/// trip list the app shared, and never opens the app's database.
@MainActor @Observable
final class ShareModel {
    struct Item: Identifiable {
        let id = UUID()
        var prepared: MediaPreparation.Prepared?
    }

    enum Phase: Equatable {
        case preparing
        case ready
        case sending
        /// The step exists; the background session uploads the files.
        case sent
        /// Offline: the app sends it later.
        case savedForLater
    }

    let container = SharedContainer.current
    let accounts: [Account]
    let targets: ShareTargets
    var items: [Item]
    var choice: TripChoice?
    var body = ""
    var date = Date()
    var dateTouched = false
    var phase = Phase.preparing
    var error: String?

    private let providers: [NSItemProvider]
    /// Kept while the extension lives, to hear about uploads that finish quickly.
    private var uploader: BackgroundUploader?
    private let tokens = KeychainTokenStore(accessGroup: SharedContainer.keychainAccessGroup)
    private static let lastTripKey = "share.lastTrip"

    init(providers: [NSItemProvider]) {
        self.providers = providers
        self.items = providers.map { _ in Item() }
        self.accounts = AccountStore(suiteName: container?.groupIdentifier).load().filter { $0.kind == .author }
        self.targets = container.map { ShareTargets.load(from: $0.targetsFile) } ?? ShareTargets()

        // The trip used last time, else the most recent one.
        let last = container?.defaults?.string(forKey: Self.lastTripKey)
        let all = accounts.flatMap { account in targets.trips(for: account.id).map { TripChoice(accountID: account.id, tripID: $0.id) } }
        choice = all.first { $0.key == last } ?? all.first
    }

    var account: Account? {
        choice.flatMap { choice in accounts.first { $0.id == choice.accountID } } ?? accounts.first
    }

    var timeZone: TimeZone { account?.timeZone ?? .current }

    var canSend: Bool {
        phase == .ready && choice != nil && items.allSatisfy { $0.prepared != nil } && !items.isEmpty
    }

    /// One file after the other: an extension gets far less memory than an app.
    func prepare() async {
        guard phase == .preparing else { return }
        let original = container?.defaults?.bool(forKey: SharedContainer.originalVideosKey) ?? false
        for (index, provider) in providers.enumerated() {
            do {
                items[index].prepared = try await Self.prepare(provider, timeZone: timeZone, originalVideos: original)
            } catch let problem as MediaPreparation.Problem {
                error = problem.localizedDescription
            } catch {
                self.error = MediaPreparation.Problem.unreadableImage.localizedDescription
            }
        }
        items.removeAll { $0.prepared == nil }
        if !dateTouched, let earliest = items.compactMap(\.prepared?.captureDate).min() {
            date = earliest
        }
        phase = .ready
    }

    func send() async {
        guard let container, let choice, let account = accounts.first(where: { $0.id == choice.accountID }) else { return }
        phase = .sending
        error = nil
        let sessionID = BackgroundUploader.shareSessionPrefix + UUID().uuidString
        let (files, inbox) = (QueueFiles(directory: container.uploadsDirectory), container.inbox)
        let uploader = BackgroundUploader(identifier: sessionID, sharedContainerIdentifier: container.groupIdentifier)
        uploader.onCompletion = { id, status, _, _ in
            inbox.recordCompletion(uploadID: id, statusCode: status, files: files)
        }
        self.uploader = uploader
        let submitter = ShareSubmitter(
            files: files,
            inbox: inbox,
            client: account.client(tokens: tokens),
            transport: uploader,
            sessionID: sessionID
        )
        do {
            let outcome = try await submitter.submit(
                accountID: account.id,
                tripID: choice.tripID,
                body: body,
                occurredAt: date,
                media: items.compactMap(\.prepared?.media)
            )
            container.defaults?.set(choice.key, forKey: Self.lastTripKey)
            phase = outcome == .sending ? .sent : .savedForLater
        } catch {
            self.error = String(localized: "The step couldn't be saved.")
            phase = .ready
        }
    }

    func discard() {
        items.forEach { $0.prepared?.discard() }
    }

    private static func prepare(
        _ provider: NSItemProvider,
        timeZone: TimeZone,
        originalVideos: Bool
    ) async throws -> MediaPreparation.Prepared {
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
            let file = try await copyFile(from: provider, type: .movie)
            return try await MediaPreparation.prepareVideo(at: file, original: originalVideos)
        }
        let data: Data = try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadDataRepresentation(for: .image) { data, error in
                if let data { continuation.resume(returning: data) } else { continuation.resume(throwing: error ?? CancellationError()) }
            }
        }
        // Released before the next file – the JPEG is on disk now.
        return try autoreleasepool {
            try MediaPreparation.preparePhoto(data: data, timeZone: timeZone)
        }
    }

    /// The provider's file only lives during the callback, so it's copied.
    private static func copyFile(from provider: NSItemProvider, type: UTType) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadFileRepresentation(for: type, openInPlace: false) { url, _, error in
                guard let url else { return continuation.resume(throwing: error ?? CancellationError()) }
                continuation.resume(with: Result { try MediaPreparation.temporaryCopy(ofVideoAt: url) })
            }
        }
    }
}

struct ShareView: View {
    @Bindable var model: ShareModel
    let close: () -> Void

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("New step")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if model.phase != .savedForLater {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel", role: .cancel) {
                                model.discard()
                                close()
                            }
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if model.phase == .savedForLater {
                            Button("Done", action: close)
                        } else if model.phase == .sending || model.phase == .sent {
                            ProgressView()
                        } else if model.choice != nil {
                            Button("Save") { Task { await model.send() } }.disabled(!model.canSend)
                        }
                    }
                }
        }
        // The app's accent; the global setting doesn't reach extensions.
        .tint(Color("AccentColor"))
        .task { await model.prepare() }
        .onChange(of: model.phase) { _, phase in
            // On its way: the background session takes it from here.
            if phase == .sent { close() }
        }
    }

    @ViewBuilder private var content: some View {
        if model.container == nil {
            ContentUnavailableView(
                "Not available",
                systemImage: "exclamationmark.triangle",
                description: Text("This copy of OwnSteps can't share data with its extension. Add the photos in the app instead.")
            )
        } else if model.accounts.isEmpty {
            ContentUnavailableView(
                "Not signed in",
                systemImage: "person.crop.circle.badge.exclamationmark",
                description: Text("Open OwnSteps and sign in to your server first.")
            )
        } else if model.choice == nil {
            ContentUnavailableView(
                "No trips yet",
                systemImage: "suitcase",
                description: Text("Open OwnSteps once, so your trips show up here. New trips are created in the app.")
            )
        } else if model.phase == .savedForLater {
            ContentUnavailableView(
                "Saved on this device",
                systemImage: "clock.arrow.circlepath",
                description: Text("There's no connection to the server right now. OwnSteps sends the step the next time you open it.")
            )
        } else {
            form
        }
    }

    private var form: some View {
        Form {
            Section {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(model.items) { item in
                            Thumbnail(prepared: item.prepared)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                if model.phase == .preparing {
                    Label("Preparing photos …", systemImage: "hourglass").foregroundStyle(.secondary)
                }
            }

            Section {
                Picker("Trip", selection: $model.choice) {
                    ForEach(model.accounts) { account in
                        let trips = model.targets.trips(for: account.id)
                        if model.accounts.count > 1 {
                            Section(account.serverURL.host() ?? account.serverName) {
                                tripOptions(trips, account: account)
                            }
                        } else {
                            tripOptions(trips, account: account)
                        }
                    }
                }
                .pickerStyle(.navigationLink)
            }

            Section("What happened?") {
                TextField("Tell about this day …", text: $model.body, axis: .vertical)
                    .lineLimit(3...10)
            }

            Section {
                DatePicker(
                    "Date",
                    selection: Binding(get: { model.date }, set: { model.date = $0; model.dateTouched = true }),
                    displayedComponents: .date
                )
                .environment(\.timeZone, model.timeZone)
            } footer: {
                Text("The place comes from the photos when they carry it.")
            }

            if let error = model.error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .disabled(model.phase == .sending)
    }

    private func tripOptions(_ trips: [ShareTargets.Trip], account: Account) -> some View {
        ForEach(trips) { trip in
            Text(trip.title).tag(Optional(TripChoice(accountID: account.id, tripID: trip.id)))
        }
    }
}

private struct Thumbnail: View {
    let prepared: MediaPreparation.Prepared?

    var body: some View {
        ZStack {
            if let url = prepared?.media.thumbnail, let image = UIImage(contentsOfFile: url.path(percentEncoded: false)) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
                ProgressView()
            }
            if prepared?.media.mime.hasPrefix("video/") == true {
                Image(systemName: "play.circle.fill").foregroundStyle(.white, .black.opacity(0.4))
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(.rect(cornerRadius: 8))
    }
}
