import OwnStepsKit
import Photos
import SwiftUI
import UIKit

/// What touching and holding a photo offers: save it, copy it, send it on.
/// Always the largest size the server has – the original stays on the
/// server. Readers get this too: the trip was shared with them.
struct PhotoMenu: View {
    let account: Account
    let photo: Components.Schemas.Photo

    @Environment(AppModel.self) private var model

    var body: some View {
        Button("Save to Photos", systemImage: "square.and.arrow.down") {
            run { try await PhotoActions.save($0) }
        }
        Button("Copy", systemImage: "doc.on.doc") {
            run { UIPasteboard.general.image = $0 }
        }
        Button("Share …", systemImage: "square.and.arrow.up") {
            run { ShareSheet.present($0) }
        }
    }

    private func run(_ action: @escaping @MainActor (UIImage) async throws -> Void) {
        Task {
            do {
                try await action(try await image())
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } catch {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                PhotoActions.show(error)
            }
        }
    }

    private func image() async throws -> UIImage {
        let client = model.client(for: account)
        let data = try await model.media.data(
            accountID: account.id,
            photoID: photo.id,
            fileKey: photo.fileKey,
            variant: .large,
            request: client.mediaRequest(photoID: photo.id, variant: .large)
        )
        guard let image = await Task.detached(operation: { UIImage(data: data) }).value else {
            throw PhotoActions.Problem.unreadable
        }
        return image
    }
}

enum PhotoActions {
    enum Problem: LocalizedError {
        case noAccess
        case unreadable

        var errorDescription: String? {
            switch self {
            case .noAccess: String(localized: "To save photos, OwnSteps needs permission to add to your library.")
            case .unreadable: String(localized: "This photo can't be read.")
            }
        }
    }

    /// Asks only for adding: saving doesn't need to read the library.
    @MainActor
    static func save(_ image: UIImage) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { throw Problem.noAccess }
        guard let jpeg = image.jpegData(compressionQuality: 0.95) else { throw Problem.unreadable }
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetCreationRequest.forAsset().addResource(with: .photo, data: jpeg, options: nil)
        }
    }

    /// The menu is gone by the time this fails, so nothing in SwiftUI is
    /// left to attach an alert to.
    @MainActor
    static func show(_ error: any Error) {
        let alert = UIAlertController(
            title: String(localized: "Something went wrong"),
            message: ErrorText.message(for: error) ?? error.localizedDescription,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: String(localized: "OK"), style: .cancel))
        UIApplication.shared.topViewController?.present(alert, animated: true)
    }
}

/// The cancel button of a form: leaves right away while there's nothing to
/// lose, and asks otherwise. Dragging such a sheet away is blocked with
/// `interactiveDismissDisabled`, so this is the one way out.
struct DiscardButton: View {
    let hasChanges: Bool
    let discard: () -> Void

    @State private var confirming = false

    var body: some View {
        Button(role: .cancel) {
            if hasChanges { confirming = true } else { discard() }
        }
        .confirmationDialog("Discard this draft?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Discard draft", role: .destructive, action: discard)
            Button("Keep editing", role: .cancel) {}
        } message: {
            Text("What you changed here will be lost.")
        }
    }
}
