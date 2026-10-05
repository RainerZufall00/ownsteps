import CoreLocation
import OwnStepsKit
import Photos
import PhotosUI
import SwiftUI

/// Writing a step – also without a connection ([D19]). Everything goes into
/// the upload queue on save; the queue brings it to the server when it can.
/// In `addTo` mode it only adds photos to an existing step. `assets` come
/// preselected, e.g. from the photo suggestions ([D22]).
struct StepComposerView: View {
    enum Mode: Equatable {
        case new(tripID: Int)
        case addTo(tripID: Int, stepID: Int)
    }

    let account: Account
    let mode: Mode
    var assets: [PHAsset] = []

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage(SharedContainer.originalVideosKey, store: .shared)
    private var originalVideos = false

    @State private var selection: [PhotosPickerItem] = []
    @State private var prepared: [PhotosPickerItem: PreparedMedia] = [:]
    @State private var preparedAssets: [String: PreparedMedia] = [:]
    @State private var preparing = false
    @State private var bodyText = ""
    @State private var placeName = ""
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var date = Date()
    @State private var dateTouched = false
    @State private var locating = false
    @State private var error: String?

    private var isNew: Bool { if case .new = mode { true } else { false } }
    private var calendar: TripCalendar { model.calendar(for: account) }

    private var canSave: Bool {
        guard !preparing, !locating else { return false }
        let hasMedia = !selection.isEmpty || !assets.isEmpty
        if isNew {
            return hasMedia || !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !placeName.trimmingCharacters(in: .whitespaces).isEmpty
        }
        return hasMedia
    }

    /// Suggested assets first, then what was picked – the order they're uploaded in.
    private var previewItems: [PreviewStrip.Item] {
        assets.map { .init(id: $0.localIdentifier, prepared: preparedAssets[$0.localIdentifier]) }
            + selection.map { .init(id: "\($0.hashValue)", prepared: prepared[$0]) }
    }

    private var pickerTitle: String {
        if !selection.isEmpty { return String(localized: "Change selection") }
        return assets.isEmpty ? String(localized: "Add photos or videos") : String(localized: "Add more")
    }

    private var allPrepared: [PreparedMedia] {
        Array(prepared.values) + Array(preparedAssets.values)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    // The label closure is Sendable: read the state outside.
                    let title = pickerTitle
                    PhotosPicker(
                        selection: $selection,
                        matching: .any(of: [.images, .videos]),
                        preferredItemEncoding: .current,
                        photoLibrary: .shared()
                    ) {
                        Label(title, systemImage: "photo.on.rectangle.angled")
                    }
                    if !previewItems.isEmpty {
                        PreviewStrip(items: previewItems)
                    }
                    if preparing {
                        Label("Preparing photos …", systemImage: "hourglass")
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    if originalVideos {
                        Text("Videos are uploaded in original quality (see Settings).")
                    }
                }

                if isNew {
                    Section("What happened?") {
                        TextField("Tell about this day …", text: $bodyText, axis: .vertical)
                            .lineLimit(4...12)
                    }

                    Section {
                        DatePicker(
                            "Date",
                            selection: Binding(get: { date }, set: { date = $0; dateTouched = true }),
                            displayedComponents: .date
                        )
                        .environment(\.timeZone, calendar.calendar.timeZone)
                        TextField("Place (optional)", text: $placeName)
                        Button {
                            useCurrentLocation()
                        } label: {
                            HStack {
                                Label("Use my location", systemImage: "location")
                                if locating { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(locating)
                        if let coordinate {
                            Text(String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude))
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    } footer: {
                        Text("Place and date come from the photos when they carry them.")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(isNew ? "New step" : "Add photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) {
                        allPrepared.forEach { $0.discard() }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm, action: save).disabled(!canSave)
                }
            }
            .onChange(of: selection) { prepareSelection() }
            .task { await prepareAssets() }
            .interactiveDismissDisabled(preparing || !selection.isEmpty || !assets.isEmpty || !bodyText.isEmpty)
        }
    }

    /// Prepares new picks right away, so saving is instant and the date can
    /// default to the earliest photo.
    private func prepareSelection() {
        let removed = prepared.keys.filter { !selection.contains($0) }
        removed.compactMap { prepared.removeValue(forKey: $0) }.forEach { $0.discard() }
        let missing = selection.filter { prepared[$0] == nil }
        guard !missing.isEmpty else { return }

        preparing = true
        error = nil
        Task {
            defer { preparing = false }
            do {
                let results = try await MediaImporter.prepare(
                    missing, timeZone: calendar.calendar.timeZone, originalVideos: originalVideos
                )
                for (item, result) in zip(missing, results) { prepared[item] = result }
                adoptEarliestDate()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func prepareAssets() async {
        guard !assets.isEmpty, preparedAssets.isEmpty else { return }
        preparing = true
        defer { preparing = false }
        do {
            let results = try await MediaImporter.prepare(
                assets, timeZone: calendar.calendar.timeZone, originalVideos: originalVideos
            )
            for (asset, result) in zip(assets, results) { preparedAssets[asset.localIdentifier] = result }
            adoptEarliestDate()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func adoptEarliestDate() {
        if !dateTouched, let earliest = allPrepared.compactMap(\.captureDate).min() {
            date = earliest
        }
    }

    private func useCurrentLocation() {
        locating = true
        error = nil
        Task {
            defer { locating = false }
            do {
                let location = try await CurrentLocation.fetch()
                coordinate = location.coordinate
                if placeName.trimmingCharacters(in: .whitespaces).isEmpty,
                   let name = await CurrentLocation.placeName(for: location)
                {
                    placeName = name
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func save() {
        let media = assets.compactMap { preparedAssets[$0.localIdentifier]?.media }
            + selection.compactMap { prepared[$0]?.media }
        do {
            guard media.count == selection.count + assets.count else { throw MediaPreparation.Problem.unreadableImage }
            switch mode {
            case .new(let tripID):
                enqueueNew(tripID: tripID, media: media)
            case .addTo(let tripID, let stepID):
                Task {
                    try? await model.uploads.enqueueMedia(accountID: account.id, tripID: tripID, stepID: stepID, media: media)
                    model.resumeUploads()
                }
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func enqueueNew(tripID: Int, media: [UploadQueue.NewMedia]) {
        let (body, place, coordinate, date) = (bodyText, placeName, coordinate, date)
        let uploads = model.uploads
        let accountID = account.id
        Task {
            _ = try? await uploads.enqueueStep(
                accountID: accountID,
                tripID: tripID,
                body: body,
                placeName: place,
                lat: coordinate?.latitude,
                lon: coordinate?.longitude,
                occurredAt: date,
                media: media
            )
            model.resumeUploads()
        }
    }
}

/// The chosen photos as small squares, filled in as they're prepared.
private struct PreviewStrip: View {
    struct Item: Identifiable {
        let id: String
        let prepared: PreparedMedia?
    }

    let items: [Item]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(items) { item in
                    ZStack {
                        if let url = item.prepared?.media.thumbnail, let image = UIImage(contentsOfFile: url.path(percentEncoded: false)) {
                            Image(uiImage: image).resizable().scaledToFill()
                        } else {
                            Rectangle().fill(.quaternary)
                            ProgressView()
                        }
                        if item.prepared?.media.mime.hasPrefix("video/") == true {
                            Image(systemName: "play.circle.fill").foregroundStyle(.white, .black.opacity(0.4))
                        }
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(.rect(cornerRadius: 8))
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}
