import AVFoundation
import CoreLocation
import OwnStepsKit
import MapKit
import Photos
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// A video from the picker, copied into the app's temporary folder.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).\(received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

/// A photo or video ready for the upload queue.
typealias PreparedMedia = MediaPreparation.Prepared

/// Turns picker items and library assets into files the server takes
/// ([D20]): photos as JPEG with their metadata, Live Photos as their still,
/// videos compressed to 1080p unless the user wants originals.
enum MediaImporter {
    enum Problem: LocalizedError {
        case unreadable
        case videoTooLarge

        var errorDescription: String? {
            switch self {
            case .unreadable: String(localized: "A photo or video couldn't be read.")
            case .videoTooLarge: String(localized: "A video is larger than 400 MB, even compressed.")
            }
        }
    }

    static func prepare(
        _ items: [PhotosPickerItem],
        timeZone: TimeZone,
        originalVideos: Bool
    ) async throws -> [PreparedMedia] {
        var prepared: [PreparedMedia] = []
        for item in items {
            let asset = libraryAsset(for: item)
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                guard let movie = try await item.loadTransferable(type: PickedMovie.self) else { throw Problem.unreadable }
                prepared.append(try await video(at: movie.url, original: originalVideos, asset: asset, assetID: item.itemIdentifier))
            } else {
                // For a Live Photo this is the still image.
                guard let data = try await item.loadTransferable(type: Data.self) else { throw Problem.unreadable }
                prepared.append(try photo(data, asset: asset, timeZone: timeZone, assetID: item.itemIdentifier))
            }
        }
        return prepared
    }

    /// Library assets, e.g. from the photo suggestions ([D22]). Needs photo
    /// access; iCloud originals are downloaded as needed.
    static func prepare(
        _ assets: [PHAsset],
        timeZone: TimeZone,
        originalVideos: Bool
    ) async throws -> [PreparedMedia] {
        var prepared: [PreparedMedia] = []
        for asset in assets {
            if asset.mediaType == .video {
                prepared.append(try await video(from: asset, original: originalVideos))
            } else {
                let data = try await imageData(for: asset)
                prepared.append(try photo(data, asset: asset, timeZone: timeZone, assetID: asset.localIdentifier))
            }
        }
        return prepared
    }

    /// The library asset behind a picker item – only readable when the user
    /// granted photo access. It supplies location and date when the file
    /// itself has none.
    private static func libraryAsset(for item: PhotosPickerItem) -> PHAsset? {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard let id = item.itemIdentifier, status == .authorized || status == .limited else { return nil }
        return PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject
    }

    private static func photo(_ data: Data, asset: PHAsset?, timeZone: TimeZone, assetID: String?) throws -> PreparedMedia {
        do {
            return try MediaPreparation.preparePhoto(
                data: data, location: asset?.location, fallbackDate: asset?.creationDate,
                timeZone: timeZone, assetID: assetID
            )
        } catch {
            throw Problem.unreadable
        }
    }

    private static func video(at url: URL, original: Bool, asset: PHAsset?, assetID: String?) async throws -> PreparedMedia {
        do {
            return try await MediaPreparation.prepareVideo(
                at: url, original: original, fallbackDate: asset?.creationDate, assetID: assetID
            )
        } catch MediaPreparation.Problem.videoTooLarge {
            throw Problem.videoTooLarge
        }
    }

    private static func imageData(for asset: PHAsset) async throws -> Data {
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.version = .current
        options.deliveryMode = .highQualityFormat
        return try await withCheckedThrowingContinuation { continuation in
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
                if let data { continuation.resume(returning: data) } else { continuation.resume(throwing: Problem.unreadable) }
            }
        }
    }

    /// Plain videos are copied as files; edited or slow-motion ones come as a
    /// composition, which Photos exports for us.
    private static func video(from asset: PHAsset, original: Bool) async throws -> PreparedMedia {
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.version = .current
        // Copied inside the callback: the library file is only readable while
        // the AVAsset (which holds the sandbox extension for it) is alive.
        let copied = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL?, any Error>) in
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
                guard let avAsset else { return continuation.resume(throwing: Problem.unreadable) }
                guard let source = (avAsset as? AVURLAsset)?.url else { return continuation.resume(returning: nil) }
                let file = MediaPreparation.temporaryFile(source.pathExtension.isEmpty ? "mov" : source.pathExtension)
                do {
                    try FileManager.default.copyItem(at: source, to: file)
                    continuation.resume(returning: file)
                } catch {
                    continuation.resume(throwing: Problem.unreadable)
                }
            }
        }
        if let copied {
            return try await video(at: copied, original: original, asset: asset, assetID: asset.localIdentifier)
        }

        let preset = original ? AVAssetExportPresetHighestQuality : AVAssetExportPreset1920x1080
        let export = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<ExportBox, any Error>) in
            PHImageManager.default().requestExportSession(forVideo: asset, options: options, exportPreset: preset) { session, _ in
                guard let session else { return continuation.resume(throwing: Problem.unreadable) }
                continuation.resume(returning: ExportBox(session: session))
            }
        }
        let file = MediaPreparation.temporaryFile("mp4")
        try await export.session.export(to: file, as: .mp4)
        // Already in its final size.
        return try await video(at: file, original: true, asset: asset, assetID: asset.localIdentifier)
    }
}

/// Photos hands the session over on its own queue; only used afterwards.
private struct ExportBox: @unchecked Sendable {
    let session: AVAssetExportSession
}

/// "Use my location" for steps written on the spot – the lifeline for
/// photos without GPS ([E8]).
enum CurrentLocation {
    enum Problem: LocalizedError {
        case denied
        case unavailable

        var errorDescription: String? {
            switch self {
            case .denied: String(localized: "Location access is turned off for OwnSteps.")
            case .unavailable: String(localized: "Your location couldn't be determined.")
            }
        }
    }

    static func fetch() async throws -> CLLocation {
        // Keeps the "while using" permission request alive for the duration.
        let session = CLServiceSession(authorization: .whenInUse)
        defer { session.invalidate() }
        for try await update in CLLocationUpdate.liveUpdates() {
            if update.authorizationDenied || update.authorizationDeniedGlobally { throw Problem.denied }
            if let location = update.location, location.horizontalAccuracy < 200 { return location }
        }
        throw Problem.unavailable
    }

    /// "Bergen, Norway" – like the server's place names.
    static func placeName(for location: CLLocation) async -> String? {
        guard let request = MKReverseGeocodingRequest(location: location),
              let item = try? await request.mapItems.first,
              let address = item.addressRepresentations
        else { return nil }
        return [address.cityName, address.regionName].compactMap { $0 }.joined(separator: ", ").nilIfEmpty
    }
}
