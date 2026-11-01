import OwnStepsKit
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage(SharedContainer.originalVideosKey, store: .shared)
    private var originalVideos = false
    @State private var accountToSignOut: Account?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Videos in original quality", isOn: $originalVideos)
                } header: {
                    Text("Uploads")
                } footer: {
                    Text("Off, videos are reduced to 1080p before uploading – usually a third of the size, so uploads on the road finish. Photos always keep their full resolution.")
                }

                ForEach(model.accounts) { account in
                    Section(account.host) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.displayName)
                            if let email = account.email {
                                Text(email)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if account.kind == .author {
                            NavigationLink {
                                DisplayNameView(account: account)
                            } label: {
                                Label("Display name", systemImage: "person.text.rectangle")
                            }
                            NavigationLink {
                                ImmichSettingsView(account: account)
                            } label: {
                                Label("Immich", systemImage: "photo.on.rectangle.angled")
                            }
                        }
                        Button("Sign out", role: .destructive) { accountToSignOut = account }
                    }
                }

                Section {
                    LabeledContent("Version", value: model.appVersion)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
            .confirmationDialog(
                "Sign out of this server?",
                isPresented: Binding(get: { accountToSignOut != nil }, set: { if !$0 { accountToSignOut = nil } }),
                presenting: accountToSignOut
            ) { account in
                Button("Sign out", role: .destructive) {
                    Task { await model.signOut(account) }
                }
            } message: { account in
                Text("This device stops having access to \(account.host).")
            }
        }
    }
}

/// The name shown with the author's comments. With single sign-on it starts
/// as whatever the provider sends, usually the full name.
private struct DisplayNameView: View {
    let account: Account

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var saving = false
    @State private var error: String?
    @FocusState private var writing: Bool

    init(account: Account) {
        self.account = account
        _name = State(initialValue: account.displayName)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }
    /// The server's limits for a name.
    private var canSave: Bool { (2...60).contains(trimmed.count) && trimmed != account.displayName && !saving }

    var body: some View {
        Form {
            Section {
                TextField("Display name", text: $name)
                    .textContentType(.nickname)
                    .focused($writing)
                    .submitLabel(.done)
                    .onSubmit { if canSave { save() } }
            } footer: {
                Text("Shown with your comments, also on the ones you already wrote.")
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Display name")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(role: .confirm, action: save).disabled(!canSave)
            }
        }
        .onAppear { writing = true }
    }

    private func save() {
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await model.rename(account, to: trimmed)
                dismiss()
            } catch {
                self.error = ErrorText.message(for: error) ?? error.localizedDescription
            }
        }
    }
}
