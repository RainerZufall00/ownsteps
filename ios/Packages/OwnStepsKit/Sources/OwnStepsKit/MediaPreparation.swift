@preconcurrency import AVFoundation
import CoreLocation
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Turns what the photo library hands out into what the server accepts
/// ([D20]): JPEG instead of HEIC – sharp's prebuilt binaries can't decode
/// HEVC – with all metadata kept, smaller videos, and a poster frame.
public enum MediaPreparation {
    public enum Problem: Error, Equatable {
        case unreadableImage
        case unreadableVideo
        case exportFailed
        case videoTooLarge
    }

    /// A photo or video ready for the upload queue, in the temporary folder.
    public struct Prepared: Sendable {
        public let media: UploadQueue.NewMedia
        public let captureDate: Date?
        /// Where it was taken, from the file or the library – a candidate
        /// for the step's place.
        public let latitude: Double?
        public let longitude: Double?

        public init(media: UploadQueue.NewMedia, captureDate: Date?, coordinate: CLLocationCoordinate2D? = nil) {
            self.media = media
            self.captureDate = captureDate
            latitude = coordinate?.latitude
            longitude = coordinate?.longitude
        }

        public var coordinate: CLLocationCoordinate2D? {
            guard let latitude, let longitude else { return nil }
            return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }

        /// Deletes the files again, e.g. when the user cancels.
        public func discard() {
            for url in [media.file, media.poster, media.thumbnail].compactMap({ $0 }) {
                try? FileManager.default.removeItem(at: url)
            }
        }
    }

    /// A photo as JPEG plus preview. `fallbackDate` and `location` come
    /// from the library when the file itself lacks them.
    public static func preparePhoto(
        data: Data,
        location: CLLocation? = nil,
        fallbackDate: Date? = nil,
        timeZone: TimeZone,
        assetID: String? = nil
    ) throws -> Prepared {
        let jpeg = try self.jpeg(from: data, location: location)
        let file = temporaryFile("jpg")
        try jpeg.write(to: file)
        var thumbnail: URL?
        if let preview = self.thumbnail(fromImage: jpeg) {
            thumbnail = temporaryFile("jpg")
            try preview.write(to: thumbnail!)
        }
        return Prepared(
            media: .init(file: file, thumbnail: thumbnail, mime: "image/jpeg", assetID: assetID),
            captureDate: captureDate(in: data, timeZone: timeZone) ?? fallbackDate,
            // The JPEG, because it carries the library's location when the
            // original file had none.
            coordinate: location(in: jpeg)
        )
    }

    /// A video file, reduced to 1080p unless `original`, with poster frame
    /// and preview. Takes ownership of `url`. `location` comes from the
    /// library; without it, the recording location in the file is used.
    public static func prepareVideo(
        at url: URL,
        original: Bool,
        fallbackDate: Date? = nil,
        location: CLLocation? = nil,
        assetID: String? = nil
    ) async throws -> Prepared {
        // Read before exporting, which may not carry the metadata over.
        let recordedAt = location == nil ? await recordingLocation(of: AVURLAsset(url: url)) : nil
        var file = url
        var mime = url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
        if !original {
            let exported = temporaryFile("mp4")
            try await exportVideo(from: AVURLAsset(url: url), to: exported)
            try? FileManager.default.removeItem(at: url)
            file = exported
            mime = "video/mp4"
        }
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= maxVideoBytes else {
            try? FileManager.default.removeItem(at: file)
            throw Problem.videoTooLarge
        }

        let (posterData, duration) = try await poster(forVideoAt: file)
        let poster = temporaryFile("jpg")
        try posterData.write(to: poster)
        var thumbnail: URL?
        if let preview = self.thumbnail(fromImage: posterData) {
            thumbnail = temporaryFile("jpg")
            try preview.write(to: thumbnail!)
        }
        let recorded = try? await AVURLAsset(url: file).load(.creationDate)?.load(.dateValue)
        return Prepared(
            media: .init(
                file: file, poster: poster, thumbnail: thumbnail, mime: mime,
                durationMs: duration, assetID: assetID
            ),
            captureDate: fallbackDate ?? recorded,
            coordinate: location?.coordinate ?? recordedAt
        )
    }

    /// The recording location a camera writes into a video (ISO 6709, e.g.
    /// "+60.3913+005.3221+012.000/").
    static func recordingLocation(of asset: AVAsset) async -> CLLocationCoordinate2D? {
        guard let metadata = try? await asset.load(.commonMetadata),
              let item = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierLocation).first,
              let value = try? await item.load(.stringValue)
        else { return nil }
        return coordinate(iso6709: value)
    }

    static func coordinate(iso6709 value: String) -> CLLocationCoordinate2D? {
        // Signed numbers one after the other: latitude, longitude, altitude.
        var numbers: [Double] = []
        var current = ""
        for character in value + "/" {
            if character.isNumber || character == "." {
                current.append(character)
                continue
            }
            if let number = Double(current) { numbers.append(number) }
            current = character == "+" || character == "-" ? String(character) : ""
        }
        guard numbers.count >= 2, abs(numbers[0]) <= 90, abs(numbers[1]) <= 180 else { return nil }
        return CLLocationCoordinate2D(latitude: numbers[0], longitude: numbers[1])
    }

    public static func temporaryFile(_ pathExtension: String) -> URL {
        URL.temporaryDirectory.appending(path: "\(UUID().uuidString).\(pathExtension)")
    }

    /// Copies a video someone else hands out (picker, library, share sheet)
    /// into the temporary folder – their file is only readable for a moment.
    public static func temporaryCopy(ofVideoAt url: URL) throws -> URL {
        let copy = temporaryFile(url.pathExtension.isEmpty ? "mov" : url.pathExtension)
        try FileManager.default.copyItem(at: url, to: copy)
        return copy
    }

    /// Server limit for images ([limits.ts]).
    public static let maxImageBytes = 25 * 1024 * 1024
    /// Server limit for videos.
    public static let maxVideoBytes = 400 * 1024 * 1024

    /// Re-encodes an image as JPEG at full resolution. EXIF, GPS and the
    /// orientation tag are carried over; the server reads place and time
    /// from them. If the file has no GPS but the library knows where it was
    /// taken, that position is written in.
    public static func jpeg(
        from data: Data,
        location: CLLocation? = nil,
        quality: Double = 0.85
    ) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0
        else { throw Problem.unreadableImage }

        var properties = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]
        if properties[kCGImagePropertyGPSDictionary] == nil, let location {
            properties[kCGImagePropertyGPSDictionary] = gpsDictionary(for: location)
        }

        var quality = quality
        while true {
            let output = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(
                output, UTType.jpeg.identifier as CFString, 1, nil
            ) else { throw Problem.unreadableImage }
            var options = properties
            options[kCGImageDestinationLossyCompressionQuality] = quality
            // From the source keeps the pixels as they are; HEIC depth and
            // gain maps are dropped, which JPEG can't carry anyway.
            CGImageDestinationAddImageFromSource(destination, source, 0, options as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw Problem.unreadableImage }
            // Huge panoramas can exceed the server's limit at the default
            // quality; step down until they fit.
            if output.length <= maxImageBytes || quality < 0.5 { return output as Data }
            quality -= 0.15
        }
    }

    /// A small JPEG for previews, rotated upright.
    public static func thumbnail(fromImage data: Data, maxPixels: Int = 400) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return thumbnail(from: source, maxPixels: maxPixels)
    }

    static func thumbnail(from source: CGImageSource, maxPixels: Int) -> Data? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.7] as CFDictionary)
        return CGImageDestinationFinalize(destination) ? output as Data : nil
    }

    /// When the photo was taken, from EXIF. Cameras write local time without
    /// a zone; like the server ([E12]), it's read in the server's time zone.
    public static func captureDate(in data: Data, timeZone: TimeZone) -> Date? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any],
              let text = exif[kCGImagePropertyExifDateTimeOriginal] as? String
        else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
        return formatter.date(from: text)
    }

    static func gpsDictionary(for location: CLLocation) -> [CFString: Any] {
        let coordinate = location.coordinate
        return [
            kCGImagePropertyGPSLatitude: abs(coordinate.latitude),
            kCGImagePropertyGPSLatitudeRef: coordinate.latitude >= 0 ? "N" : "S",
            kCGImagePropertyGPSLongitude: abs(coordinate.longitude),
            kCGImagePropertyGPSLongitudeRef: coordinate.longitude >= 0 ? "E" : "W",
        ]
    }

    /// GPS position stored in an image, if any.
    public static func location(in data: Data) -> CLLocationCoordinate2D? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any],
              let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
              let lon = gps[kCGImagePropertyGPSLongitude] as? Double
        else { return nil }
        let latSign = (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S" ? -1.0 : 1.0
        let lonSign = (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W" ? -1.0 : 1.0
        return CLLocationCoordinate2D(latitude: lat * latSign, longitude: lon * lonSign)
    }

    /// A poster frame a second in (the first frame is often black), as
    /// JPEG, plus the video's length.
    public static func poster(forVideoAt url: URL) async throws -> (jpeg: Data, durationMs: Int) {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1920, height: 1920)
        let seconds = duration.seconds.isFinite ? min(1, duration.seconds / 3) : 0
        let (image, _) = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))

        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)
        else { throw Problem.unreadableVideo }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw Problem.unreadableVideo }
        let milliseconds = duration.seconds.isFinite ? Int((duration.seconds * 1000).rounded()) : 0
        return (output as Data, milliseconds)
    }

    /// Re-encodes a video to at most 1080p as MP4 – usually a third to a
    /// fifth of the original size, so uploads on the road finish ([D20]).
    /// Metadata like the recording location is carried over.
    public static func exportVideo(from asset: AVAsset, to destination: URL) async throws {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
            throw Problem.exportFailed
        }
        session.shouldOptimizeForNetworkUse = true
        session.metadata = try? await asset.load(.metadata)
        try? FileManager.default.removeItem(at: destination)
        try await session.export(to: destination, as: .mp4)
    }
}

extension MediaPreparation.Problem: LocalizedError {
    /// The same words in the app and the Share Extension – both show it.
    public var errorDescription: String? {
        switch self {
        case .videoTooLarge:
            String(localized: "A video is larger than \(MediaPreparation.maxVideoBytes / 1024 / 1024) MB, even compressed.", bundle: .module)
        case .unreadableImage, .unreadableVideo, .exportFailed:
            String(localized: "A photo or video couldn't be read.", bundle: .module)
        }
    }
}
