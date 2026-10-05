import MapKit
import OwnStepsKit
import SwiftUI

/// First screen: where is your OwnSteps server? The globe behind it,
/// the controls in glass at the bottom.
struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @State private var address = DebugDefaults.value("OwnStepsDebugServer")
    @State private var checking = false
    @State private var error: String?
    @State private var server: PendingServer?
    @State private var following = false
    @FocusState private var addressFocused: Bool

    private var canConnect: Bool {
        !address.trimmingCharacters(in: .whitespaces).isEmpty && !checking
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                VStack(spacing: 10) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.tint)
                        .frame(width: 76, height: 76)
                        .glassEffect(.regular, in: .circle)
                    Text("OwnSteps")
                        .font(.largeTitle.bold())
                    Text("Your travel journal on your own server.")
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .shadow(color: .black.opacity(0.6), radius: 12)
                .padding(.horizontal, 32)
                Spacer()
                Spacer()

                GlassEffectContainer(spacing: 12) {
                    VStack(spacing: 12) {
                        TextField(
                            "Server address",
                            text: $address,
                            prompt: Text(verbatim: "trips.example.com").foregroundStyle(.white.opacity(0.5))
                        )
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit(connect)
                        .focused($addressFocused)
                        .padding(.horizontal, 20)
                        .frame(height: 54)
                        .glassEffect(.regular.interactive(), in: .capsule)

                        Button(action: connect) {
                            Group {
                                if checking {
                                    ProgressView()
                                } else {
                                    Text("Continue")
                                }
                            }
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(!canConnect)
                    }
                }

                Group {
                    if let error {
                        Text(error).foregroundStyle(.red)
                    } else if let notice = model.notice {
                        Text(notice)
                    } else {
                        Text("The address you open OwnSteps at in the browser.")
                    }
                }
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center)
                .padding(.top, 12)
                .padding(.horizontal)

                Button {
                    following = true
                } label: {
                    Label("Follow a trip with a link", systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 6)
                }
                .buttonStyle(.glass)
                .padding(.top, 28)

                Text("Got a link from travellers? You can read along without an account.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
                    .padding(.horizontal)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
            .foregroundStyle(.white)
            .background { WelcomeBackground() }
            .environment(\.colorScheme, .dark)
            .onTapGesture { addressFocused = false }
            .sheet(isPresented: $following) { FollowView() }
            .navigationDestination(item: $server) { server in
                SignInView(server: server)
            }
        }
    }

    private func connect() {
        guard canConnect else { return }
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

/// The globe from far away, darkened towards the bottom so the controls
/// read well on it.
private struct WelcomeBackground: View {
    var body: some View {
        Map(
            initialPosition: .camera(MapCamera(
                centerCoordinate: CLLocationCoordinate2D(latitude: 38, longitude: -5),
                distance: 24_000_000
            )),
            interactionModes: []
        )
        .mapStyle(.imagery(elevation: .realistic))
        .overlay {
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.25), location: 0),
                    .init(color: .black.opacity(0.05), location: 0.35),
                    .init(color: .black.opacity(0.75), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .background(Color.black)
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}
