import BackgroundTasks
import OwnStepsKit
import UserNotifications

/// Local notifications from background refresh – there's no push relay
/// ([D16]). Readers hear about new steps, authors about new comments; both
/// can be switched off per trip.
enum Notifications {
    /// The background refresh task; listed in the Info.plist.
    static var refreshTaskID: String { (Bundle.main.bundleIdentifier ?? "de.ownsteps.app") + ".refresh" }

    static func requestPermission() async {
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
    }

    /// Asks iOS to wake the app now and then. When exactly is up to iOS –
    /// it learns when the app is usually used.
    static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 20 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    static func post(_ items: [TripNews.Item], account: Account) async {
        let center = UNUserNotificationCenter.current()
        for item in items {
            let content = UNMutableNotificationContent()
            content.title = item.kind == .step
                ? String(localized: "New step: \(item.title)")
                : item.title
            content.body = item.body.isEmpty ? String(localized: "Tap to read") : item.body
            content.sound = .default
            content.threadIdentifier = "\(account.id.uuidString)-\(item.tripID)"
            content.userInfo = [
                "accountID": account.id.uuidString,
                "tripID": item.tripID,
                "stepID": item.stepID,
            ]
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            try? await center.add(request)
        }
    }

    /// Where a tapped notification leads.
    static func route(accountID: String?, tripID: Int?, stepID: Int?) -> TripRoute? {
        guard let account = accountID.flatMap(UUID.init(uuidString:)), let tripID else { return nil }
        return TripRoute(accountID: account, tripID: tripID, stepID: stepID)
    }

    // MARK: Per trip

    private static let mutedKey = "notifications.muted"

    private static func key(_ account: Account, _ tripID: Int) -> String {
        "\(account.id.uuidString)/\(tripID)"
    }

    static func isMuted(account: Account, tripID: Int) -> Bool {
        (UserDefaults.standard.stringArray(forKey: mutedKey) ?? []).contains(key(account, tripID))
    }

    static func setMuted(_ muted: Bool, account: Account, tripID: Int) {
        var list = Set(UserDefaults.standard.stringArray(forKey: mutedKey) ?? [])
        if muted { list.insert(key(account, tripID)) } else { list.remove(key(account, tripID)) }
        UserDefaults.standard.set(Array(list), forKey: mutedKey)
    }
}
