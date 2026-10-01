import Foundation

/// The sizes the server stores per photo; for videos the image sizes show
/// the poster frame.
public enum MediaVariant: String, Sendable, CaseIterable {
    /// 480 px wide – grids and map markers.
    case thumb
    /// 1280 px – the timeline; kept for offline reading ([D22]).
    case medium
    /// 2400 px – fullscreen.
    case large
    /// The video file itself.
    case video
}
