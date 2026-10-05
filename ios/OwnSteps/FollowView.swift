import OwnStepsKit
import SwiftUI

/// Follow a trip as a reader ([D17]): the share link (from an invitation or
/// pasted), a name for the comments and – only if the trip has one – the
/// share password. No account on the server.
struct FollowView: View {
    /// From `ownsteps://join`; nil when the user pastes the link.
    var invite: Invite?

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var name = ""
    @State private var password = ""
    @State private var needsPassword = false
    @State private var following = false
    @State private var error: String?

    private var parsed: Invite? { invite ?? Invite(text: link) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let invite {
                        LabeledContent("Server", value: invite.serverURL.host() ?? invite.serverURL.absoluteString)
                    } else {
                        TextField("https://trips.example.com/s/…", text: $link)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                } footer: {
                    if invite == nil {
                        Text("The trip's link, as the travellers sent it to you.")
                    }
                }

                Section {
                    TextField("Your name", text: $name)
                        .textContentType(.name)
                    if needsPassword {
                        SecureField("Password of the trip", text: $password)
                    }
                } footer: {
                    Text("The travellers see this name, also under your comments.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Follow a trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if following {
                        ProgressView()
                    } else {
                        Button(role: .confirm, action: follow)
                            .disabled(parsed == nil || name.trimmingCharacters(in: .whitespaces).count < 2)
                    }
                }
            }
            .onAppear { if name.isEmpty { name = model.lastReaderName } }
        }
    }

    private func follow() {
        guard let parsed else { return }
        following = true
        error = nil
        Task {
            defer { following = false }
            do {
                let account = try await model.follow(
                    parsed,
                    name: name.trimmingCharacters(in: .whitespaces),
                    password: needsPassword ? password : nil
                )
                if let tripID = account.tripID {
                    model.openTrip = TripRoute(accountID: account.id, tripID: tripID)
                }
                dismiss()
            } catch let api as APIError where api.code == "share_password_wrong" && !needsPassword {
                // Only now it's clear the trip has a password.
                needsPassword = true
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }
}
