import MapKit
import OwnStepsKit
import Photos
import SwiftUI

/// One trip, laid out like Polarsteps: the route on a map that fills the
/// screen, the steps as glass cards side by side below it. Swiping the cards
/// moves the map along; a tapped marker brings its card; a tapped card
/// pushes the step's page, where swiping sideways goes on to the next one.
/// Shows the cached copy first and refreshes behind it.
struct TripView: View {
    let account: Account
    let tripID: Int
    /// Opened at this step, e.g. from a notification.
    var focusStepID: Int? = nil

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State private var trip: Components.Schemas.TripDetail?
    @State private var staleSince: Date?
    @State private var error: String?
    /// The card in the pager – the map follows it.
    @State private var focusedItem: String?
    @State private var mapSelection: Int?
    @State private var camera: MapCameraPosition = .automatic
    /// The step page pushed from the pager …
    @State private var detail: StepDetailRequest?
    /// … and the step it shows now, after paging sideways.
    @State private var openStepID: Int?
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
    @State private var confirmingDelete = false
    /// The trip's name, typed to confirm deleting it – like on the web.
    @State private var deleteConfirmation = ""
    /// Something the user did failed while the trip is on screen.
    @State private var actionError: String?
    /// Steps this reader's views were already reported for.
    @State private var reportedViews: Set<Int> = []

    /// Readers follow one trip and only read and comment ([D17]).
    private var isAuthor: Bool { account.kind == .author }

    private var calendar: TripCalendar { model.calendar(for: account) }

    var body: some View {
        // While a step page is open, sheets and dialogs are presented from
        // there – the map below it can't present anything.
        presentations(mapLayer, active: detail == nil)
            .toolbar { toolbar }
            .navigationTitle(trip?.title ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $detail) { request in
                presentations(stepDetail(request), active: true)
            }
            .onChange(of: focusedItem) { _, id in followPager(to: id) }
            // The first copy of the trip – cached or fresh – frames the route.
            .onChange(of: trip == nil, initial: true) { _, missing in
                if !missing, let trip, focusedItem == nil { camera = TripMapView.overview(of: trip) }
            }
            .onChange(of: mapSelection) { _, id in followMap(to: id) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refresh() } }
            }
            .task(id: shownStepID) { await reportView(of: shownStepID) }
            .task {
                muted = Notifications.isMuted(account: account, tripID: tripID)
                if trip == nil, let cached = try? model.cache.trip(tripID, for: account.id) {
                    trip = cached.value
                }
                if let focusStepID {
                    focusedItem = TimelineItem.id(serverStep: focusStepID)
                }
                await refresh()
            }
            .task(id: tripID) { await watchQueue() }
    }

    // MARK: Map and pager

    private var mapLayer: some View {
        ZStack(alignment: .bottom) {
            Group {
                if let trip {
                    TripMapView(account: account, trip: trip, selection: $mapSelection, position: $camera)
                } else {
                    Map(interactionModes: []).mapStyle(.hybrid)
                }
            }
            // Frames the route in what the cards leave free, and keeps the
            // map's controls above them.
            .safeAreaPadding(.bottom, StepPager.height + 8)
            // Room for the overview bar, so the route isn't framed under it.
            .safeAreaPadding(.top, trip?.steps.isEmpty == false ? 56 : 0)
            pager
        }
        .overlay(alignment: .topLeading) {
            if let trip, !trip.steps.isEmpty {
                TripOverviewBar(account: account, trip: trip, calendar: calendar, staleSince: staleSince) {
                    showWholeTrip()
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
        }
    }

    /// Back to the overview: the whole route, no step picked.
    private func showWholeTrip() {
        guard let trip else { return }
        mapSelection = nil
        focusedItem = nil
        withAnimation(.smooth(duration: 0.9)) { camera = TripMapView.overview(of: trip) }
    }

    @ViewBuilder private var pager: some View {
        if let trip {
            VStack(spacing: 10) {
                if let banner = suggestionsBanner {
                    SuggestionsCard(count: banner.count, review: banner.review, dismiss: banner.dismiss)
                        .padding(14)
                        .frame(maxWidth: 440, alignment: .leading)
                        .glassEffect(.regular, in: .rect(cornerRadius: StepPager.cornerRadius))
                        .padding(.horizontal, 16)
                }
                StepPager(
                    account: account,
                    trip: trip,
                    calendar: calendar,
                    staleSince: staleSince,
                    queue: queue,
                    showViews: isAuthor,
                    focusedItem: $focusedItem
                ) { stepID in
                    openStepID = stepID
                    detail = StepDetailRequest(stepID: stepID)
                }
            }
            .padding(.bottom, 8)
        } else if let error {
            ContentUnavailableView("Trip unavailable", systemImage: "exclamationmark.triangle", description: Text(error))
                .frame(maxHeight: StepPager.height)
                .glassEffect(.regular, in: .rect(cornerRadius: StepPager.cornerRadius))
                .padding(16)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .frame(height: StepPager.height)
        }
    }

    private func stepDetail(_ request: StepDetailRequest) -> some View {
        Group {
            if let trip {
                StepDetailPager(
                    account: account,
                    trip: trip,
                    calendar: calendar,
                    queue: queue,
                    actions: actions,
                    showViews: isAuthor,
                    stepID: Binding(
                        get: { openStepID ?? request.stepID },
                        set: { id in
                            openStepID = id
                            // Going back leaves the pager and the map at this step.
                            focusedItem = TimelineItem.id(serverStep: id)
                        }
                    ),
                    refresh: refresh
                )
            }
        }
    }

    private var actions: StepActions {
        StepActions(
            isAuthor: isAuthor,
            edit: { editing = $0 },
            addPhotos: { composer = .addTo(tripID: tripID, stepID: $0.id) },
            share: { share(.step($0.id)) },
            comment: { commentingOn = $0 },
            deleteComment: { comment in Task { await deleteComment(comment) } },
            showOnMap: { showOnMap($0) }
        )
    }

    /// The pager moved to another card: the map shows where it was.
    private func followPager(to id: String?) {
        guard let trip else { return }
        let step = trip.steps.first { TimelineItem.id(serverStep: $0.id) == id }
        if mapSelection != step?.id { mapSelection = step?.id }
        withAnimation(.smooth(duration: 0.9)) {
            camera = step.flatMap(TripMapView.camera(for:)) ?? TripMapView.overview(of: trip)
        }
    }

    /// A marker was tapped: the pager brings its card.
    private func followMap(to stepID: Int?) {
        guard let stepID else { return }
        let id = TimelineItem.id(serverStep: stepID)
        // Already there when the pager itself caused the selection.
        guard focusedItem != id else { return }
        withAnimation { focusedItem = id }
    }

    private func showOnMap(_ step: Components.Schemas.Step) {
        detail = nil
        focusedItem = TimelineItem.id(serverStep: step.id)
        mapSelection = step.id
    }

    /// The step a reader is looking at – on its page or in the pager.
    private var shownStepID: Int? {
        if detail != nil { return openStepID }
        guard let focusedItem, let trip else { return nil }
        return trip.steps.first { TimelineItem.id(serverStep: $0.id) == focusedItem }?.id
    }

    /// Tells the server a reader saw a step, so the authors see how often
    /// it was read. Paging past doesn't count – a second on it does. Authors
    /// aren't counted anyway, so their app doesn't ask.
    private func reportView(of stepID: Int?) async {
        guard !isAuthor, let stepID, !reportedViews.contains(stepID) else { return }
        try? await Task.sleep(for: .seconds(1))
        guard !Task.isCancelled else { return }
        do {
            try await model.client(for: account).recordViews(tripID: tripID, stepIDs: [stepID])
            reportedViews.insert(stepID)
        } catch {
            // Offline or an older server: the view just isn't counted.
        }
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
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await refresh() } }
                Toggle(isOn: Binding(get: { !muted }, set: { setMuted(!$0) })) {
                    Label(isAuthor ? "Notify about comments" : "Notify about new steps", systemImage: "bell")
                }
                if isAuthor {
                    Section {
                        Button("Delete trip …", systemImage: "trash", role: .destructive) {
                            deleteConfirmation = ""
                            confirmingDelete = true
                        }
                    }
                } else {
                    Button("Stop following", systemImage: "person.badge.minus", role: .destructive) {
                        confirmingUnfollow = true
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
            }
            .accessibilityLabel(Text("More"))
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

    /// Every sheet and dialog of the trip. Attached twice – to the map and to
    /// the full-screen step – but only the `active` copy gets the real
    /// bindings; the other sees nothing to present. Gating the bindings
    /// instead of the modifiers keeps the map's identity, so it isn't
    /// rebuilt whenever a step opens.
    private func presentations(_ content: some View, active: Bool) -> some View {
        content
            .sheet(item: gate(Binding(
                get: { composer.map(ComposerRequest.init) },
                set: { composer = $0?.mode; if $0 == nil { composerAssets = [] } }
            ), active)) { request in
                StepComposerView(account: account, mode: request.mode, assets: composerAssets)
            }
            .sheet(item: gate($commentingOn, active)) { step in
                CommentComposer(account: account, step: step) { Task { await refresh() } }
            }
            .sheet(isPresented: gate($showingReaders, active)) {
                if let trip {
                    ReadersView(account: account, trip: trip.withoutSteps) { share in
                        self.trip?.share = share
                    }
                }
            }
            .alert("Delete this trip?", isPresented: gate($confirmingDelete, active)) {
                TextField("Name of the trip", text: $deleteConfirmation)
                Button("Delete", role: .destructive) { Task { await deleteTrip() } }
                    .disabled(!deleteConfirmed)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All its steps, photos and comments will be gone for good. Type “\(trip?.title ?? "")” to confirm.")
            }
            .alert(
                "Something went wrong",
                isPresented: gate(Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } }), active)
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
            .confirmationDialog(
                "Stop following this trip?",
                isPresented: gate($confirmingUnfollow, active),
                titleVisibility: .visible
            ) {
                Button("Stop following", role: .destructive) {
                    Task { await model.unfollow(account) }
                }
            }
            .sheet(isPresented: gate($showingSuggestions, active)) {
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
                isPresented: gate(Binding(get: { enableSharingFor != nil }, set: { if !$0 { enableSharingFor = nil } }), active),
                titleVisibility: .visible,
                presenting: enableSharingFor
            ) { target in
                Button("Turn on sharing and share") { Task { await enableSharing(then: target) } }
            } message: { _ in
                Text("Anyone with the link can then read the trip.")
            }
            .alert("No access to your photos", isPresented: gate($photoAccessDenied, active)) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("To suggest photos from this trip, OwnSteps needs to read your photo library.")
            }
            .sheet(item: gate($editing, active)) { step in
                EditStepView(account: account, step: step) { Task { await refresh() } }
            }
            .sheet(isPresented: gate($editingTrip, active)) {
                if let trip {
                    TripFormView(account: account, trip: trip.withoutSteps, calendar: calendar) { _ in
                        // The trip list shows title, dates and cover too.
                        model.tripListRevision += 1
                        Task { await refresh() }
                    }
                }
            }
    }

    private func gate<Value>(_ binding: Binding<Value?>, _ active: Bool) -> Binding<Value?> {
        active ? binding : .constant(nil)
    }

    private func gate(_ binding: Binding<Bool>, _ active: Bool) -> Binding<Bool> {
        active ? binding : .constant(false)
    }

    /// The card above the steps, unless dismissed for these photos.
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
            actionError = ErrorText.message(for: error)
        }
    }

    private var deleteConfirmed: Bool {
        guard let trip else { return false }
        return deleteConfirmation.trimmingCharacters(in: .whitespaces) == trip.title.trimmingCharacters(in: .whitespaces)
    }

    /// Needs a connection, like every change to what the server has ([D19]).
    private func deleteTrip() async {
        guard deleteConfirmed else { return }
        do {
            try await model.client(for: account).deleteTrip(id: tripID)
            try? model.cache.removeTrip(tripID, for: account.id)
            await model.uploads.removeAll(for: account.id, tripID: tripID)
            model.tripListRevision += 1
            dismiss()
        } catch let api as APIError where api.isUnauthorized {
            model.signedOutByServer(account)
        } catch {
            actionError = ErrorText.message(for: error)
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
            actionError = ErrorText.message(for: error)
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

    /// Loads what the cards and steps show, so the trip stays readable
    /// offline ([D22]): the cover and every step's first photo in the
    /// card's size, the grid's thumbnails. Files already on the device cost
    /// nothing.
    private func prefetch(_ trip: Components.Schemas.TripDetail) {
        let client = model.client(for: account)
        let media = model.media
        let accountID = account.id
        var wanted: [(Int, String, MediaVariant)] = trip.cover.map { [($0.id, $0.fileKey, .medium)] } ?? []
        for step in trip.steps {
            guard let first = step.photos.first else { continue }
            wanted.append((first.id, first.fileKey, .medium))
            if step.photos.count > 1 {
                wanted += step.photos.prefix(4).map { ($0.id, $0.fileKey, .thumb) }
            }
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

/// A card in the pager: a step on the server or one still on the device.
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
    /// The trip's own card in front of the steps.
    static let coverID = "cover"

    /// Server steps and steps still on the device, oldest first – the
    /// pager runs left to right like the route ([E13]).
    static func items(
        of trip: Components.Schemas.TripDetail,
        queue: UploadSnapshot,
        calendar: TripCalendar
    ) -> [TimelineItem] {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
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
            .sorted { $0.date < $1.date }
    }
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

extension Components.Schemas.Step: @retroactive Identifiable {}
