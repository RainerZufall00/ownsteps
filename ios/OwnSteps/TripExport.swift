import OwnStepsKit
import SwiftUI

/// A trip's own settings, for what's needed rarely – at the end of a trip,
/// mostly: keeping it as an offline album or sending it to Immich. Both run
/// on the server, which has the original files; the app downloads the album
/// or follows the Immich progress.
struct TripSettingsView: View {
    let account: Account
    let tripID: Int

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var preparingAlbum = false
    @State private var albumError: String?
    @State private var connection: Components.Schemas.ImmichConnection?
    @State private var status: Components.Schemas.ImmichStatus?
    @State private var immichError: String?

    private var client: ServerClient { model.client(for: account) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        Task { await exportAlbum() }
                    } label: {
                        HStack {
                            Label("Export album", systemImage: "square.and.arrow.down.on.square")
                            if preparingAlbum {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(preparingAlbum)
                } header: {
                    Text("Offline album")
                } footer: {
                    if let albumError {
                        Text(albumError).foregroundStyle(.red)
                    } else {
                        Text("A ZIP with one page and all photos and videos, the text, the captions and a map of the route. It opens in any browser, also offline.")
                    }
                }

                Section {
                    immichRows
                } header: {
                    Text("Immich")
                } footer: {
                    if let message = immichError ?? status?.error {
                        Text(message).foregroundStyle(.red)
                    } else {
                        Text("Creates an album in Immich. Each photo keeps its caption; the day and place go with every photo, the day's text with its first one.")
                    }
                }
            }
            .navigationTitle("Trip settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .close) { dismiss() }
                }
            }
            .task { await load() }
            // Follows a running export – also one started in the web.
            .task(id: status?.state) {
                guard status?.state == .running else { return }
                while !Task.isCancelled, status?.state == .running {
                    try? await Task.sleep(for: .seconds(1))
                    if let fresh = try? await client.immichStatus(tripID: tripID) { status = fresh }
                }
            }
        }
    }

    @ViewBuilder private var immichRows: some View {
        if let current = connection, let progress = status {
            if !current.connected {
                NavigationLink {
                    ImmichSettingsView(account: account) { self.connection = $0 }
                } label: {
                    Label("Connect Immich", systemImage: "link")
                }
            } else if progress.state == .running {
                VStack(alignment: .leading, spacing: 8) {
                    ProgressView(value: Double(progress.done), total: Double(max(progress.total, 1)))
                    Text(progress.total > 0 ? "Sending \(progress.done) of \(progress.total) …" : "Starting …")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .contentTransition(.numericText())
                }
                .padding(.vertical, 4)
            } else {
                Button {
                    Task { await sendToImmich() }
                } label: {
                    Label(
                        progress.state == .done ? "Send again" : "Send to Immich",
                        systemImage: "photo.on.rectangle.angled"
                    )
                }
                if progress.state == .done {
                    if let url = progress.albumUrl.flatMap(URL.init(string:)) {
                        Link(destination: url) {
                            Label("Open album in Immich", systemImage: "arrow.up.forward.app")
                        }
                    }
                    Text("\(progress.total) photos and videos are in Immich.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let name = current.name, let url = current.url {
                    LabeledContent("Connected as", value: "\(name) · \(URL(string: url)?.host() ?? url)")
                        .font(.footnote)
                }
            }
        } else if immichError == nil {
            ProgressView()
        }
    }

    private func load() async {
        do {
            async let connection = client.immichConnection()
            async let status = client.immichStatus(tripID: tripID)
            (self.connection, self.status) = try await (connection, status)
            immichError = nil
        } catch {
            immichError = ErrorText.message(for: error)
        }
    }

    private func exportAlbum() async {
        preparingAlbum = true
        albumError = nil
        defer { preparingAlbum = false }
        do {
            ShareSheet.present(try await client.downloadAlbum(tripID: tripID))
        } catch {
            albumError = ErrorText.message(for: error)
        }
    }

    private func sendToImmich() async {
        immichError = nil
        do {
            status = try await client.startImmichExport(tripID: tripID)
        } catch {
            immichError = ErrorText.message(for: error)
        }
    }
}

/// Connecting Immich for one account: address and API key, checked by the
/// server against Immich before they're stored.
struct ImmichSettingsView: View {
    let account: Account
    /// Told when the connection changed, e.g. to the trip settings.
    var changed: (Components.Schemas.ImmichConnection) -> Void = { _ in }

    @Environment(AppModel.self) private var model
    @State private var connection: Components.Schemas.ImmichConnection?
    @State private var url = ""
    @State private var apiKey = ""
    @State private var busy = false
    @State private var error: String?

    private var client: ServerClient { model.client(for: account) }

    var body: some View {
        Form {
            if let connection, connection.connected {
                Section {
                    LabeledContent("Address", value: connection.url ?? "")
                    if let name = connection.name {
                        LabeledContent("Account", value: name)
                    }
                } footer: {
                    if let problem = connection.problem {
                        Text(problem).foregroundStyle(.red)
                    } else {
                        Text("The key is stored encrypted on your OwnSteps server.")
                    }
                }
                Section {
                    Button("Disconnect", role: .destructive) { Task { await disconnect() } }
                        .disabled(busy)
                }
            } else if connection != nil {
                Section {
                    TextField("https://photos.example.com", text: $url)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("API key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Immich address and API key")
                } footer: {
                    if let error {
                        Text(error).foregroundStyle(.red)
                    } else {
                        Text("Create the key in Immich under Account settings → API keys. It needs to upload assets, change them and manage albums – \"All\" is simplest.")
                    }
                }
                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            Text("Connect")
                            if busy {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(busy || url.trimmingCharacters(in: .whitespaces).isEmpty || apiKey.isEmpty)
                }
            } else if let error {
                Text(error).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Immich")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                connection = try await client.immichConnection()
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }

    private func connect() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let fresh = try await client.connectImmich(url: url, apiKey: apiKey)
            connection = fresh
            apiKey = ""
            changed(fresh)
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    private func disconnect() async {
        busy = true
        defer { busy = false }
        do {
            try await client.disconnectImmich()
            let fresh = Components.Schemas.ImmichConnection(connected: false, url: nil, name: nil, problem: nil)
            connection = fresh
            changed(fresh)
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }
}
