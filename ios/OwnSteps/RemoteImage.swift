import OwnStepsKit
import SwiftUI
import UIKit

/// A photo from the server: the tiny placeholder right away, the real image
/// once `MediaStore` has it (from disk if it was ever loaded).
struct RemoteImage: View {
    let account: Account
    let photo: Components.Schemas.Photo
    let variant: MediaVariant
    var contentMode: ContentMode = .fill
    /// Smaller sizes to show from the device's cache when `variant` can't be
    /// loaded – e.g. fullscreen while offline.
    var fallbacks: [MediaVariant] = []

    @Environment(AppModel.self) private var model
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if let placeholder = Placeholder.image(from: photo.placeholder) {
                Image(uiImage: placeholder)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .blur(radius: 8)
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .task(id: "\(photo.id)-\(variant.rawValue)") {
            let client = model.client(for: account)
            var data = try? await model.media.data(
                accountID: account.id,
                photoID: photo.id,
                variant: variant,
                request: client.mediaRequest(photoID: photo.id, variant: variant)
            )
            for fallback in fallbacks where data == nil {
                data = await model.media.cachedData(accountID: account.id, photoID: photo.id, variant: fallback)
            }
            guard let data else { return }
            // Decoding a 2400 px WebP takes a moment – off the main thread.
            image = await Task.detached { UIImage(data: data)?.preparingForDisplay() }.value
        }
    }
}

/// The server's blur-up placeholder: a ~20 px JPEG as data URI.
enum Placeholder {
    static func image(from dataURI: String?) -> UIImage? {
        guard let dataURI, let comma = dataURI.firstIndex(of: ",") else { return nil }
        guard let data = Data(base64Encoded: String(dataURI[dataURI.index(after: comma)...])) else {
            return nil
        }
        return UIImage(data: data)
    }
}
