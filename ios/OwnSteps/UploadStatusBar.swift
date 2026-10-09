import OwnStepsKit
import SwiftUI

/// A small glass capsule at the top while steps and media are on their way:
/// sending, uploading "3 of 5", processing on the server, waiting for a
/// connection, failed – and briefly "Uploaded" at the end. A tap opens the
/// trip it concerns, where the cards offer retry and remove.
struct UploadStatusBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            if let status = model.uploadStatus {
                Button {
                    open(status)
                } label: {
                    HStack(spacing: 8) {
                        StatusIcon(status: status)
                        Text(title(for: status))
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    // Under the glass, so the navigation title behind it
                    // doesn't shine through the text.
                    .background(.thickMaterial, in: .capsule)
                    .glassEffect(.regular.interactive(), in: .capsule)
                }
                .buttonStyle(.plain)
                // It sits on the navigation bar: offered the title's place,
                // never more, so it can't cover the buttons beside it.
                .frame(width: 176)
                .accessibilityHint(Text("Opens the trip"))
                .padding(.top, 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35), value: model.uploadStatus?.phase)
        .animation(.default, value: model.uploadStatus?.done)
    }

    private func title(for status: UploadStatus) -> LocalizedStringKey {
        switch status.phase {
        case .sendingStep:
            "Sending …"
        // Uploads run side by side: count what's finished, the ring shows the rest.
        case .uploading:
            "Uploading \(status.done)/\(status.total)"
        case .processing:
            "Processing …"
        case .waitingForConnection:
            "No connection"
        case .failed:
            "\(status.failed) failed"
        case .finished:
            "Uploaded"
        }
    }

    private func open(_ status: UploadStatus) {
        guard let accountID = status.accountID, let tripID = status.tripID else { return }
        model.openTrip = TripRoute(accountID: accountID, tripID: tripID)
    }
}

private struct StatusIcon: View {
    let status: UploadStatus

    var body: some View {
        switch status.phase {
        case .uploading:
            ProgressRing(fraction: status.fraction)
        case .processing:
            ProgressView().controlSize(.mini)
        case .sendingStep:
            Image(systemName: "arrow.up.circle")
        case .waitingForConnection:
            Image(systemName: "wifi.slash").foregroundStyle(.secondary)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
        case .finished:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        }
    }
}

/// Determinate and small enough for a line of footnote text.
private struct ProgressRing: View {
    let fraction: Double

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: max(0.02, min(fraction, 1)))
                .stroke(.tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: fraction)
        }
        .frame(width: 15, height: 15)
        .accessibilityHidden(true)
    }
}
