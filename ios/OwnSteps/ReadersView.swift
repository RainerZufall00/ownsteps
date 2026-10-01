import CoreImage.CIFilterBuiltins
import OwnStepsKit
import SwiftUI

/// Writing a comment. Authors comment under their account name, readers
/// under the name they chose when following – nobody types it again.
struct CommentComposer: View {
    let account: Account
    let step: Components.Schemas.Step
    let onSent: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Your comment", text: $text, axis: .vertical)
                        .lineLimit(3...10)
                        .focused($focused)
                        .onAppear { focused = true }
                } footer: {
                    Text("Shown as \(account.displayName).")
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Comment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Send", action: send)
                            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() {
        sending = true
        error = nil
        Task {
            defer { sending = false }
            do {
                _ = try await model.client(for: account).comment(
                    stepID: step.id,
                    body: text.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                onSent()
                dismiss()
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }
}

/// Who follows the trip in the app, and the invitation for more ([D17],
/// [D21]): the share link as QR code and through the share sheet. Removing
/// a reader ends that device's access; the link itself stays valid.
struct ReadersView: View {
    let account: Account
    let trip: Components.Schemas.Trip
    /// The trip's sharing after switching it on here.
    let onShareChange: (Components.Schemas.Share?) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var share: Components.Schemas.Share?
    @State private var readers: [Components.Schemas.Viewer]?
    @State private var error: String?
    @State private var confirmingRemoveAll = false

    private var calendar: TripCalendar { model.calendar(for: account) }

    var body: some View {
        NavigationStack {
            List {
                invitation

                Section {
                    if let readers {
                        if readers.isEmpty {
                            Text("Nobody follows this trip in the app yet.").foregroundStyle(.secondary)
                        }
                        ForEach(readers, id: \.id) { reader in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reader.name)
                                Text(details(of: reader))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            .swipeActions {
                                Button("Remove", role: .destructive) { Task { await remove(reader) } }
                            }
                        }
                    } else if error == nil {
                        ProgressView()
                    }
                } header: {
                    Text("Readers in the app")
                } footer: {
                    Text("Removing a reader ends access on that device. Readers in the browser only need the link.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Readers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .bottomBar) {
                    if let readers, !readers.isEmpty {
                        Button("Remove all", role: .destructive) { confirmingRemoveAll = true }
                    }
                }
            }
            .confirmationDialog("Remove all readers?", isPresented: $confirmingRemoveAll, titleVisibility: .visible) {
                Button("Remove all", role: .destructive) { Task { await removeAll() } }
            } message: {
                Text("They can follow again with the link, unless you create a new one in the web.")
            }
            .task {
                share = trip.share
                await load()
            }
            .refreshable { await load() }
        }
    }

    @ViewBuilder private var invitation: some View {
        Section {
            if let share, share.enabled, let url = URL(string: share.url) {
                HStack(alignment: .top, spacing: 16) {
                    QRCode(text: url.absoluteString)
                        .frame(width: 120, height: 120)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Scanned or opened, the link shows the trip – in the app, if it's installed.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        ShareLink(
                            item: url,
                            subject: Text(trip.title),
                            message: Text("Follow our trip “\(trip.title)”.")
                        ) {
                            Label("Send invitation", systemImage: "square.and.arrow.up")
                        }
                    }
                }
                .padding(.vertical, 4)
                if share.hasPassword {
                    Text("The trip has a password. Readers enter it once when following.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Sharing is off. Readers need the link, so switch it on to invite someone.")
                    .foregroundStyle(.secondary)
                Button("Turn on sharing") { Task { await enableSharing() } }
            }
        } header: {
            Text("Invite")
        }
    }

    private func details(of reader: Components.Schemas.Viewer) -> String {
        var parts: [String] = []
        if let device = reader.deviceName { parts.append(device) }
        if let seen = reader.lastSeenAt {
            parts.append(String(localized: "seen \(seen.formatted(.relative(presentation: .named)))"))
        } else {
            parts.append(String(localized: "since \(reader.createdAt.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone)))"))
        }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        do {
            readers = try await model.client(for: account).viewers(tripID: trip.id)
            error = nil
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    private func remove(_ reader: Components.Schemas.Viewer) async {
        do {
            try await model.client(for: account).removeViewer(id: reader.id)
            readers?.removeAll { $0.id == reader.id }
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    private func removeAll() async {
        do {
            try await model.client(for: account).removeAllViewers(tripID: trip.id)
            readers = []
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    private func enableSharing() async {
        do {
            let updated = try await model.client(for: account).updateTrip(id: trip.id, .init(shareEnabled: true))
            share = updated.share
            onShareChange(updated.share)
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }
}

/// A QR code, drawn sharp at any size.
struct QRCode: View {
    let text: String

    var body: some View {
        if let image = Self.image(for: text) {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .accessibilityLabel(Text("QR code of the link"))
        }
    }

    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage,
              let cgImage = CIContext().createCGImage(output, from: output.extent)
        else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
