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

    /// Where the step's place comes from.
    enum LocationSource: Hashable {
        case photo
        case current
        case map
    }

    /// A chosen photo or video, filled in once it's prepared.
    struct Item: Identifiable {
        let id: String
        let prepared: PreparedMedia?
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
    /// Per item ID, written before uploading.
    @State private var captions: [String: String] = [:]
    @State private var bodyText = ""
    @State private var date = Date()
    @State private var dateTouched = false
    @State private var locationSource: LocationSource?
    /// With `.photo`: the place whose position the step takes.
    @State private var photoPlaceID: String?
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var placeName = ""
    /// Typed by hand – then a newly chosen position doesn't overwrite it.
    @State private var placeTyped = false
    @State private var placeNames: [String: String] = [:]
    @State private var choosingOnMap = false
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
    private var items: [Item] {
        assets.map { Item(id: $0.localIdentifier, prepared: preparedAssets[$0.localIdentifier]) }
            + selection.map { Item(id: "\($0.hashValue)", prepared: prepared[$0]) }
    }

    /// The places the photos were taken at, earliest first.
    private var photoPlaces: [PhotoPlace] {
        PhotoPlace.group(items.compactMap { item in
            item.prepared?.coordinate.map { (item.id, $0, item.prepared?.captureDate) }
        })
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
                mediaSection
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
                    } footer: {
                        Text("The date comes from the photos when they carry one.")
                    }
                    locationSection
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
            .sheet(isPresented: $choosingOnMap) {
                LocationPickerView(initial: coordinate) { picked, name in
                    locationSource = .map
                    apply(picked, name: name)
                }
            }
            .onChange(of: selection) { prepareSelection() }
            .task { await prepareAssets() }
            .interactiveDismissDisabled(preparing || !selection.isEmpty || !assets.isEmpty || !bodyText.isEmpty)
        }
    }

    // MARK: Photos and captions

    private var mediaSection: some View {
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
            ForEach(items) { item in
                HStack(spacing: 12) {
                    FileThumbnail(
                        url: item.prepared?.media.thumbnail,
                        isVideo: item.prepared?.media.mime.hasPrefix("video/") == true,
                        size: 56,
                        loading: item.prepared == nil
                    )
                    TextField("Caption (optional)", text: Binding(
                        get: { captions[item.id] ?? "" },
                        set: { captions[item.id] = $0 }
                    ), axis: .vertical)
                    .lineLimit(1...4)
                }
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
    }

    // MARK: Place

    /// Where the step goes on the map: where a photo was taken (preselected
    /// when one knows), where the phone is now, or a place picked by hand.
    private var locationSection: some View {
        Section {
            Picker("Location", selection: Binding(get: { locationSource }, set: choose)) {
                if !photoPlaces.isEmpty {
                    Text("From photo").tag(Optional(LocationSource.photo))
                }
                Text("My location").tag(Optional(LocationSource.current))
                Text("On the map").tag(Optional(LocationSource.map))
            }
            .pickerStyle(.segmented)
            .listRowSeparator(.hidden)

            // Photos from several places: the step can only be at one.
            if locationSource == .photo, photoPlaces.count > 1 {
                ForEach(photoPlaces) { place in
                    Button { usePhotoPlace(place) } label: {
                        HStack(spacing: 12) {
                            FileThumbnail(url: thumbnail(of: place), isVideo: false, size: 44)
                            Text(placeNames[place.id] ?? Self.coordinateText(place.coordinate))
                                .foregroundStyle(.primary)
                            Spacer()
                            if place.id == photoPlaceID {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                    .task { await lookUpName(of: place) }
                }
            }

            if locating {
                HStack {
                    Text("Finding your location …").foregroundStyle(.secondary)
                    Spacer()
                    ProgressView()
                }
            }

            TextField("Place (optional)", text: Binding(
                get: { placeName },
                set: { placeName = $0; placeTyped = !$0.isEmpty }
            ))
            if let coordinate {
                HStack {
                    Text(Self.coordinateText(coordinate))
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Remove", role: .destructive) { clearLocation() }
                        .font(.footnote)
                        .buttonStyle(.borderless)
                }
            }
        } header: {
            Text("Place")
        } footer: {
            if locationSource == .photo, photoPlaces.count > 1 {
                Text("These photos were taken in different places. The step appears on the map at the one you pick; each photo keeps its own position.")
            }
        }
    }

    private func choose(_ source: LocationSource?) {
        error = nil
        switch source {
        case .photo:
            locationSource = .photo
            if let place = photoPlaces.first(where: { $0.id == photoPlaceID }) ?? photoPlaces.first {
                usePhotoPlace(place)
            }
        case .current:
            locationSource = .current
            useCurrentLocation()
        case .map:
            // Only switches once a place was picked; cancelling keeps the old one.
            choosingOnMap = true
        case nil:
            clearLocation()
        }
    }

    private func usePhotoPlace(_ place: PhotoPlace) {
        photoPlaceID = place.id
        apply(place.coordinate, name: placeNames[place.id])
    }

    /// Takes over a position; its name too, unless one was typed by hand.
    private func apply(_ coordinate: CLLocationCoordinate2D, name: String?) {
        self.coordinate = coordinate
        guard !placeTyped else { return }
        if let name {
            placeName = name
            return
        }
        placeName = ""
        Task {
            let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            // Offline it stays empty – the server names the place then.
            let found = await CurrentLocation.placeName(for: location)
            if !placeTyped, self.coordinate?.latitude == coordinate.latitude, let found {
                placeName = found
            }
        }
    }

    private func clearLocation() {
        locationSource = nil
        coordinate = nil
        if !placeTyped { placeName = "" }
    }

    /// Preselects the place of the earliest photo, as long as the user
    /// hasn't chosen another source.
    private func adoptPhotoPlace() {
        guard isNew, locationSource == nil || locationSource == .photo else { return }
        let places = photoPlaces
        guard let place = places.first(where: { $0.id == photoPlaceID }) ?? places.first else {
            if locationSource == .photo { clearLocation() }
            return
        }
        locationSource = .photo
        usePhotoPlace(place)
    }

    private func lookUpName(of place: PhotoPlace) async {
        guard placeNames[place.id] == nil else { return }
        let location = CLLocation(latitude: place.coordinate.latitude, longitude: place.coordinate.longitude)
        if let name = await CurrentLocation.placeName(for: location) {
            placeNames[place.id] = name
            if place.id == photoPlaceID, !placeTyped, placeName.isEmpty { placeName = name }
        }
    }

    private func thumbnail(of place: PhotoPlace) -> URL? {
        items.first { $0.id == place.id }?.prepared?.media.thumbnail
    }

    static func coordinateText(_ coordinate: CLLocationCoordinate2D) -> String {
        String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude)
    }

    private func useCurrentLocation() {
        locating = true
        Task {
            defer { locating = false }
            do {
                let location = try await CurrentLocation.fetch()
                apply(location.coordinate, name: nil)
            } catch {
                self.error = error.localizedDescription
                if coordinate == nil { locationSource = nil }
            }
        }
    }

    // MARK: Preparing and saving

    /// Prepares new picks right away, so saving is instant and date and
    /// place can come from the photos.
    private func prepareSelection() {
        let removed = prepared.keys.filter { !selection.contains($0) }
        removed.compactMap { prepared.removeValue(forKey: $0) }.forEach { $0.discard() }
        let missing = selection.filter { prepared[$0] == nil }
        guard !missing.isEmpty else {
            adoptPhotoPlace()
            return
        }

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
                adoptPhotoPlace()
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
            adoptPhotoPlace()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func adoptEarliestDate() {
        if !dateTouched, let earliest = allPrepared.compactMap(\.captureDate).min() {
            date = earliest
        }
    }

    private func save() {
        var media: [UploadQueue.NewMedia] = []
        for item in items {
            guard var next = item.prepared?.media else {
                error = MediaPreparation.Problem.unreadableImage.localizedDescription
                return
            }
            let caption = captions[item.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            next.caption = caption.isEmpty ? nil : caption
            media.append(next)
        }
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
                // Sent with the step, so the server doesn't take whichever
                // photo happens to arrive first.
                lat: coordinate?.latitude,
                lon: coordinate?.longitude,
                occurredAt: date,
                media: media
            )
            model.resumeUploads()
        }
    }
}

/// Where photos of one step were taken, merged when they're close together.
struct PhotoPlace: Identifiable {
    /// The item ID of the earliest photo taken there.
    let id: String
    let coordinate: CLLocationCoordinate2D

    /// Photos within a kilometre count as one place – a walk through town
    /// isn't several places. Earliest first, so the step's place is where
    /// the day started, like its date.
    static func group(_ photos: [(id: String, coordinate: CLLocationCoordinate2D, date: Date?)]) -> [PhotoPlace] {
        let sorted = photos.sorted { ($0.date ?? .distantFuture) < ($1.date ?? .distantFuture) }
        var places: [PhotoPlace] = []
        for photo in sorted {
            let location = CLLocation(latitude: photo.coordinate.latitude, longitude: photo.coordinate.longitude)
            let near = places.contains { place in
                CLLocation(latitude: place.coordinate.latitude, longitude: place.coordinate.longitude)
                    .distance(from: location) < 1_000
            }
            if !near { places.append(PhotoPlace(id: photo.id, coordinate: photo.coordinate)) }
        }
        return places
    }
}
