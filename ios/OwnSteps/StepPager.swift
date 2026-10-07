import OwnStepsKit
import SwiftUI
import UIKit

/// The trip's steps as cards side by side under the map, like Polarsteps:
/// swiping moves to the previous or next step and the map follows. Oldest
/// on the left, so the route reads left to right; it opens on the newest,
/// which is what readers come back for ([E13] – only the display differs,
/// the data stays chronological). The trip itself isn't a card – it reads
/// like one more day – but the `TripOverviewBar` above the map; only a trip
/// without steps shows its cover card here. The cards are solid with a soft
/// shadow, like the place cards of Apple's Maps: as glass they took on the
/// map's colors and were hard to read. Glass stays for the small controls.
struct StepPager: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?
    let queue: UploadSnapshot
    /// Authors see how many readers saw each step.
    let showViews: Bool
    /// The card in view – the map follows it.
    @Binding var focusedItem: String?
    let open: (Int) -> Void

    static let height: CGFloat = 228
    static let cornerRadius: CGFloat = 30
    /// Photos inside a card keep the same distance to every edge, so their
    /// corners run parallel to the card's.
    static let inset: CGFloat = 8

    var body: some View {
        let items = TimelineItem.items(of: trip, queue: queue, calendar: calendar)
        ScrollView(.horizontal) {
            LazyHStack(spacing: 10) {
                if items.isEmpty {
                    TripCoverCard(account: account, trip: trip, calendar: calendar, staleSince: staleSince)
                        .pagerCard()
                        .id(TimelineItem.coverID)
                }

                ForEach(items) { item in
                    Group {
                        switch item.kind {
                        case .server(let step):
                            Button { open(step.id) } label: {
                                StepPreviewCard(
                                    account: account,
                                    step: step,
                                    day: item.day,
                                    calendar: calendar,
                                    pendingCount: queue.uploadsByStepID[step.id]?.count ?? 0,
                                    viewCount: showViews ? step.viewCount : nil
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(Text("Opens the step"))
                        case .local(let local):
                            LocalStepCard(account: account, local: local, day: item.day, calendar: calendar)
                                .padding(18)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .cardSurface()
                        }
                    }
                    .pagerCard()
                    .id(item.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $focusedItem, anchor: .center)
        // Opens on the newest step; a notification's step is set by the trip.
        .defaultScrollAnchor(.trailing)
        .contentMargins(.horizontal, 16, for: .scrollContent)
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .frame(height: Self.height)
        .sensoryFeedback(.selection, trigger: focusedItem)
    }
}

extension View {
    /// The solid surface of a card over the map.
    func cardSurface() -> some View {
        background(Color(uiColor: .systemBackground), in: .rect(cornerRadius: StepPager.cornerRadius))
            .shadow(color: .black.opacity(0.18), radius: 14, y: 4)
    }
}

private extension View {
    /// Most of the width, so the neighbors peek in and show there's more.
    func pagerCard() -> some View {
        containerRelativeFrame(.horizontal) { width, _ in min(width * 0.88, 440) }
            .frame(height: StepPager.height)
    }
}

/// The only card while the trip has no steps: cover, title, dates.
struct TripCoverCard: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Color.clear
                .frame(height: 112)
                .overlay { TripCover(account: account, trip: trip.withoutSteps, variant: .medium, symbolSize: 34) }
                .clipShape(.rect(cornerRadius: StepPager.cornerRadius - StepPager.inset))
            VStack(alignment: .leading, spacing: 3) {
                Text(trip.title)
                    .font(.headline)
                    .lineLimit(1)
                TripMetaLine(trip: trip.withoutSteps, calendar: calendar)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Group {
                    if let staleSince {
                        OfflineNote(fetchedAt: staleSince)
                    } else if trip.steps.isEmpty {
                        Text("Steps appear here once the trip gets going.")
                    } else if let summary = trip.summary, !summary.isEmpty {
                        Text(summary).lineLimit(2)
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        }
        .padding(StepPager.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

/// The trip at a glance, at the top of the map: cover, dates, how far it
/// has come. Tapping it shows the whole route – the overview the trip card
/// used to give, without scrolling to the far left for it.
struct TripOverviewBar: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?
    let showAll: () -> Void

    var body: some View {
        Button(action: showAll) {
            HStack(spacing: 10) {
                Color.clear
                    .frame(width: 38, height: 38)
                    .overlay { TripCover(account: account, trip: trip.withoutSteps, variant: .thumb, symbolSize: 14) }
                    .clipShape(.circle)
                VStack(alignment: .leading, spacing: 1) {
                    if let range = TripDates.range(of: trip.withoutSteps, calendar: calendar) {
                        Text(range)
                            .font(.subheadline.weight(.semibold))
                    }
                    Group {
                        if let staleSince {
                            OfflineNote(fetchedAt: staleSince)
                        } else {
                            Text("\(trip.stepCount) steps") + Text(verbatim: " · ") + Text("\(trip.photoCount) photos")
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .lineLimit(1)
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 4)
            }
            .padding(.leading, 6)
            .padding(.trailing, 16)
            .padding(.vertical, 6)
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .capsule)
        .accessibilityHint(Text("Show the whole trip"))
    }
}

/// A step in the pager: its first photo, day and place, the start of the
/// text. Tapping it opens the whole step.
struct StepPreviewCard: View {
    let account: Account
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar
    var pendingCount = 0
    var viewCount: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let photo = step.photos.first {
                Color.clear
                    .frame(height: 112)
                    .overlay { RemoteImage(account: account, photo: photo, variant: .medium, fallbacks: [.thumb]) }
                    .clipShape(.rect(cornerRadius: StepPager.cornerRadius - StepPager.inset))
                    .overlay(alignment: .bottomTrailing) {
                        if step.photos.count > 1 {
                            Text("+\(step.photos.count - 1)")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .glassEffect(.regular, in: .capsule)
                                .padding(8)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: 3) {
                StepTitle(day: day, date: step.occurredAt, calendar: calendar, place: step.placeName)
                if !step.body.isEmpty {
                    Text(step.body)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(step.photos.isEmpty ? 5 : 2)
                }
                Spacer(minLength: 0)
                StepCounts(
                    photos: step.photos.count + pendingCount,
                    comments: step.comments.count,
                    views: viewCount
                )
            }
            .padding(.horizontal, 10)
            .padding(.top, step.photos.isEmpty ? 10 : 0)
            .padding(.bottom, 8)
        }
        .padding(StepPager.inset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .multilineTextAlignment(.leading)
        .contentShape(.rect(cornerRadius: StepPager.cornerRadius))
        .cardSurface()
    }
}

/// "Day 3 · Tuesday, 12 May" over the place – how a step card starts.
struct StepTitle: View {
    let day: Int?
    let date: Date
    let calendar: TripCalendar
    let place: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
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
            .lineLimit(1)
            if let place {
                Text(place)
                    .font(.headline)
                    .lineLimit(1)
            }
        }
    }
}

/// Photos, comments and – for authors – readers, as small symbols.
struct StepCounts: View {
    let photos: Int
    let comments: Int
    var views: Int?

    var body: some View {
        HStack(spacing: 14) {
            if photos > 0 {
                Label("\(photos)", systemImage: "photo")
                    .accessibilityLabel(Text("\(photos) photos"))
            }
            if comments > 0 {
                Label("\(comments)", systemImage: "bubble.left")
                    .accessibilityLabel(Text("\(comments) comments"))
            }
            if let views {
                Label("\(views)", systemImage: "eye")
                    .accessibilityLabel(Text("\(views) views"))
            }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
        .labelStyle(CompactLabelStyle())
    }
}

private struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon
            configuration.title
        }
    }
}

/// A step opened from the pager. Equal by `id` only: which step is shown
/// while paging lives elsewhere, or every swipe would push a new page.
struct StepDetailRequest: Identifiable, Hashable {
    let id = UUID()
    let stepID: Int

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// The steps as pushed pages, one above the other like reels: swiping up
/// brings the next entry, so moving on to another day is a real scroll and
/// not just another photo. Each step is a story of its own.
struct StepDetailPager: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let queue: UploadSnapshot
    let actions: StepActions
    let showViews: Bool
    @Binding var stepID: Int
    let refresh: () async -> Void

    @Environment(\.dismiss) private var dismiss
    /// The photo each step is at – kept while moving between steps.
    @State private var photoIndex: [Int: Int] = [:]
    @State private var commentsFor: CommentsRequest?
    /// Pinching a photo opens it full screen to zoom.
    @State private var viewer: ViewerRequest?
    @State private var position = ScrollPosition(idType: Int.self)

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        let steps = trip.steps
        let current = steps.first { $0.id == stepID }
        // The bars' heights are read before the safe area is ignored: the
        // photos run under them, the controls stay clear of them.
        GeometryReader { geometry in
            let insets = geometry.safeAreaInsets
            let size = CGSize(width: geometry.size.width, height: geometry.size.height + insets.top + insets.bottom)
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(steps) { step in
                        StepStoryPage(
                            account: account,
                            step: step,
                            day: start.map { calendar.tripDay(of: step.occurredAt, start: $0) },
                            calendar: calendar,
                            pending: queue.uploadsByStepID[step.id] ?? [],
                            viewCount: showViews ? step.viewCount : nil,
                            index: Binding(
                                get: { min(photoIndex[step.id] ?? 0, max(step.photos.count - 1, 0)) },
                                set: { photoIndex[step.id] = $0 }
                            ),
                            isCurrent: step.id == stepID,
                            size: size,
                            insets: insets,
                            next: { advance(from: step, by: 1) },
                            previous: { advance(from: step, by: -1) },
                            showComments: { commentsFor = CommentsRequest(stepID: step.id) },
                            showOnMap: { actions.showOnMap(step) },
                            zoom: { viewer = ViewerRequest(stepID: step.id, index: photoIndex[step.id] ?? 0) }
                        )
                        .frame(width: size.width, height: size.height)
                        .id(step.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(OneStepPaging(axis: .vertical))
            .scrollIndicators(.hidden)
            .scrollPosition($position)
            // Taken over only once the scroll has settled: reported while a
            // programmatic scroll was still running, the old step won and
            // the scroll turned back.
            .onScrollPhaseChange { _, phase in
                if phase == .idle, let id = position.viewID(type: Int.self), id != stepID { stepID = id }
            }
            .onChange(of: stepID, initial: true) { _, id in
                if position.viewID(type: Int.self) != id { position.scrollTo(id: id) }
            }
            .ignoresSafeArea()
        }
        .background(Color.black)
        .statusBarHidden()
        .sensoryFeedback(.impact(weight: .light), trigger: stepID)
        .environment(\.colorScheme, .dark)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if actions.isAuthor, let current {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Edit", systemImage: "pencil") { actions.edit(current) }
                        Button("Add photos", systemImage: "photo.badge.plus") { actions.addPhotos(current) }
                        Button("Share …", systemImage: "square.and.arrow.up") { actions.share(current) }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel(Text("Step options"))
                }
            }
        }
        // The step was deleted while open.
        .onChange(of: steps.map(\.id)) { _, ids in
            if !ids.contains(stepID) { dismiss() }
        }
        .fullScreenCover(item: $viewer) { request in
            if let step = steps.first(where: { $0.id == request.stepID }) {
                PhotoViewer(account: account, photos: step.photos, startIndex: request.index)
            }
        }
        .sheet(item: $commentsFor) { request in
            if let step = steps.first(where: { $0.id == request.stepID }) {
                StepCommentsSheet(step: step, isAuthor: actions.isAuthor, delete: actions.deleteComment) {
                    // The composer is presented by the trip; one sheet at a time.
                    commentsFor = nil
                    Task {
                        try? await Task.sleep(for: .milliseconds(450))
                        actions.comment(step)
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    /// Next or previous photo; past the last or first, on to the next or
    /// previous step – which scrolls the whole page, so it's clear a new
    /// entry begins.
    private func advance(from step: Components.Schemas.Step, by delta: Int) {
        let steps = trip.steps
        let current = min(photoIndex[step.id] ?? 0, max(step.photos.count - 1, 0))
        let target = current + delta
        if target >= 0 && target < step.photos.count {
            withAnimation(.smooth(duration: 0.3)) { photoIndex[step.id] = target }
            return
        }
        guard let position = steps.firstIndex(where: { $0.id == step.id }) else { return }
        let neighbor = position + delta
        guard steps.indices.contains(neighbor) else { return }
        let other = steps[neighbor]
        // Going back lands on the previous step's last photo.
        photoIndex[other.id] = delta > 0 ? 0 : max(other.photos.count - 1, 0)
        withAnimation(.smooth(duration: 0.45)) { stepID = other.id }
    }
}

struct CommentsRequest: Identifiable {
    let stepID: Int
    var id: Int { stepID }
}

/// One step as a story: its photos side by side over the whole screen, all
/// of them equal – none is the step's "title photo". They follow the finger
/// sideways; a tap on the right goes on, on the left back. Bars at the top
/// show where you are. Day, place and the start of the text stay at the
/// bottom on a dark fade, the photo's caption above them; a longer text
/// opens in a reading sheet. A step without photos becomes a text story.
struct StepStoryPage: View {
    let account: Account
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar
    var pending: [PendingUpload] = []
    /// Readers who saw the step – authors only.
    var viewCount: Int?
    @Binding var index: Int
    let isCurrent: Bool
    let size: CGSize
    /// Status, navigation and home indicator areas.
    let insets: EdgeInsets
    let next: () -> Void
    let previous: () -> Void
    let showComments: () -> Void
    let showOnMap: () -> Void
    let zoom: () -> Void

    @State private var truncated = false
    @State private var reading = false
    @State private var position = ScrollPosition(idType: Int.self)

    private var photo: Components.Schemas.Photo? { step.photos.indices.contains(index) ? step.photos[index] : nil }
    private var hasPlace: Bool { step.lat != nil && step.lon != nil }

    var body: some View {
        ZStack {
            if step.photos.isEmpty {
                textStory
            } else {
                photoPager
            }
        }
        .overlay(alignment: .top) { progress.padding(.top, insets.top + 6) }
        .overlay(alignment: .bottom) { bottom }
        .foregroundStyle(.white)
        .clipped()
        .sheet(isPresented: $reading) {
            StepTextSheet(step: step, day: day, calendar: calendar)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Photos

    private var photoPager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(Array(step.photos.enumerated()), id: \.element.id) { offset, photo in
                    media(photo, playing: isCurrent && offset == index)
                        .frame(width: size.width, height: size.height)
                        .clipped()
                        .contentShape(.rect)
                        .gesture(
                            SpatialTapGesture().onEnded { value in
                                value.location.x < size.width / 3 ? previous() : next()
                            },
                            isEnabled: photo.mediaType != .video
                        )
                        .overlay {
                            if photo.mediaType == .video { videoEdges }
                        }
                        .simultaneousGesture(
                            MagnifyGesture().onEnded { value in
                                if value.magnification > 1.15 && photo.mediaType == .photo { zoom() }
                            }
                        )
                        .accessibilityElement()
                        .accessibilityLabel(Text(photo.caption ?? String(localized: "Photo \(offset + 1)")))
                        .accessibilityAction(named: Text("Next photo"), next)
                        .accessibilityAction(named: Text("Previous photo"), previous)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(OneStepPaging(axis: .horizontal))
        .scrollIndicators(.hidden)
        .scrollPosition($position)
        // Like the steps: the photo is taken over once the scroll settled.
        .onScrollPhaseChange { _, phase in
            guard phase == .idle, let id = position.viewID(type: Int.self),
                  let shown = step.photos.firstIndex(where: { $0.id == id }), shown != index
            else { return }
            index = shown
        }
        .onChange(of: index, initial: true) { _, index in
            guard step.photos.indices.contains(index) else { return }
            let id = step.photos[index].id
            if position.viewID(type: Int.self) != id { position.scrollTo(id: id) }
        }
    }

    private func media(_ photo: Components.Schemas.Photo, playing: Bool) -> some View {
        ZStack {
            // The photo itself, blurred, fills what the fitted one leaves.
            Color.clear
                .overlay { RemoteImage(account: account, photo: photo, variant: .thumb) }
                .clipped()
                .blur(radius: 40)
                .overlay(Color.black.opacity(0.35))
            if photo.mediaType == .video {
                VideoPage(account: account, photo: photo, isCurrent: playing)
                    .padding(.top, insets.top)
            } else {
                RemoteImage(account: account, photo: photo, variant: .large, contentMode: .fit, fallbacks: [.medium, .thumb])
            }
        }
    }

    /// Videos bring their own controls in the middle; only the edges move on.
    private var videoEdges: some View {
        HStack(spacing: 0) {
            Color.clear.contentShape(.rect).onTapGesture(perform: previous).frame(width: size.width * 0.15)
            Color.clear.allowsHitTesting(false)
            Color.clear.contentShape(.rect).onTapGesture(perform: next).frame(width: size.width * 0.15)
        }
    }

    /// No photos: the text is the picture, as large as it fits.
    private var textStory: some View {
        ZStack {
            CoverPlaceholder(seed: step.id, symbolSize: 0)
            if !step.body.isEmpty {
                ClampedText(text: step.body, lines: 10, truncated: $truncated)
                    .font(.title3.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 120)
            }
        }
        .contentShape(.rect)
        .gesture(SpatialTapGesture().onEnded { value in
            value.location.x < size.width / 3 ? previous() : next()
        })
    }

    /// One bar per photo, filled up to the one shown.
    @ViewBuilder private var progress: some View {
        if step.photos.count > 1 {
            HStack(spacing: 4) {
                ForEach(step.photos.indices, id: \.self) { position in
                    Capsule()
                        .fill(.white.opacity(position <= index ? 0.95 : 0.35))
                        .frame(height: 3)
                }
            }
            .padding(.horizontal, 12)
            .shadow(color: .black.opacity(0.3), radius: 2)
            .animation(.smooth(duration: 0.2), value: index)
            .accessibilityHidden(true)
        }
    }

    // MARK: Text

    private var bottom: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let caption = photo?.caption, !caption.isEmpty {
                Text(caption)
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.45), in: .rect(cornerRadius: 16))
                    .id(photo?.id)
                    .transition(.opacity)
            }

            VStack(alignment: .leading, spacing: 4) {
                StepDayLine(day: day, date: step.occurredAt, calendar: calendar)
                    .foregroundStyle(.white.opacity(0.8))
                if let place = step.placeName {
                    Text(place)
                        .font(.title.bold())
                        .lineLimit(2)
                }
            }

            // On a text story the text is the picture already.
            if !step.photos.isEmpty && !step.body.isEmpty {
                ClampedText(text: step.body, lines: 3, truncated: $truncated)
                    .font(.body)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                    .onTapGesture { if truncated { reading = true } }
            }

            if !pending.isEmpty {
                PendingUploadsView(uploads: pending)
            }

            HStack(spacing: 10) {
                if truncated {
                    Button { reading = true } label: {
                        Label("Read more", systemImage: "text.alignleft")
                    }
                }
                Button(action: showComments) {
                    Label("\(step.comments.count)", systemImage: "bubble.left")
                        .accessibilityLabel(Text("Comments"))
                }
                if hasPlace {
                    Button(action: showOnMap) {
                        Label("Show on map", systemImage: "map")
                            .labelStyle(.iconOnly)
                    }
                }
                Spacer(minLength: 0)
                if let viewCount {
                    Label("\(viewCount)", systemImage: "eye")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                        .accessibilityLabel(Text("Seen by \(viewCount) readers"))
                }
            }
            .buttonStyle(.glass)
        }
        .animation(.smooth(duration: 0.2), value: photo?.id)
        .padding(.horizontal, 20)
        .padding(.top, 60)
        .padding(.bottom, insets.bottom + 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black.opacity(0.65), location: 0.35),
                    .init(color: .black.opacity(0.8), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
        }
    }
}

/// "Day 3 · Tuesday, 12 May"
struct StepDayLine: View {
    let day: Int?
    let date: Date
    let calendar: TripCalendar
    var withYear = false

    var body: some View {
        HStack(spacing: 6) {
            if let day {
                Text("Day \(day)")
                    .foregroundStyle(.tint)
                Text("·")
            }
            Text(date.formatted(withYear
                ? Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide).year()
                : Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide)
            ))
        }
        .font(.subheadline.weight(.semibold))
    }
}

/// Text cut to `lines`, telling whether anything was cut – so "Read more"
/// only shows when there is more.
struct ClampedText: View {
    let text: String
    let lines: Int
    @Binding var truncated: Bool

    @State private var full: CGFloat = 0
    @State private var shown: CGFloat = 0

    var body: some View {
        Text(text)
            .lineLimit(lines)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                shown = height
                truncated = full > shown + 1
            }
            .background {
                Text(text)
                    .fixedSize(horizontal: false, vertical: true)
                    .hidden()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        full = height
                        truncated = full > shown + 1
                    }
            }
    }
}

/// The whole text of a step, to read at length.
struct StepTextSheet: View {
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                StepDayLine(day: day, date: step.occurredAt, calendar: calendar, withYear: true)
                    .foregroundStyle(.secondary)
                if let place = step.placeName {
                    Text(place).font(.largeTitle.bold())
                }
                Text(step.body)
                    .font(.body)
                    .lineSpacing(5)
                    .textSelection(.enabled)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 40)
        }
        // Solid for reading at length – a photo shimmering through glass
        // behind long text was tiring.
        .presentationBackground(Color(uiColor: .systemBackground))
        .presentationDragIndicator(.visible)
    }
}

/// The comments of a step, opened from its story.
struct StepCommentsSheet: View {
    let step: Components.Schemas.Step
    let isAuthor: Bool
    let delete: (Components.Schemas.Comment) -> Void
    let write: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if step.comments.isEmpty {
                    Text("No comments yet")
                        .foregroundStyle(.secondary)
                }
                ForEach(step.comments, id: \.id) { comment in
                    CommentRow(comment: comment)
                        .swipeActions {
                            if isAuthor {
                                Button("Delete comment", systemImage: "trash", role: .destructive) { delete(comment) }
                            }
                        }
                }
                Button(action: write) {
                    Label("Write a comment", systemImage: "square.and.pencil")
                }
            }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// A comment as a list row: name and when, then the text.
struct CommentRow: View {
    let comment: Components.Schemas.Comment

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(comment.authorName)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(comment.createdAt.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(comment.body)
                .font(.subheadline)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// Paging that moves one page per swipe at most – plain `.paging` let a
/// quick swipe fly past the next step.
struct OneStepPaging: ScrollTargetBehavior {
    var axis: Axis = .horizontal

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let length = axis == .horizontal ? context.containerSize.width : context.containerSize.height
        guard length > 0 else { return }
        let origin = axis == .horizontal ? context.originalTarget.rect.minX : context.originalTarget.rect.minY
        let proposed = axis == .horizontal ? target.rect.minX : target.rect.minY
        let current = (origin / length).rounded()
        let next = min(max((proposed / length).rounded(), current - 1), current + 1) * length
        if axis == .horizontal { target.rect.origin.x = next } else { target.rect.origin.y = next }
    }
}
