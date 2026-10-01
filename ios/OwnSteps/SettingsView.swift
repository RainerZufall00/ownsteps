import OwnStepsKit
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage("uploadOriginalVideos") private var originalVideos = false
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

                Section("Accounts") {
                    ForEach(model.accounts) { account in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.displayName)
                            Text(account.serverURL.host() ?? account.serverName)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .swipeActions {
                            Button("Sign out", role: .destructive) { accountToSignOut = account }
                        }
                    }
                }

                Section {
                    LabeledContent("Version", value: model.appVersion)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
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
                Text("This device stops having access to \(account.serverURL.host() ?? account.serverName).")
            }
        }
    }
}
