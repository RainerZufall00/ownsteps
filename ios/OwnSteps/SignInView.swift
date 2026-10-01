import AuthenticationServices
import OwnStepsKit
import SwiftUI

/// Sign-in on a server that answered: OIDC first, password below ([D14]).
struct SignInView: View {
    let server: PendingServer

    @Environment(AppModel.self) private var model
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @State private var email = DebugDefaults.value("OwnStepsDebugEmail")
    @State private var password = DebugDefaults.value("OwnStepsDebugPassword")
    @State private var busy = false
    @State private var error: String?

    private var auth: Components.Schemas.Info.AuthPayload { server.info.auth }

    var body: some View {
        Form {
            Section {
                LabeledContent("Server", value: server.url.host() ?? server.url.absoluteString)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
            }

            if !server.info.setupComplete {
                Section {
                    Text("This server isn't set up yet. Create the first account in the browser, then come back.")
                    Link("Open in the browser", destination: server.url)
                }
            } else {
                if auth.oidc {
                    Section {
                        Button {
                            run { try await model.signInWithOIDC(on: server, using: webAuthenticationSession) }
                        } label: {
                            Label(
                                "Sign in with \(auth.oidcLabel ?? "OIDC")",
                                systemImage: "person.badge.key"
                            )
                        }
                        .disabled(busy)
                    }
                }

                if auth.password {
                    Section {
                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .onSubmit(signInWithPassword)
                        Button("Sign in", action: signInWithPassword)
                            .disabled(email.isEmpty || password.isEmpty || busy)
                    } header: {
                        // Two literals, so both end up in the string catalog.
                        auth.oidc ? Text("Or with password") : Text("Sign in")
                    }
                }

                if !auth.oidc && !auth.password {
                    Section {
                        Text("This server offers no way to sign in.")
                    }
                }
            }
        }
        .navigationTitle(server.info.name)
        .overlay {
            if busy { ProgressView().controlSize(.large) }
        }
    }

    private func signInWithPassword() {
        run { try await model.signIn(on: server, email: email, password: password) }
    }

    private func run(_ action: @escaping () async throws -> Void) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await action()
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }
}
