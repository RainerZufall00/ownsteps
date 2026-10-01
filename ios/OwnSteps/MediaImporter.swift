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
struct PreparedMedia {
    let media: UploadQueue.NewMedia
    let captureDate: Date?
}

/// Turns picker items into files the server takes ([D20]): photos as JPEG
/// with their metadata, Live Photos as their still, videos compressed to
/// 1080p unless the user wants originals.
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
        originalVideos: Bool,
        progress: @escaping (Int) -> Void
    ) async throws -> [PreparedMedia] {
        var prepared: [PreparedMedia] = []
        for (index, item) in items.enumerated() {
            progress(index)
            let asset = libraryAsset(for: item)
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                prepared.append(try await prepareVideo(item, asset: asset, original: originalVideos))
            } else {
                prepared.append(try await preparePhoto(item, asset: asset, timeZone: timeZone))
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

    private static func preparePhoto(
        _ item: PhotosPickerItem,
        asset: PHAsset?,
        timeZone: TimeZone
    ) async throws -> PreparedMedia {
        // For a Live Photo this is the still image.
        guard let data = try await item.loadTransferable(type: Data.self) else { throw Problem.unreadable }
        let jpeg = try MediaPreparation.jpeg(from: data, location: asset?.location)
        let file = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
        try jpeg.write(to: file)

        var thumbnail: URL?
        if let preview = MediaPreparation.thumbnail(fromImage: jpeg) {
            thumbnail = URL.temporaryDirectory.appending(path: "\(UUID().uuidString)-thumb.jpg")
            try preview.write(to: thumbnail!)
        }
        return PreparedMedia(
            media: .init(file: file, thumbnail: thumbnail, mime: "image/jpeg", assetID: item.itemIdentifier),
            captureDate: MediaPreparation.captureDate(in: data, timeZone: timeZone) ?? asset?.creationDate
        )
    }

    private static func prepareVideo(_ item: PhotosPickerItem, asset: PHAsset?, original: Bool) async throws -> PreparedMedia {
        guard let movie = try await item.loadTransferable(type: PickedMovie.self) else { throw Problem.unreadable }

        var file = movie.url
        var mime = movie.url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
        if !original {
            let exported = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).mp4")
            try await MediaPreparation.exportVideo(from: movie.url, to: exported)
            try? FileManager.default.removeItem(at: movie.url)
            file = exported
            mime = "video/mp4"
        }
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= MediaPreparation.maxVideoBytes else {
            try? FileManager.default.removeItem(at: file)
            throw Problem.videoTooLarge
        }

        let (posterData, duration) = try await MediaPreparation.poster(forVideoAt: file)
        let poster = URL.temporaryDirectory.appending(path: "\(UUID().uuidString)-poster.jpg")
        try posterData.write(to: poster)
        var thumbnail: URL?
        if let preview = MediaPreparation.thumbnail(fromImage: posterData) {
            thumbnail = URL.temporaryDirectory.appending(path: "\(UUID().uuidString)-thumb.jpg")
            try preview.write(to: thumbnail!)
        }
        let recorded = try? await AVURLAsset(url: file).load(.creationDate)?.load(.dateValue)
        return PreparedMedia(
            media: .init(
                file: file, poster: poster, thumbnail: thumbnail, mime: mime,
                durationMs: duration, assetID: item.itemIdentifier
            ),
            captureDate: asset?.creationDate ?? recorded
        )
    }
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

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
