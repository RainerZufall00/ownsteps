import MapKit
import OwnStepsKit
import Photos
import SwiftUI

/// One trip: the route on a map that fills the screen, the timeline on top
/// of it – as a sheet on the iPhone, as an inspector column on the iPad.
/// Shows the cached copy first and refreshes behind it.
struct TripView: View {
    let account: Account
    let tripID: Int
    /// Scrolled to on arrival, e.g. from a notification.
    var focusStepID: Int? = nil

    /// Low enough to see the map, high enough for title and numbers.
    static let peek = PresentationDetent.height(200)

    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var trip: Components.Schemas.TripDetail?
    @State private var staleSince: Date?
    @State private var error: String?
    @State private var showingTimeline = true
    @State private var detent = TripView.peek
    /// The timeline entry at the top – the map follows it.
    @State private var focusedItem: String?
    @State private var mapSelection: Int?
    @State private var camera: MapCameraPosition = .automatic
    @State private var queue = UploadSnapshot()
    @State private var composer: StepComposerView.Mode?
    /// Preselected for the composer, from the photo suggestions.
    @State private var composerAssets: [PHAsset] = []
    @State private var editing: Components.Schemas.Step?
    @State private var editingTrip = false
    @State private var suggestions: [PHAsset] = []
    /// "Not now" hides the card until newer photos turn up.
    @State private var suggestionsDismissedUntil: Date?
    @State private var showingSuggestions = false
    @State private var photoAccessDenied = false
    @State private var enableSharingFor: ShareTarget?
    @State private var commentingOn: Components.Schemas.Step?
    @State private var showingReaders = false
    @State private var muted = false
    @State private var confirmingUnfollow = false

    /// Readers follow one trip and only read and comment ([D17]).
    private var isAuthor: Bool { account.kind == .author }

    private var calendar: TripCalendar { model.calendar(for: account) }

    /// On the iPhone the timeline is a sheet over the map.
    private var isCompact: Bool { sizeClass != .regular }

    var body: some View {
        Group {
            if isCompact {
                // A sheet can't present a second sheet from the view below
                // it, so on the iPhone everything is presented from the
                // timeline sheet.
                mapLayer
                    .toolbar { toolbar }
                    .sheet(isPresented: $showingTimeline) {
                        presentations(timeline, active: true)
                            .presentationDetents([Self.peek, .medium, .large], selection: $detent)
                            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                            .interactiveDismissDisabled()
                    }
            } else {
                // The toolbar goes outside the inspector, or its items
                // vanish while the inspector is open.
                presentations(
                    mapLayer
                        .inspector(isPresented: $showingTimeline) {
                            timeline.inspectorColumnWidth(min: 340, ideal: 420, max: 520)
                        }
                        .toolbar { toolbar },
                    active: true
                )
            }
        }
        .navigationTitle(isCompact ? "" : trip?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        // The sheet can't be closed on the iPhone; the inspector can.
        .onChange(of: isCompact) { _, compact in if compact { showingTimeline = true } }
        .onChange(of: focusedItem) { _, id in followTimeline(to: id) }
        // The first copy of the trip – cached or fresh – frames the route.
        .onChange(of: trip == nil, initial: true) { _, missing in
            if !missing, let trip, focusedItem == nil { camera = TripMapView.overview(of: trip) }
        }
        .onChange(of: mapSelection) { _, id in followMap(to: id) }
        .task {
            muted = Notifications.isMuted(account: account, tripID: tripID)
            if trip == nil, let cached = try? model.cache.trip(tripID, for: account.id) {
                trip = cached.value
            }
            if let focusStepID {
                focusedItem = TimelineItem.id(serverStep: focusStepID)
                detent = .medium
            }
            await refresh()
        }
        .task(id: tripID) { await watchQueue() }
    }

    // MARK: Map and timeline

    private var mapLayer: some View {
        GeometryReader { geometry in
            Group {
                if let trip {
                    TripMapView(account: account, trip: trip, selection: $mapSelection, position: $camera)
                } else {
                    Map(interactionModes: []).mapStyle(.hybrid)
                }
            }
            // Frames the route in what the sheet leaves free.
            .safeAreaPadding(.bottom, mapInset(height: geometry.size.height))
        }
    }

    private func mapInset(height: CGFloat) -> CGFloat {
        guard isCompact, showingTimeline else { return 0 }
        return detent == Self.peek ? 205 : height * 0.52
    }

    @ViewBuilder private var timeline: some View {
        if let trip {
            TimelineView(
                account: account,
                trip: trip,
                calendar: calendar,
                staleSince: staleSince,
                queue: queue,
                focusedItem: $focusedItem,
                actions: .init(
                    isAuthor: isAuthor,
                    edit: { editing = $0 },
                    addPhotos: { composer = .addTo(tripID: tripID, stepID: $0.id) },
                    share: { share(.step($0.id)) },
                    comment: { commentingOn = $0 },
                    deleteComment: { comment in Task { await deleteComment(comment) } },
                    showOnMap: { showOnMap($0) }
                ),
                suggestions: suggestionsBanner
            )
            .refreshable { await refresh() }
        } else if let error {
            ContentUnavailableView("Trip unavailable", systemImage: "exclamationmark.triangle", description: Text(error))
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// The timeline scrolled to another step: the map shows where it was.
    private func followTimeline(to id: String?) {
        guard let trip else { return }
        let step = trip.steps.first { TimelineItem.id(serverStep: $0.id) == id }
        if mapSelection != step?.id { mapSelection = step?.id }
        withAnimation(.smooth(duration: 0.9)) {
            camera = step.flatMap(TripMapView.camera(for:)) ?? TripMapView.overview(of: trip)
        }
    }

    /// A marker was tapped: the timeline scrolls to its step.
    private func followMap(to stepID: Int?) {
        guard let stepID else { return }
        let id = TimelineItem.id(serverStep: stepID)
        // Already there when the timeline itself caused the selection.
        guard focusedItem != id else { return }
        withAnimation { focusedItem = id }
        if isCompact && detent == Self.peek { detent = .medium }
    }

    private func showOnMap(_ step: Components.Schemas.Step) {
        focusedItem = TimelineItem.id(serverStep: step.id)
        mapSelection = step.id
        if isCompact { detent = Self.peek }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                if isAuthor {
                    Button("Edit trip", systemImage: "pencil") { editingTrip = true }
                    Button("Share trip …", systemImage: "square.and.arrow.up") { share(.trip) }
                    Button("Readers", systemImage: "person.2") { showingReaders = true }
                    Button("Photo suggestions", systemImage: "photo.stack") { Task { await reviewSuggestions() } }
                }
                Toggle(isOn: Binding(get: { !muted }, set: { setMuted(!$0) })) {
                    Label(isAuthor ? "Notify about comments" : "Notify about new steps", systemImage: "bell")
                }
                if !isAuthor {
                    Button("Stop following", systemImage: "person.badge.minus", role: .destructive) {
                        confirmingUnfollow = true
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityLabel(Text("More"))
        }
        if !isCompact {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    withAnimation { showingTimeline.toggle() }
                } label: {
                    Image(systemName: "sidebar.trailing")
                }
                .accessibilityLabel(Text("Timeline"))
            }
        }
        if isAuthor {
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    composer = .new(tripID: tripID)
                } label: {
                    Image(systemName: "plus")
                        .foregroundStyle(.white)
                }
                .buttonStyle(.glassProminent)
                .accessibilityLabel(Text("New step"))
            }
        }
    }

    // MARK: Sheets and dialogs

    @ViewBuilder private func presentations(_ content: some View, active: Bool) -> some View {
        if active {
            content
                .sheet(item: Binding(
                    get: { composer.map(ComposerRequest.init) },
                    set: { composer = $0?.mode; if $0 == nil { composerAssets = [] } }
                )) { request in
                    StepComposerView(account: account, mode: request.mode, assets: composerAssets)
                }
                .sheet(item: $commentingOn) { step in
                    CommentComposer(account: account, step: step) { Task { await refresh() } }
                }
                .sheet(isPresented: $showingReaders) {
                    if let trip {
                        ReadersView(account: account, trip: trip.withoutSteps) { share in
                            self.trip?.share = share
                        }
                    }
                }
                .confirmationDialog("Stop following this trip?", isPresented: $confirmingUnfollow, titleVisibility: .visible) {
                    Button("Stop following", role: .destructive) {
                        Task { await model.unfollow(account) }
                    }
                }
                .sheet(isPresented: $showingSuggestions) {
                    PhotoSuggestionsView(assets: suggestions, calendar: calendar) { chosen in
                        composerAssets = chosen
                        // After the suggestions sheet is gone.
                        Task { @MainActor in composer = .new(tripID: tripID) }
                    } ignore: { hidden in
                        try? model.uploads.ignoreAssets(hidden.map(\.localIdentifier), accountID: account.id)
                        Task { await updateSuggestions() }
                    }
                }
                .confirmationDialog(
                    "Sharing is off for this trip",
                    isPresented: Binding(get: { enableSharingFor != nil }, set: { if !$0 { enableSharingFor = nil } }),
                    titleVisibility: .visible,
                    presenting: enableSharingFor
                ) { target in
                    Button("Turn on sharing and share") { Task { await enableSharing(then: target) } }
                } message: { _ in
                    Text("Anyone with the link can then read the trip.")
                }
                .alert("No access to your photos", isPresented: $photoAccessDenied) {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("To suggest photos from this trip, OwnSteps needs to read your photo library.")
                }
                .sheet(item: $editing) { step in
                    EditStepView(account: account, step: step) { Task { await refresh() } }
                }
                .sheet(isPresented: $editingTrip) {
                    if let trip {
                        TripFormView(account: account, trip: trip.withoutSteps, calendar: calendar) { _ in
                            Task { await refresh() }
                        }
                    }
                }
        } else {
            content
        }
    }

    /// The card above the timeline, unless dismissed for these photos.
    private var suggestionsBanner: SuggestionsBanner? {
        guard let newest = suggestions.last?.creationDate else { return nil }
        if let dismissed = suggestionsDismissedUntil, newest <= dismissed { return nil }
        return SuggestionsBanner(count: suggestions.count) {
            showingSuggestions = true
        } dismiss: {
            LibrarySuggestions.dismiss(suggestions, account: account, tripID: tripID)
            suggestionsDismissedUntil = LibrarySuggestions.dismissedUntil(account: account, tripID: tripID)
        }
    }

    private func setMuted(_ value: Bool) {
        muted = value
        Notifications.setMuted(value, account: account, tripID: tripID)
        if !value { Task { await Notifications.requestPermission() } }
    }

    private func deleteComment(_ comment: Components.Schemas.Comment) async {
        do {
            try await model.client(for: account).deleteComment(id: comment.id)
            await refresh()
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    /// Without photo access nothing is asked here – only the menu asks.
    private func updateSuggestions() async {
        guard isAuthor, let trip else { return }
        suggestionsDismissedUntil = LibrarySuggestions.dismissedUntil(account: account, tripID: tripID)
        suggestions = await LibrarySuggestions.find(for: trip, account: account, calendar: calendar, uploads: model.uploads)
    }

    private func reviewSuggestions() async {
        guard await LibrarySuggestions.requestAccess() else {
            photoAccessDenied = true
            return
        }
        await updateSuggestions()
        showingSuggestions = true
    }

    private func share(_ target: ShareTarget) {
        if let url = target.url(in: trip?.share) {
            ShareSheet.present(url)
        } else {
            enableSharingFor = target
        }
    }

    private func enableSharing(then target: ShareTarget) async {
        do {
            let updated = try await model.client(for: account).updateTrip(id: tripID, .init(shareEnabled: true))
            trip?.share = updated.share
            if let url = target.url(in: updated.share) { ShareSheet.present(url) }
            await refresh()
        } catch {
            self.error = ErrorText.message(for: error)
        }
    }

    /// Follows the upload queue; whenever something finished, the server's
    /// copy is fetched again so the new photos show up.
    private func watchQueue() async {
        var pending = Set<String>()
        do {
            for try await snapshot in model.uploads.observe(accountID: account.id, tripID: tripID) {
                let now = Set(snapshot.localSteps.map(\.id))
                    .union(snapshot.uploadsByStepID.values.flatMap { $0.map(\.id) })
                    .union(snapshot.localSteps.flatMap { $0.uploads.map(\.id) })
                let finished = !pending.subtracting(now).isEmpty
                    || snapshot.localSteps.count < queue.localSteps.count
                queue = snapshot
                pending = now
                if finished { await refresh() }
            }
        } catch {
            // The observation only ends with the view.
        }
    }

    /// Loads what the timeline shows, so the trip stays readable offline
    /// ([D22]). Files already on the device cost nothing.
    private func prefetch(_ trip: Components.Schemas.TripDetail) {
        let client = model.client(for: account)
        let media = model.media
        let accountID = account.id
        let wanted = trip.steps.flatMap { step in
            step.photos.prefix(4).map { ($0.id, $0.fileKey, step.photos.count == 1 ? MediaVariant.medium : .thumb) }
        }
        Task.detached(priority: .utility) {
            for (photoID, fileKey, variant) in wanted {
                _ = try? await media.data(
                    accountID: accountID,
                    photoID: photoID,
                    fileKey: fileKey,
                    variant: variant,
                    request: client.mediaRequest(photoID: photoID, variant: variant)
                )
            }
        }
    }

    private func refresh() async {
        do {
            let fresh = try await model.client(for: account).trip(id: tripID)
            trip = fresh
            staleSince = nil
            error = nil
            try? model.cache.saveTrip(fresh, for: account.id)
            prefetch(fresh)
            await updateSuggestions()
        } catch let api as APIError where api.isUnauthorized {
            model.signedOutByServer(account)
        } catch let api as APIError where api.code == "trip_not_found" {
            // Deleted on the server: don't keep showing a ghost.
            try? model.cache.removeTrip(tripID, for: account.id)
            trip = nil
            error = ErrorText.message(for: api)
        } catch {
            if trip == nil {
                self.error = ErrorText.message(for: error)
            } else if let cached = try? model.cache.trip(tripID, for: account.id) {
                staleSince = cached.fetchedAt
            }
        }
    }
}

/// Newest step on top – only the display is reversed, the data stays
/// chronological for day counting and the route ([E13]).
struct TimelineView: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?
    let queue: UploadSnapshot
    @Binding var focusedItem: String?
    let actions: StepActions
    var suggestions: SuggestionsBanner?

    /// One fullscreen viewer for the whole timeline. With one per row,
    /// List's cell reuse presented another step's photos.
    @State private var viewer: ViewerRequest?
    @Namespace private var photoTransition

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        let items = items(start: start)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                TripHeader(trip: trip, calendar: calendar, staleSince: staleSince)
                    .padding(.horizontal, 20)
                    .padding(.top, 22)
                    .padding(.bottom, 20)
                    .id(TimelineItem.headerID)

                if let suggestions {
                    SuggestionsCard(count: suggestions.count, review: suggestions.review, dismiss: suggestions.dismiss)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                }

                if items.isEmpty {
                    ContentUnavailableView(
                        "No steps yet",
                        systemImage: "mappin.slash",
                        description: Text("Steps appear here once the trip gets going.")
                    )
                    .padding(.vertical, 24)
                }

                ForEach(items) { item in
                    VStack(alignment: .leading, spacing: 0) {
                        Divider()
                        Group {
                            switch item.kind {
                            case .server(let step):
                                StepCard(
                                    account: account,
                                    step: step,
                                    day: item.day,
                                    calendar: calendar,
                                    pending: queue.uploadsByStepID[step.id] ?? [],
                                    actions: actions,
                                    photoTransition: photoTransition
                                ) { index in
                                    viewer = ViewerRequest(stepID: step.id, index: index)
                                }
                            case .local(let local):
                                LocalStepCard(account: account, local: local, day: item.day, calendar: calendar)
                            }
                        }
                        .padding(.vertical, 20)
                    }
                    .padding(.horizontal, 20)
                    .id(item.id)
                }
            }
            .scrollTargetLayout()
            .padding(.bottom, 24)
        }
        .scrollPosition(id: $focusedItem, anchor: .top)
        .fullScreenCover(item: $viewer) { request in
            if let step = trip.steps.first(where: { $0.id == request.stepID }) {
                PhotoViewer(account: account, photos: step.photos, startIndex: request.index)
                    .navigationTransition(.zoom(sourceID: request.id, in: photoTransition))
            }
        }
    }

    /// Server steps and steps still on the device, newest first ([E13]).
    private func items(start: Date?) -> [TimelineItem] {
        // A step the server already has must not show up twice.
        let known = Set(trip.steps.compactMap(\.clientUuid))
        let local = queue.localSteps.filter { !known.contains($0.step.clientUUID) }
        let all = trip.steps.map { TimelineItem(kind: .server($0), date: $0.occurredAt) }
            + local.map { TimelineItem(kind: .local($0), date: $0.step.occurredAt) }
        return all
            .map { item in
                var item = item
                item.day = start.map { calendar.tripDay(of: item.date, start: $0) }
                return item
            }
            .sorted { $0.date > $1.date }
    }
}

/// Title, dates and the trip in numbers – what the sheet shows when it's low.
struct TripHeader: View {
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.firstStepAt)
        let end = calendar.date(fromCalendarDay: trip.endDate) ?? trip.lastStepAt
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(trip.title)
                    .font(.title.bold())
                if let range = TripDates.range(start: start, end: end, calendar: calendar) {
                    Text(range)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .top, spacing: 0) {
                if let start, let end {
                    TripStat(label: "Days", value: max(calendar.tripDay(of: end, start: start), 1))
                }
                TripStat(label: "Steps", value: trip.stepCount)
                TripStat(label: "Photos", value: trip.photoCount)
            }

            if let summary = trip.summary, !summary.isEmpty {
                Text(summary)
                    .font(.callout)
            }
            if let staleSince {
                OfflineNote(fetchedAt: staleSince)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TripStat: View {
    let label: LocalizedStringKey
    let value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Text(value, format: .number)
                .font(.title2.bold())
                .fontDesign(.rounded)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StepCard: View {
    let account: Account
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar
    var pending: [PendingUpload] = []
    let actions: StepActions
    let photoTransition: Namespace.ID
    let openPhoto: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            StepHeader(
                day: day,
                date: step.occurredAt,
                calendar: calendar,
                place: step.placeName,
                showOnMap: step.lat != nil && step.lon != nil ? { actions.showOnMap(step) } : nil
            ) {
                if actions.isAuthor {
                    Button("Edit", systemImage: "pencil") { actions.edit(step) }
                    Button("Add photos", systemImage: "photo.badge.plus") { actions.addPhotos(step) }
                    Button("Share …", systemImage: "square.and.arrow.up") { actions.share(step) }
                }
                Button("Comment", systemImage: "text.bubble") { actions.comment(step) }
            }

            if !step.photos.isEmpty {
                PhotoGrid(account: account, stepID: step.id, photos: step.photos, transition: photoTransition, open: openPhoto)
            }

            if !pending.isEmpty {
                PendingUploadsView(uploads: pending)
            }

            if !step.body.isEmpty {
                Text(step.body)
                    .font(.body)
                    .lineSpacing(2)
            }

            if !step.comments.isEmpty {
                CommentList(
                    comments: step.comments,
                    calendar: calendar,
                    delete: actions.isAuthor ? actions.deleteComment : nil
                )
            }

            HStack(spacing: 22) {
                Button { actions.comment(step) } label: {
                    Label("Comment", systemImage: "bubble.left")
                }
                if actions.isAuthor {
                    Button { actions.share(step) } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .buttonStyle(.borderless)
        }
    }
}

/// Day, date, place and the step's menu – the same for steps on the server
/// and steps still on the device.
struct StepHeader<MenuItems: View>: View {
    let day: Int?
    let date: Date
    let calendar: TripCalendar
    var place: String?
    /// Set when the step has a position.
    var showOnMap: (() -> Void)?
    @ViewBuilder let menu: () -> MenuItems

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if let day {
                        Text("Day \(day)")
                            .foregroundStyle(.tint)
                        Text("·")
                    }
                    Text(date.formatted(
                        Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide)
                    ))
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

                if let place {
                    if let showOnMap {
                        Button(action: showOnMap) {
                            Text(place)
                                .multilineTextAlignment(.leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(Text("Show on map"))
                    } else {
                        Text(place)
                    }
                }
            }
            .font(.title3.bold())
            Spacer(minLength: 0)
            Menu {
                menu()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Step options"))
        }
    }
}

struct StepActions {
    /// Readers only get to comment.
    let isAuthor: Bool
    let edit: (Components.Schemas.Step) -> Void
    let addPhotos: (Components.Schemas.Step) -> Void
    let share: (Components.Schemas.Step) -> Void
    let comment: (Components.Schemas.Step) -> Void
    let deleteComment: (Components.Schemas.Comment) -> Void
    let showOnMap: (Components.Schemas.Step) -> Void
}

struct SuggestionsBanner {
    let count: Int
    let review: () -> Void
    let dismiss: () -> Void
}

struct ComposerRequest: Identifiable {
    let mode: StepComposerView.Mode
    var id: String { "\(mode)" }
}

struct TimelineItem: Identifiable {
    enum Kind {
        case server(Components.Schemas.Step)
        case local(UploadSnapshot.LocalStep)
    }

    let kind: Kind
    let date: Date
    var day: Int?

    /// Doubles as the scroll position, which the map follows.
    var id: String {
        switch kind {
        case .server(let step): Self.id(serverStep: step.id)
        case .local(let local): "local-\(local.id)"
        }
    }

    static func id(serverStep: Int) -> String { "server-\(serverStep)" }
    static let headerID = "header"
}

struct ViewerRequest: Identifiable {
    let stepID: Int
    let index: Int
    var id: String { PhotoGrid.transitionID(stepID: stepID, index: index) }
}

/// One photo full width; two side by side; three as one large and two
/// small; more as a large one over a row of three, the last with "+n".
struct PhotoGrid: View {
    let account: Account
    let stepID: Int
    let photos: [Components.Schemas.Photo]
    let transition: Namespace.ID
    let open: (Int) -> Void

    private let gap: CGFloat = 3

    static func transitionID(stepID: Int, index: Int) -> String { "\(stepID)-\(index)" }

    var body: some View {
        Group {
            switch photos.count {
            case 1:
                let photo = photos[0]
                // Portraits are cropped to 4:5, so one photo can't fill the screen.
                let ratio = max(CGFloat(photo.width) / CGFloat(max(photo.height, 1)), 0.8)
                tile(0, variant: .medium)
                    .aspectRatio(ratio, contentMode: .fit)
            case 2:
                HStack(spacing: gap) {
                    tile(0)
                    tile(1)
                }
                .aspectRatio(3 / 2, contentMode: .fit)
            case 3:
                HStack(spacing: gap) {
                    tile(0, variant: .medium)
                    VStack(spacing: gap) {
                        tile(1)
                        tile(2)
                    }
                }
                .aspectRatio(4 / 3, contentMode: .fit)
            default:
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        GeometryReader { geometry in
                            VStack(spacing: gap) {
                                tile(0, variant: .medium)
                                    .frame(height: geometry.size.height * 0.62)
                                HStack(spacing: gap) {
                                    tile(1)
                                    tile(2)
                                    tile(3, more: photos.count - 4)
                                }
                            }
                        }
                    }
            }
        }
        .clipShape(.rect(cornerRadius: 18))
    }

    private func tile(_ index: Int, variant: MediaVariant = .thumb, more: Int = 0) -> some View {
        let photo = photos[index]
        return Button { open(index) } label: {
            Color.clear
                .overlay { RemoteImage(account: account, photo: photo, variant: variant) }
                .clipped()
                .overlay {
                    if more > 0 {
                        ZStack {
                            Color.black.opacity(0.45)
                            Text("+\(more)").font(.title2.bold()).foregroundStyle(.white)
                        }
                    } else if photo.mediaType == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.largeTitle)
                            .foregroundStyle(.white, .black.opacity(0.4))
                    }
                }
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .matchedTransitionSource(id: Self.transitionID(stepID: stepID, index: index), in: transition)
        .accessibilityLabel(Text(photo.caption ?? String(localized: "Photo \(index + 1)")))
    }
}

struct CommentList: View {
    let comments: [Components.Schemas.Comment]
    let calendar: TripCalendar
    /// Authors may delete comments ([D21]).
    var delete: ((Components.Schemas.Comment) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(comments, id: \.id) { comment in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(comment.authorName).font(.subheadline.bold())
                        Text(comment.createdAt.formatted(
                            Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone)
                        ))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Text(comment.body).font(.subheadline)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.fill.tertiary, in: .rect(cornerRadius: 16))
                .contentShape(.contextMenuPreview, .rect(cornerRadius: 16))
                .contextMenu {
                    if let delete {
                        Button("Delete comment", systemImage: "trash", role: .destructive) { delete(comment) }
                    }
                }
            }
        }
    }
}

extension Components.Schemas.Step: @retroactive Identifiable {}
