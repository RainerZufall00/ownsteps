import OwnStepsKit
import SwiftUI

/// One trip: timeline or map, like the web's phone layout. Shows the cached
/// copy first and refreshes behind it.
struct TripView: View {
    let account: Account
    let tripID: Int

    enum Mode: Hashable { case timeline, map }

    @Environment(AppModel.self) private var model
    @State private var trip: Components.Schemas.TripDetail?
    @State private var staleSince: Date?
    @State private var error: String?
    @State private var mode: Mode = .timeline
    @State private var scrollTarget: Int?

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
                        scrollTarget: $scrollTarget
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
        }
        .refreshable { await refresh() }
        .task {
            if trip == nil, let cached = try? model.cache.trip(tripID, for: account.id) {
                trip = cached.value
            }
            await refresh()
        }
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
    @Binding var scrollTarget: Int?

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

                if trip.steps.isEmpty {
                    ContentUnavailableView(
                        "No steps yet",
                        systemImage: "mappin.slash",
                        description: Text("Steps appear here once the trip gets going.")
                    )
                    .listRowBackground(Color.clear)
                }

                ForEach(trip.steps.reversed(), id: \.id) { step in
                    Section {
                        StepCard(
                            account: account,
                            step: step,
                            day: start.map { calendar.tripDay(of: step.occurredAt, start: $0) },
                            calendar: calendar
                        ) { index in
                            viewer = ViewerRequest(stepID: step.id, index: index)
                        }
                    }
                    .id(step.id)
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
            }

            if let place = step.placeName {
                Label(place, systemImage: "mappin")
                    .font(.headline)
                    .labelStyle(.titleAndIcon)
            }

            if !step.photos.isEmpty {
                PhotoGrid(account: account, photos: step.photos, open: openPhoto)
            }

            if !step.body.isEmpty {
                Text(step.body).font(.body)
            }

            if !step.comments.isEmpty {
                CommentList(comments: step.comments, calendar: calendar)
            }
        }
        .padding(.vertical, 6)
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
            }
        }
        .padding(.top, 6)
        .overlay(alignment: .top) { Divider().offset(y: -4) }
    }
}
