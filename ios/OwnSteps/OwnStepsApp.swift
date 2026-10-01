import OwnStepsKit
import SwiftUI
import UIKit

@main
struct OwnStepsApp: App {
    @UIApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(delegate.model)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { delegate.model.resumeUploads() }
        }
    }
}

/// Owns the model, because iOS hands background upload events to the app
/// delegate – possibly before any window exists.
final class AppDelegate: NSObject, UIApplicationDelegate {
    let model = AppModel()

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        // The app's own session, or one the Share Extension left running.
        guard identifier == BackgroundUploader.sessionIdentifier
            || identifier.hasPrefix(BackgroundUploader.shareSessionPrefix)
        else { return completionHandler() }
        model.handleBackgroundEvents(for: identifier, completion: completionHandler)
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
