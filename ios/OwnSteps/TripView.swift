import OwnStepsKit
import Photos
import SwiftUI

/// One trip: timeline or map, like the web's phone layout. Shows the cached
/// copy first and refreshes behind it.
struct TripView: View {
    let account: Account
    let tripID: Int
    /// Scrolled to on arrival, e.g. from a notification.
    var focusStepID: Int? = nil

    enum Mode: Hashable { case timeline, map }

    @Environment(AppModel.self) private var model
    @State private var trip: Components.Schemas.TripDetail?
    @State private var staleSince: Date?
    @State private var error: String?
    @State private var mode: Mode = .timeline
    @State private var scrollTarget: Int?
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

    var body: some View {
        Group {
            if let trip {
                switch mode {
                case .timeline:
                    TimelineView(
                        account: account,
                        trip: trip,
                        calendar: calendar,
                        staleSince: staleSince,
                        queue: queue,
                        scrollTarget: $scrollTarget,
                        actions: .init(
                            isAuthor: isAuthor,
                            edit: { editing = $0 },
                            addPhotos: { composer = .addTo(tripID: tripID, stepID: $0.id) },
                            share: { share(.step($0.id)) },
                            comment: { commentingOn = $0 },
                            deleteComment: { comment in Task { await deleteComment(comment) } }
                        ),
                        suggestions: suggestionsBanner
                    )
                case .map:
                    TripMapView(account: account, trip: trip, calendar: calendar) { stepID in
                        scrollTarget = stepID
                        mode = .timeline
                    }
                }
            } else if let error {
                ContentUnavailableView("Trip unavailable", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(trip?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("View", selection: $mode) {
                    Text("Timeline").tag(Mode.timeline)
                    Text("Map").tag(Mode.map)
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
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
                if isAuthor {
                    Button {
                        composer = .new(tripID: tripID)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(Text("New step"))
                }
            }
        }
        .refreshable { await refresh() }
        .task {
            muted = Notifications.isMuted(account: account, tripID: tripID)
            if trip == nil, let cached = try? model.cache.trip(tripID, for: account.id) {
                trip = cached.value
            }
            scrollTarget = focusStepID
            await refresh()
        }
        .task(id: tripID) { await watchQueue() }
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
                ReadersView(account: account, trip: summary(of: trip)) { share in
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
                updateSuggestions()
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
                TripFormView(account: account, trip: summary(of: trip), calendar: calendar) { _ in
                    Task { await refresh() }
                }
            }
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
    private func updateSuggestions() {
        guard isAuthor, let trip else { return }
        suggestionsDismissedUntil = LibrarySuggestions.dismissedUntil(account: account, tripID: tripID)
        suggestions = LibrarySuggestions.find(for: trip, account: account, calendar: calendar, uploads: model.uploads)
    }

    private func reviewSuggestions() async {
        guard await LibrarySuggestions.requestAccess() else {
            photoAccessDenied = true
            return
        }
        updateSuggestions()
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

    private func summary(of trip: Components.Schemas.TripDetail) -> Components.Schemas.Trip {
        .init(
            id: trip.id, title: trip.title, summary: trip.summary, startDate: trip.startDate,
            endDate: trip.endDate, coverPhotoId: trip.coverPhotoId, stepCount: trip.stepCount,
            photoCount: trip.photoCount, firstStepAt: trip.firstStepAt, lastStepAt: trip.lastStepAt,
            updatedAt: trip.updatedAt, share: trip.share
        )
    }

    /// Loads what the timeline shows, so the trip stays readable offline
    /// ([D22]). Files already on the device cost nothing.
    private func prefetch(_ trip: Components.Schemas.TripDetail) {
        let client = model.client(for: account)
        let media = model.media
        let accountID = account.id
        let wanted = trip.steps.flatMap { step in
            step.photos.prefix(4).map { ($0.id, step.photos.count == 1 ? MediaVariant.medium : .thumb) }
        }
        Task.detached(priority: .utility) {
            for (photoID, variant) in wanted {
                _ = try? await media.data(
                    accountID: accountID,
                    photoID: photoID,
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
            updateSuggestions()
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
    @Binding var scrollTarget: Int?
    let actions: StepActions
    var suggestions: SuggestionsBanner?

    /// One fullscreen viewer for the whole timeline. With one per row,
    /// List's cell reuse presented another step's photos.
    @State private var viewer: ViewerRequest?

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        ScrollViewReader { proxy in
            List {
                Section {
                    TripHeader(trip: trip, calendar: calendar)
                } footer: {
                    if let staleSince { OfflineNote(fetchedAt: staleSince) }
                }

                if let suggestions {
                    Section {
                        SuggestionsCard(count: suggestions.count, review: suggestions.review, dismiss: suggestions.dismiss)
                    }
                }

                if trip.steps.isEmpty && queue.localSteps.isEmpty {
                    ContentUnavailableView(
                        "No steps yet",
                        systemImage: "mappin.slash",
                        description: Text("Steps appear here once the trip gets going.")
                    )
                    .listRowBackground(Color.clear)
                }

                ForEach(items(start: start)) { item in
                    Section {
                        switch item.kind {
                        case .server(let step):
                            StepCard(
                                account: account,
                                step: step,
                                day: item.day,
                                calendar: calendar,
                                pending: queue.uploadsByStepID[step.id] ?? [],
                                actions: actions
                            ) { index in
                                viewer = ViewerRequest(stepID: step.id, index: index)
                            }
                        case .local(let local):
                            LocalStepCard(account: account, local: local, day: item.day, calendar: calendar)
                        }
                    }
                    .id(item.scrollID)
                }
            }
            .listSectionSpacing(.compact)
            .onAppear { scroll(proxy) }
            .onChange(of: scrollTarget) { scroll(proxy) }
            .fullScreenCover(item: $viewer) { request in
                if let step = trip.steps.first(where: { $0.id == request.stepID }) {
                    PhotoViewer(account: account, photos: step.photos, startIndex: request.index)
                }
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

    private func scroll(_ proxy: ScrollViewProxy) {
        guard let target = scrollTarget else { return }
        withAnimation { proxy.scrollTo(target, anchor: .top) }
        scrollTarget = nil
    }
}

struct TripHeader: View {
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(trip.title).font(.title2.bold())
            HStack(spacing: 6) {
                if let range = TripDates.range(
                    start: calendar.date(fromCalendarDay: trip.startDate) ?? trip.firstStepAt,
                    end: calendar.date(fromCalendarDay: trip.endDate) ?? trip.lastStepAt,
                    calendar: calendar
                ) {
                    Text(range)
                    Text("·")
                }
                Text("\(trip.stepCount) steps")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            if let summary = trip.summary, !summary.isEmpty {
                Text(summary).font(.callout)
            }
        }
        .padding(.vertical, 4)
    }
}

struct StepCard: View {
    let account: Account
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar
    var pending: [PendingUpload] = []
    var actions: StepActions?
    let openPhoto: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let day {
                    Text("Day \(day)")
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.tint.opacity(0.15), in: .capsule)
                        .foregroundStyle(.tint)
                }
                Text(step.occurredAt.formatted(
                    Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide)
                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                Spacer()
                if let actions {
                    Menu {
                        if actions.isAuthor {
                            Button("Edit", systemImage: "pencil") { actions.edit(step) }
                            Button("Add photos", systemImage: "photo.badge.plus") { actions.addPhotos(step) }
                            Button("Share …", systemImage: "square.and.arrow.up") { actions.share(step) }
                        }
                        Button("Comment", systemImage: "text.bubble") { actions.comment(step) }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 32, minHeight: 32)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("Step options"))
                }
            }

            if let place = step.placeName {
                Label(place, systemImage: "mappin")
                    .font(.headline)
                    .labelStyle(.titleAndIcon)
            }

            if !step.photos.isEmpty {
                PhotoGrid(account: account, photos: step.photos, open: openPhoto)
            }

            if !pending.isEmpty {
                PendingUploadsView(uploads: pending)
            }

            if !step.body.isEmpty {
                Text(step.body).font(.body)
            }

            if !step.comments.isEmpty {
                CommentList(
                    comments: step.comments,
                    calendar: calendar,
                    delete: actions?.isAuthor == true ? actions?.deleteComment : nil
                )
            }
        }
        .padding(.vertical, 6)
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

    var id: String {
        switch kind {
        case .server(let step): "server-\(step.id)"
        case .local(let local): "local-\(local.id)"
        }
    }

    /// Server steps scroll by their ID (map → timeline).
    var scrollID: AnyHashable {
        switch kind {
        case .server(let step): AnyHashable(step.id)
        case .local(let local): AnyHashable(local.id)
        }
    }
}

struct ViewerRequest: Identifiable {
    let stepID: Int
    let index: Int
    var id: String { "\(stepID)-\(index)" }
}

/// One photo full width, several as a grid; more than four end in "+n".
struct PhotoGrid: View {
    let account: Account
    let photos: [Components.Schemas.Photo]
    let open: (Int) -> Void

    var body: some View {
        let visible = Array(photos.prefix(4))
        let hidden = photos.count - visible.count
        if photos.count == 1 {
            tile(photos[0], index: 0, variant: .medium)
                .aspectRatio(CGFloat(photos[0].width) / CGFloat(max(photos[0].height, 1)), contentMode: .fit)
                .frame(maxHeight: 420)
                .clipShape(.rect(cornerRadius: 14))
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)], spacing: 4) {
                ForEach(Array(visible.enumerated()), id: \.element.id) { index, photo in
                    tile(photo, index: index, variant: .thumb)
                        .aspectRatio(1, contentMode: .fit)
                        .overlay {
                            if hidden > 0 && index == visible.count - 1 {
                                ZStack {
                                    Color.black.opacity(0.45)
                                    Text("+\(hidden)").font(.title2.bold()).foregroundStyle(.white)
                                }
                                // Lets the tap through to the tile's button.
                                .allowsHitTesting(false)
                            }
                        }
                }
            }
            .clipShape(.rect(cornerRadius: 14))
        }
    }

    private func tile(_ photo: Components.Schemas.Photo, index: Int, variant: MediaVariant) -> some View {
        Button { open(index) } label: {
            Color.clear
                .overlay { RemoteImage(account: account, photo: photo, variant: variant) }
                .clipped()
                .overlay {
                    if photo.mediaType == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.largeTitle)
                            .foregroundStyle(.white, .black.opacity(0.4))
                    }
                }
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
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
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(comment.authorName).font(.footnote.bold())
                        Text(comment.createdAt.formatted(
                            Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone)
                        ))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                    Text(comment.body).font(.callout)
                }
                .contextMenu {
                    if let delete {
                        Button("Delete comment", systemImage: "trash", role: .destructive) { delete(comment) }
                    }
                }
            }
        }
        .padding(.top, 6)
        .overlay(alignment: .top) { Divider().offset(y: -4) }
    }
}

extension Components.Schemas.Step: @retroactive Identifiable {}
