import OwnStepsKit
import Photos
import SwiftUI
import UIKit

/// Library photos from the trip's period that aren't in it yet ([D22]).
/// Which ones count is decided in `PhotoSuggestions` (OwnStepsKit); this
/// part talks to the Photos framework.
enum LibrarySuggestions {
    static var isAllowed: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    /// Asks for photo access if that hasn't happened yet. False if denied.
    static func requestAccess() async -> Bool {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited: return true
        case .notDetermined:
            let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            return status == .authorized || status == .limited
        default: return false
        }
    }

    /// Oldest first, like the trip.
    static func find(
        for trip: Components.Schemas.TripDetail,
        account: Account,
        calendar: TripCalendar,
        uploads: UploadQueue
    ) -> [PHAsset] {
        guard isAllowed,
              let window = PhotoSuggestions.window(
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  firstStepAt: trip.steps.first?.occurredAt,
                  lastStepAt: trip.steps.last?.occurredAt,
                  calendar: calendar,
                  now: Date()
              )
        else { return [] }

        let options = PHFetchOptions()
        options.predicate = NSPredicate(
            format: "creationDate >= %@ AND creationDate < %@ AND (mediaType == %d OR mediaType == %d) AND NOT ((mediaSubtypes & %d) != 0)",
            window.start as NSDate, window.end as NSDate,
            PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue,
            PHAssetMediaSubtype.photoScreenshot.rawValue
        )
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        var assets: [String: PHAsset] = [:]
        var candidates: [PhotoSuggestions.Candidate] = []
        PHAsset.fetchAssets(with: options).enumerateObjects { asset, _, _ in
            guard let created = asset.creationDate else { return }
            assets[asset.localIdentifier] = asset
            candidates.append(.init(
                id: asset.localIdentifier,
                creationDate: created,
                pixelWidth: asset.pixelWidth,
                pixelHeight: asset.pixelHeight,
                durationMs: asset.mediaType == .video ? Int((asset.duration * 1000).rounded()) : nil
            ))
        }
        let left = PhotoSuggestions.filter(
            candidates,
            uploaded: (try? uploads.uploadedAssetIDs(accountID: account.id)) ?? [],
            ignored: (try? uploads.ignoredAssetIDs(accountID: account.id)) ?? [],
            serverPhotos: trip.steps.flatMap(\.photos)
        )
        return left.compactMap { assets[$0.id] }
    }

    /// "Not now" on the card: it stays away until newer photos turn up.
    static func dismissedUntil(account: Account, tripID: Int) -> Date? {
        let value = UserDefaults.standard.double(forKey: dismissKey(account: account, tripID: tripID))
        return value > 0 ? Date(timeIntervalSince1970: value) : nil
    }

    static func dismiss(_ suggestions: [PHAsset], account: Account, tripID: Int) {
        guard let newest = suggestions.compactMap(\.creationDate).max() else { return }
        UserDefaults.standard.set(newest.timeIntervalSince1970, forKey: dismissKey(account: account, tripID: tripID))
    }

    private static func dismissKey(account: Account, tripID: Int) -> String {
        "suggestions.dismissed.\(account.id.uuidString).\(tripID)"
    }
}

/// Above the timeline: "12 photos from this trip aren't in it yet".
struct SuggestionsCard: View {
    let count: Int
    let review: () -> Void
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "photo.stack")
                .font(.title2)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 8) {
                Text("\(count) photos from this trip aren't in it yet.")
                    .font(.subheadline)
                HStack {
                    Button("Review", action: review).buttonStyle(.borderedProminent)
                    Button("Not now", action: dismiss).buttonStyle(.bordered)
                }
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}

/// The suggested photos by day. Selected ones become a new step, or are
/// hidden for good.
struct PhotoSuggestionsView: View {
    let assets: [PHAsset]
    let calendar: TripCalendar
    let add: ([PHAsset]) -> Void
    let ignore: ([PHAsset]) -> Void

    @Environment(\.dismiss) private var close
    @State private var selected: Set<String> = []
    private let images = PHCachingImageManager()

    private var days: [(day: Date, assets: [PHAsset])] {
        let grouped = Dictionary(grouping: assets) { asset in
            calendar.calendar.startOfDay(for: asset.creationDate ?? .distantPast)
        }
        return grouped.keys.sorted().map { ($0, grouped[$0]!) }
    }

    private var chosen: [PHAsset] { assets.filter { selected.contains($0.localIdentifier) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18, pinnedViews: .sectionHeaders) {
                    ForEach(days, id: \.day) { day in
                        Section {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 3)], spacing: 3) {
                                ForEach(day.assets, id: \.localIdentifier) { asset in
                                    tile(asset)
                                }
                            }
                        } header: {
                            dayHeader(day.day, assets: day.assets)
                        }
                    }
                    if PHPhotoLibrary.authorizationStatus(for: .readWrite) == .limited {
                        Text("OwnSteps only sees the photos you allowed it to. You can change that in Settings.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    }
                }
            }
            .navigationTitle("Photo suggestions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { close() }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Hide", systemImage: "eye.slash") {
                        ignore(chosen)
                        close()
                    }
                    .disabled(selected.isEmpty)
                    Spacer()
                    Button {
                        add(chosen)
                        close()
                    } label: {
                        Text("New step with \(selected.count) photos")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(selected.isEmpty)
                }
            }
        }
    }

    private func dayHeader(_ day: Date, assets: [PHAsset]) -> some View {
        let ids = Set(assets.map(\.localIdentifier))
        let allSelected = ids.isSubset(of: selected)
        return HStack {
            Text(day.formatted(Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide)))
                .font(.subheadline.bold())
            Spacer()
            Button(allSelected ? "Deselect" : "Select all") {
                if allSelected { selected.subtract(ids) } else { selected.formUnion(ids) }
            }
            .font(.subheadline)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private func tile(_ asset: PHAsset) -> some View {
        let isSelected = selected.contains(asset.localIdentifier)
        return Button {
            if isSelected { selected.remove(asset.localIdentifier) } else { selected.insert(asset.localIdentifier) }
        } label: {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay { AssetThumbnail(asset: asset, manager: images) }
                .clipped()
                .overlay(alignment: .bottomLeading) {
                    if asset.mediaType == .video {
                        Label(Duration.seconds(asset.duration).formatted(.time(pattern: .minuteSecond)), systemImage: "video.fill")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .shadow(radius: 2)
                            .padding(4)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? AnyShapeStyle(.tint) : AnyShapeStyle(.white), .white)
                        .shadow(radius: 2)
                        .padding(5)
                }
                .opacity(isSelected ? 0.8 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// A square preview from the photo library.
private struct AssetThumbnail: View {
    let asset: PHAsset
    let manager: PHCachingImageManager
    @Environment(\.displayScale) private var scale
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .task(id: asset.localIdentifier) {
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .opportunistic
            let side = 160 * scale
            for await result in Self.images(for: asset, size: CGSize(width: side, height: side), options: options, manager: manager) {
                image = result
            }
        }
    }

    /// The opportunistic request answers twice: fast and blurry, then sharp.
    private static func images(
        for asset: PHAsset,
        size: CGSize,
        options: PHImageRequestOptions,
        manager: PHCachingImageManager
    ) -> AsyncStream<UIImage> {
        AsyncStream { continuation in
            let id = manager.requestImage(for: asset, targetSize: size, contentMode: .aspectFill, options: options) { image, info in
                if let image { continuation.yield(image) }
                let degraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if !degraded { continuation.finish() }
            }
            continuation.onTermination = { _ in manager.cancelImageRequest(id) }
        }
    }
}
