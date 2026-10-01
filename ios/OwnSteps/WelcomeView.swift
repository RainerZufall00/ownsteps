import OwnStepsKit
import SwiftUI

/// First screen: where is your OwnSteps server?
struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @State private var address = DebugDefaults.value("OwnStepsDebugServer")
    @State private var checking = false
    @State private var error: String?
    @State private var server: PendingServer?
    @State private var following = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(.tint)
                        Text("OwnSteps")
                            .font(.largeTitle.bold())
                        Text("Your travel journal on your own server.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowBackground(Color.clear)
                }

                Section {
                    TextField("trips.example.com", text: $address)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit(connect)
                } header: {
                    Text("Server address")
                } footer: {
                    if let error {
                        Text(error).foregroundStyle(.red)
                    } else if let notice = model.notice {
                        Text(notice)
                    } else {
                        Text("The address you open OwnSteps at in the browser.")
                    }
                }

                Section {
                    Button(action: connect) {
                        HStack {
                            Text("Continue")
                            if checking { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty || checking)
                }

                Section {
                    Button("Follow a trip with a link", systemImage: "person.badge.plus") { following = true }
                } footer: {
                    Text("Got a link from travellers? You can read along without an account.")
                }
            }
            .sheet(isPresented: $following) { FollowView() }
            .navigationDestination(item: $server) { server in
                SignInView(server: server)
            }
        }
    }

    private func connect() {
        guard !checking else { return }
        checking = true
        error = nil
        model.notice = nil
        Task {
            defer { checking = false }
            do {
                server = try await model.connect(to: address)
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }
}
