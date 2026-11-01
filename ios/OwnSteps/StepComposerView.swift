import CoreLocation
import OwnStepsKit
import Photos
import PhotosUI
import SwiftUI

/// Writing a step – also without a connection ([D19]). Laid out like a page
/// in Apple's Journal, not like a form: place and day on top, the text as
/// the main thing, the photos as a strip below it. A bar above the keyboard
/// brings photos, place and date. Everything goes into the upload queue on
/// save; the queue brings it to the server when it can.
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
        /// Nil for assets that came preselected.
        var pick: PhotosPickerItem? = nil
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
    @State private var pickingPhotos = false
    @State private var choosingPlace = false
    @State private var choosingDate = false
    /// The photo whose caption is being written.
    @State private var captioning: Item?
    /// Preselected assets taken out again.
    @State private var removedAssets: Set<String> = []
    @FocusState private var writing: Bool

    private var isNew: Bool { if case .new = mode { true } else { false } }
    private var calendar: TripCalendar { model.calendar(for: account) }

    private var canSave: Bool {
        guard !preparing, !locating else { return false }
        let hasMedia = !items.isEmpty
        if isNew {
            return hasMedia || !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !placeName.trimmingCharacters(in: .whitespaces).isEmpty
        }
        return hasMedia
    }

    /// Suggested assets first, then what was picked – the order they're uploaded in.
    private var items: [Item] {
        assets.filter { !removedAssets.contains($0.localIdentifier) }
            .map { Item(id: $0.localIdentifier, prepared: preparedAssets[$0.localIdentifier]) }
            + selection.map { Item(id: "\($0.hashValue)", prepared: prepared[$0], pick: $0) }
    }

    /// Something a cancel would lose.
    private var hasContent: Bool {
        !items.isEmpty || !bodyText.isEmpty || !placeName.isEmpty
    }

    /// The places the photos were taken at, earliest first.
    private var photoPlaces: [PhotoPlace] {
        PhotoPlace.group(items.compactMap { item in
            item.prepared?.coordinate.map { (item.id, $0, item.prepared?.captureDate) }
        })
    }

    private var allPrepared: [PreparedMedia] {
        Array(prepared.values) + Array(preparedAssets.values)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if isNew {
                        heading
                        TextField("Tell about this day …", text: $bodyText, axis: .vertical)
                            .font(.title3)
                            .focused($writing)
                            .frame(minHeight: 110, alignment: .topLeading)
                    }
                    mediaStrip
                    if let error {
                        Text(error).foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                // A readable column on the iPad.
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaBar(edge: .bottom) { actionBar }
            .navigationTitle(isNew ? "New step" : "Add photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    DiscardButton(hasChanges: hasContent) {
                        allPrepared.forEach { $0.discard() }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm, action: save).disabled(!canSave)
                }
            }
            .photosPicker(
                isPresented: $pickingPhotos,
                selection: $selection,
                matching: .any(of: [.images, .videos]),
                preferredItemEncoding: .current,
                photoLibrary: .shared()
            )
            .sheet(isPresented: $choosingPlace) { placeSheet }
            .sheet(item: $captioning) { item in
                CaptionSheet(item: item, caption: Binding(
                    get: { captions[item.id] ?? "" },
                    set: { captions[item.id] = $0 }
                ))
            }
            .onChange(of: selection) { prepareSelection() }
            .task { await prepareAssets() }
            .onAppear {
                if isNew {
                    writing = true
                } else if assets.isEmpty {
                    // Adding photos is all this screen does.
                    pickingPhotos = true
                }
            }
            .interactiveDismissDisabled(preparing || hasContent)
        }
    }

    // MARK: Page

    /// The place as the page's title, the day below it.
    private var heading: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button { choosingPlace = true } label: {
                Text(placeName.isEmpty ? String(localized: "Add a place") : placeName)
                    .font(.title2.bold())
                    .foregroundStyle(placeName.isEmpty ? .secondary : .primary)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            Text(date.formatted(
                Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide).year()
            ))
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
    }

    /// Stays above the keyboard while writing.
    private var actionBar: some View {
        HStack(spacing: 0) {
            barButton("Add photos or videos", systemImage: "photo.on.rectangle.angled") { pickingPhotos = true }
            if isNew {
                barButton(
                    "Place",
                    systemImage: coordinate == nil && placeName.isEmpty ? "mappin.and.ellipse" : "mappin.circle.fill"
                ) { choosingPlace = true }
                barButton("Date", systemImage: "calendar") { choosingDate = true }
                    .popover(isPresented: $choosingDate) {
                        DatePicker(
                            "Date",
                            selection: Binding(get: { date }, set: { date = $0; dateTouched = true }),
                            displayedComponents: .date
                        )
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, calendar.calendar.timeZone)
                        .frame(width: 320)
                        .padding()
                        .presentationCompactAdaptation(.popover)
                    }
            }
        }
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func barButton(_ title: LocalizedStringKey, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3)
                .frame(maxWidth: .infinity, minHeight: 46)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(title))
    }

    // MARK: Photos and captions

    /// A tap writes a caption, the corner takes a photo out again.
    private var mediaStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(items) { item in
                        Button { captioning = item } label: {
                            thumbnail(item)
                        }
                        .buttonStyle(.plain)
                        .disabled(item.prepared == nil)
                        .accessibilityLabel(Text(captions[item.id]?.isEmpty == false ? captions[item.id] ?? "" : String(localized: "Add a caption")))
                        .overlay(alignment: .topTrailing) {
                            Button { remove(item) } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title3)
                                    .symbolRenderingMode(.palette)
                                    .foregroundStyle(.white, .black.opacity(0.55))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                            .accessibilityLabel(Text("Remove"))
                        }
                    }
                    Button { pickingPhotos = true } label: {
                        Image(systemName: "plus")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .frame(width: Self.thumbnailSize, height: Self.thumbnailSize)
                            .background(.fill.tertiary, in: .rect(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("Add photos or videos"))
                }
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
            if preparing {
                Label("Preparing photos …", systemImage: "hourglass")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if originalVideos {
                Text("Videos are uploaded in original quality (see Settings).")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private static let thumbnailSize: CGFloat = 96

    private func thumbnail(_ item: Item) -> some View {
        FileThumbnail(
            url: item.prepared?.media.thumbnail,
            isVideo: item.prepared?.media.mime.hasPrefix("video/") == true,
            size: Self.thumbnailSize,
            loading: item.prepared == nil
        )
        .overlay(alignment: .bottomLeading) {
            if captions[item.id]?.isEmpty == false {
                Image(systemName: "text.bubble.fill")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(6)
                    .accessibilityHidden(true)
            }
        }
    }

    private func remove(_ item: Item) {
        captions[item.id] = nil
        if let pick = item.pick {
            // `prepareSelection` follows and throws its file away.
            selection.removeAll { $0 == pick }
        } else {
            removedAssets.insert(item.id)
            preparedAssets.removeValue(forKey: item.id)?.discard()
            adoptPhotoPlace()
        }
    }

    // MARK: Place

    /// Where the step goes on the map: where a photo was taken (preselected
    /// when one knows), where the phone is now, or a place picked by hand.
    private var placeSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Place (optional)", text: Binding(
                        get: { placeName },
                        set: { placeName = $0; placeTyped = !$0.isEmpty }
                    ))
                }
                Section {
                    // Photos from several places: the step can only be at one.
                    ForEach(photoPlaces) { place in
                        Button {
                            error = nil
                            locationSource = .photo
                            usePhotoPlace(place)
                        } label: {
                            HStack(spacing: 12) {
                                FileThumbnail(url: thumbnail(of: place), isVideo: false, size: 44)
                                Text(placeNames[place.id] ?? Self.coordinateText(place.coordinate))
                                    .foregroundStyle(.primary)
                                Spacer()
                                if locationSource == .photo, place.id == photoPlaceID {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .task { await lookUpName(of: place) }
                    }
                    Button { choose(.current) } label: {
                        HStack {
                            Label("My location", systemImage: "location")
                                .foregroundStyle(.primary)
                            Spacer()
                            if locating {
                                ProgressView()
                            } else if locationSource == .current {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                    Button { choose(.map) } label: {
                        HStack {
                            Label("On the map", systemImage: "map")
                                .foregroundStyle(.primary)
                            Spacer()
                            if locationSource == .map {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                } footer: {
                    if photoPlaces.count > 1 {
                        Text("These photos were taken in different places. The step appears on the map at the one you pick; each photo keeps its own position.")
                    }
                }
                if let coordinate {
                    Section {
                        LabeledContent(Self.coordinateText(coordinate)) {
                            Button("Remove", role: .destructive) { clearLocation() }
                                .buttonStyle(.borderless)
                        }
                        .font(.footnote.monospacedDigit())
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm) { choosingPlace = false }
                }
            }
            .sheet(isPresented: $choosingOnMap) {
                LocationPickerView(initial: coordinate) { picked, name in
                    locationSource = .map
                    apply(picked, name: name)
                }
            }
        }
        .presentationDetents([.medium, .large])
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
            // Comments on it are what an author wants to hear about.
            Task { await Notifications.requestPermission() }
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

/// The caption of one photo, written before it's uploaded.
private struct CaptionSheet: View {
    let item: StepComposerView.Item
    @Binding var caption: String

    @Environment(\.dismiss) private var dismiss
    @FocusState private var writing: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                FileThumbnail(
                    url: item.prepared?.media.thumbnail,
                    isVideo: item.prepared?.media.mime.hasPrefix("video/") == true,
                    size: 140
                )
                TextField("Caption (optional)", text: $caption, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($writing)
                Spacer(minLength: 0)
            }
            .padding(20)
            .navigationTitle("Caption")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm) { dismiss() }
                }
            }
            .onAppear { writing = true }
        }
        .presentationDetents([.medium])
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
