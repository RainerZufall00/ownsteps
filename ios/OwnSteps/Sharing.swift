import OwnStepsKit
import SwiftUI
import UIKit

/// What the share sheet hands out ([D22]): the trip's share link, or that
/// link pointing at one step – the web jumps there via `#step-<id>`. It's
/// the same link readers get, password included if the trip has one.
enum ShareTarget: Identifiable, Hashable {
    case trip
    case step(Int)

    var id: String {
        switch self {
        case .trip: "trip"
        case .step(let id): "step-\(id)"
        }
    }

    func url(in share: Components.Schemas.Share?) -> URL? {
        guard let share, share.enabled, var components = URLComponents(string: share.url) else { return nil }
        if case .step(let id) = self { components.fragment = "step-\(id)" }
        return components.url
    }
}

/// The system share sheet, presented by UIKit: wrapped in a SwiftUI sheet
/// it sits at the wrong height. `ShareLink` would need the link up front,
/// but it may only exist once sharing is switched on.
enum ShareSheet {
    @MainActor
    static func present(_ url: URL) {
        guard let top = UIApplication.shared.topViewController else { return }
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // iPad: anchored at the top right, where the menu was.
        controller.popoverPresentationController?.sourceView = top.view
        controller.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.maxX - 60, y: 60, width: 1, height: 1)
        top.present(controller, animated: true)
    }
}

extension UIApplication {
    /// The controller on top in the active scene, to present UIKit's own
    /// screens from.
    var topViewController: UIViewController? {
        let scene = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard var top = scene?.keyWindow?.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        return top
    }
}

extension UserDefaults {
    /// The app group's defaults, which the Share Extension reads too.
    static let shared = SharedContainer.current?.defaults ?? .standard
}
