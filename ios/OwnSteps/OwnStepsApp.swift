import OwnStepsKit
import SwiftUI
import UIKit
import UserNotifications

@main
struct OwnStepsApp: App {
    @UIApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(delegate.model)
                // ownsteps://join?url=… from a share page ([D18]).
                .onOpenURL { url in
                    if let invite = Invite(url) { delegate.model.pendingInvite = invite }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                delegate.model.resumeUploads()
                Task { await delegate.model.checkForNews(notify: false) }
            case .background:
                Notifications.scheduleRefresh()
                #if DEBUG
                // `-OwnStepsDebugNewsInBackground YES`: run what the refresh
                // task runs right away – the simulator never schedules it.
                if DebugDefaults.value("OwnStepsDebugNewsInBackground") == "YES" {
                    let model = delegate.model
                    let id = UIApplication.shared.beginBackgroundTask()
                    Task {
                        await model.checkForNews(notify: true)
                        UIApplication.shared.endBackgroundTask(id)
                    }
                }
                #endif
            default:
                break
            }
        }
        .backgroundTask(.appRefresh(Notifications.refreshTaskID)) {
            // The next wake-up is asked for first: this one may be cut short.
            await Notifications.scheduleRefresh()
            await delegate.model.checkForNews(notify: true)
        }
    }
}

/// Owns the model, because iOS hands background upload events to the app
/// delegate – possibly before any window exists.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let model = AppModel()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// A tapped notification opens its trip at the step.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Plain values across the actor boundary; userInfo isn't Sendable.
        let info = response.notification.request.content.userInfo
        let (account, trip, step) = (info["accountID"] as? String, info["tripID"] as? Int, info["stepID"] as? Int)
        await MainActor.run {
            model.openTrip = Notifications.route(accountID: account, tripID: trip, stepID: step)
        }
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        // The app's own session, or one the Share Extension left running.
        guard identifier == BackgroundUploader.sessionIdentifier
            || identifier.hasPrefix(BackgroundUploader.shareSessionPrefix)
        else { return completionHandler() }
        // UIKit's handler isn't marked Sendable; the uploader calls it on
        // the main queue, where UIKit expects it.
        nonisolated(unsafe) let handler = completionHandler
        model.handleBackgroundEvents(for: identifier) { handler() }
    }
}

/// Without an account the app starts at the server address; afterwards at
/// the trips. An invitation can arrive at any time.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        Group {
            if model.accounts.isEmpty {
                WelcomeView()
            } else {
                TripListView()
            }
        }
        .sheet(item: $model.pendingInvite) { invite in
            FollowView(invite: invite)
        }
    }
}
