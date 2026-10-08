import OwnStepsKit
import SwiftUI

/// Keeping a trip from the app: the offline album through the share sheet,
/// and sending it to Immich. Both run on the server, which has the original
/// files; the app downloads the album or follows the Immich progress.
/// Connecting Immich happens in the web settings, like other account matters
/// ([D21]).
@MainActor @Observable
final class TripExport {
    enum Alert: Identifiable {
        case notConnected
        case done(total: Int, albumURL: URL?)
        case failed(String)

        var id: String {
            switch self {
            case .notConnected: "notConnected"
            case .done: "done"
            case .failed(let message): "failed-\(message)"
            }
        }
    }

    /// The line shown while something runs.
    private(set) var progress: String?
    var alert: Alert?

    func exportAlbum(client: ServerClient, tripID: Int) async {
        guard progress == nil else { return }
        progress = String(localized: "Preparing the album …")
        defer { progress = nil }
        do {
            let file = try await client.downloadAlbum(tripID: tripID)
            ShareSheet.present(file)
        } catch {
            alert = .failed(ErrorText.message(for: error) ?? String(localized: "Something went wrong."))
        }
    }

    func sendToImmich(client: ServerClient, tripID: Int) async {
        guard progress == nil else { return }
        progress = String(localized: "Sending to Immich …")
        defer { progress = nil }
        do {
            var status = try await client.immichStatus(tripID: tripID)
            guard status.connected else {
                alert = .notConnected
                return
            }
            if status.state != .running { status = try await client.startImmichExport(tripID: tripID) }
            while status.state == .running {
                if status.total > 0 {
                    progress = String(localized: "Sending \(status.done) of \(status.total) to Immich …")
                }
                try await Task.sleep(for: .seconds(1))
                status = try await client.immichStatus(tripID: tripID)
            }
            if status.state == .done {
                alert = .done(total: status.total, albumURL: status.albumUrl.flatMap(URL.init(string:)))
            } else {
                alert = .failed(status.error ?? String(localized: "Something went wrong."))
            }
        } catch is CancellationError {
            // Left the trip – the server carries on regardless.
        } catch {
            alert = .failed(ErrorText.message(for: error) ?? String(localized: "Something went wrong."))
        }
    }
}

extension View {
    /// The running export as a glass capsule at the top, and its outcome.
    func tripExportStatus(_ export: TripExport) -> some View {
        modifier(TripExportStatus(export: export))
    }
}

private struct TripExportStatus: ViewModifier {
    @Bindable var export: TripExport
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let progress = export.progress {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(progress)
                            .font(.subheadline.weight(.medium))
                            .contentTransition(.numericText())
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding(.top, 64)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: export.progress)
            .alert(item: $export.alert) { alert in
                switch alert {
                case .notConnected:
                    Alert(
                        title: Text("Immich isn't connected"),
                        message: Text("Connect your Immich server in the OwnSteps settings on the web first.")
                    )
                case .done(let total, let albumURL):
                    if let albumURL {
                        Alert(
                            title: Text("Sent to Immich"),
                            message: Text("\(total) photos and videos are in the album."),
                            primaryButton: .default(Text("Open in Immich")) { openURL(albumURL) },
                            secondaryButton: .cancel(Text("OK"))
                        )
                    } else {
                        Alert(title: Text("Sent to Immich"), message: Text("\(total) photos and videos are in the album."))
                    }
                case .failed(let message):
                    Alert(title: Text("That didn't work"), message: Text(message))
                }
            }
    }
}
