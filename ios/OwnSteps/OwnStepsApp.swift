import SwiftUI

@main
struct OwnStepsApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

/// Without an account the app starts at the server address; afterwards at
/// the trips.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.accounts.isEmpty {
            WelcomeView()
        } else {
            TripListView()
        }
    }
}
