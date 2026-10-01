import Foundation

/// Prefills form fields in debug builds from launch arguments, e.g.
/// `xcrun simctl launch booted de.ownsteps.app -OwnStepsDebugServer http://localhost:2555`.
/// The simulator's hardware keyboard follows the Mac's layout, which makes
/// typing URLs and passwords through automation unreliable. Release builds
/// ignore the arguments.
enum DebugDefaults {
    static func value(_ key: String) -> String {
        #if DEBUG
        UserDefaults.standard.string(forKey: key) ?? ""
        #else
        ""
        #endif
    }
}
