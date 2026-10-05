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
        GeometryReader { geometry in
            Form {
                Section {
                    VStack(spacing: 6) {
                        Image(systemName: "server.rack")
                            .font(.system(size: 30, weight: .semibold))
                            .foregroundStyle(.tint)
                            .frame(width: 68, height: 68)
                            .glassEffect(.regular, in: .circle)
                            .padding(.bottom, 6)
                        Text(server.info.name)
                            .font(.title2.bold())
                        Text(server.url.host() ?? server.url.absoluteString)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                } footer: {
                    if let error {
                        Text(error)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                    }
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
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 36)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(busy)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
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
                        } header: {
                            if auth.oidc { Text("Or with password") }
                        }

                        Section {
                            Group {
                                if auth.oidc {
                                    passwordButton.buttonStyle(.glass)
                                } else {
                                    passwordButton.buttonStyle(.glassProminent)
                                }
                            }
                            .disabled(email.isEmpty || password.isEmpty || busy)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                        }
                    }

                    if !auth.oidc && !auth.password {
                        Section {
                            Text("This server offers no way to sign in.")
                        }
                    }
                }
            }
            // A readable column on the iPad instead of a form across the screen.
            .contentMargins(.horizontal, max(0, (geometry.size.width - 600) / 2), for: .scrollContent)
        }
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if busy { ProgressView().controlSize(.large) }
        }
    }

    private var passwordButton: some View {
        Button(action: signInWithPassword) {
            Text("Sign in")
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 36)
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
