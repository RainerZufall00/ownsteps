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

/// The steps as pushed pages: back with the system's swipe from the edge,
/// sideways to the previous and next step. Each step is a story.
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
    /// The photo each step is at – kept while paging between steps.
    @State private var photoIndex: [Int: Int] = [:]
    @State private var commentsFor: CommentsRequest?
    /// Pinching a photo opens it full screen to zoom.
    @State private var viewer: ViewerRequest?

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        let steps = trip.steps
        let current = steps.first { $0.id == stepID }
        // Paging scroll view, not a page-style TabView: that one kept the
        // status bar free, so the photos couldn't fill the screen. The bars'
        // heights are read before the safe area is ignored.
        GeometryReader { geometry in
            let insets = geometry.safeAreaInsets
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
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
                            insets: insets,
                            next: { advance(from: step, by: 1) },
                            previous: { advance(from: step, by: -1) },
                            showComments: { commentsFor = CommentsRequest(stepID: step.id) },
                            showOnMap: { actions.showOnMap(step) },
                            zoom: { viewer = ViewerRequest(stepID: step.id, index: photoIndex[step.id] ?? 0) }
                        )
                        .frame(width: geometry.size.width, height: geometry.size.height + insets.top + insets.bottom)
                        .id(step.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(OneStepPaging())
            .scrollIndicators(.hidden)
            .scrollPosition(id: Binding(get: { stepID }, set: { if let id = $0 { stepID = id } }))
            .ignoresSafeArea()
        }
        .background(Color.black)
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
    /// previous step – like stories.
    private func advance(from step: Components.Schemas.Step, by delta: Int) {
        let steps = trip.steps
        let current = min(photoIndex[step.id] ?? 0, max(step.photos.count - 1, 0))
        let target = current + delta
        if target >= 0 && target < step.photos.count {
            photoIndex[step.id] = target
            return
        }
        guard let position = steps.firstIndex(where: { $0.id == step.id }) else { return }
        let neighbor = position + delta
        guard steps.indices.contains(neighbor) else { return }
        let other = steps[neighbor]
        // Going back lands on the previous step's last photo.
        photoIndex[other.id] = delta > 0 ? 0 : max(other.photos.count - 1, 0)
        withAnimation(.snappy) { stepID = other.id }
    }
}

struct CommentsRequest: Identifiable {
    let stepID: Int
    var id: Int { stepID }
}

/// One step as a story: its photos one at a time over the whole screen, all
/// of them equal – none is the step's "title photo". Tapping the right side
/// goes on, the left side back; bars at the top show where you are. Day,
/// place and the text stay at the bottom on a dark fade, the photo's caption
/// above them. A step without photos becomes a text story.
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
    /// Status, navigation and home indicator areas – the photo runs under
    /// them, the controls stay clear of them.
    let insets: EdgeInsets
    let next: () -> Void
    let previous: () -> Void
    let showComments: () -> Void
    let showOnMap: () -> Void
    let zoom: () -> Void

    @State private var expanded = false

    private var photo: Components.Schemas.Photo? { step.photos.indices.contains(index) ? step.photos[index] : nil }
    private var hasPlace: Bool { step.lat != nil && step.lon != nil }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                if let photo {
                    media(photo)
                        .id(photo.id)
                        .transition(.opacity)
                } else {
                    CoverPlaceholder(seed: step.id, symbolSize: 0)
                    if !step.body.isEmpty {
                        Text(step.body)
                            .font(.title2.weight(.semibold))
                            .multilineTextAlignment(.center)
                            .padding(32)
                            .minimumScaleFactor(0.6)
                    }
                }
                tapZones(width: geometry.size.width)
            }
            .animation(.easeInOut(duration: 0.2), value: index)
            .overlay(alignment: .top) { progress.padding(.top, insets.top + 6) }
            .overlay(alignment: .bottom) { bottom(height: geometry.size.height) }
        }
        .foregroundStyle(.white)
        .clipped()
    }

    // MARK: Photo

    private func media(_ photo: Components.Schemas.Photo) -> some View {
        ZStack {
            // The photo itself, blurred, fills what the fitted one leaves.
            Color.clear
                .overlay { RemoteImage(account: account, photo: photo, variant: .thumb) }
                .clipped()
                .blur(radius: 40)
                .overlay(Color.black.opacity(0.35))
            if photo.mediaType == .video {
                VideoPage(account: account, photo: photo, isCurrent: isCurrent)
                    .padding(.top, insets.top)
            } else {
                RemoteImage(account: account, photo: photo, variant: .large, contentMode: .fit, fallbacks: [.medium, .thumb])
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Text(photo.caption ?? String(localized: "Photo \(index + 1)")))
    }

    /// Left third back, the rest on – narrower on videos, which bring
    /// their own controls in the middle.
    private func tapZones(width: CGFloat) -> some View {
        let isVideo = photo?.mediaType == .video
        return HStack(spacing: 0) {
            Button(action: previous) { Color.clear.contentShape(.rect) }
                .frame(width: width * (isVideo ? 0.18 : 0.33))
                .accessibilityLabel(Text("Previous photo"))
            Color.clear
                .allowsHitTesting(!isVideo)
                .contentShape(.rect)
                .onTapGesture(perform: next)
                .accessibilityHidden(true)
            if isVideo {
                Button(action: next) { Color.clear.contentShape(.rect) }
                    .frame(width: width * 0.18)
                    .accessibilityLabel(Text("Next photo"))
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            MagnifyGesture().onEnded { value in
                if value.magnification > 1.15 && photo?.mediaType == .photo { zoom() }
            }
        )
        .accessibilityAction(named: Text("Next photo"), next)
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
            .accessibilityHidden(true)
        }
    }

    // MARK: Text

    private func bottom(height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let caption = photo?.caption, !caption.isEmpty {
                Text(caption)
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.45), in: .rect(cornerRadius: 16))
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if let day {
                        Text("Day \(day)")
                            .foregroundStyle(.tint)
                        Text("·")
                    }
                    Text(step.occurredAt.formatted(
                        Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide)
                    ))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.8))
                if let place = step.placeName {
                    Text(place)
                        .font(.title.bold())
                        .lineLimit(2)
                }
            }

            // On a text story the text is the picture already.
            if photo != nil && !step.body.isEmpty {
                ScrollView {
                    Text(step.body)
                        .font(.body)
                        .lineSpacing(3)
                        .lineLimit(expanded ? nil : 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .scrollDisabled(!expanded)
                .frame(maxHeight: expanded ? height * 0.4 : nil)
                .fixedSize(horizontal: false, vertical: !expanded)
                .contentShape(.rect)
                .onTapGesture { withAnimation(.snappy) { expanded.toggle() } }
                .accessibilityHint(Text(expanded ? "Show less" : "Show more"))
            }

            if !pending.isEmpty {
                PendingUploadsView(uploads: pending)
            }

            HStack(spacing: 10) {
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
                Spacer()
                if let viewCount {
                    Label("\(viewCount)", systemImage: "eye")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                        .accessibilityLabel(Text("Seen by \(viewCount) readers"))
                }
            }
            .buttonStyle(.glass)
        }
        .padding(.horizontal, 20)
        .padding(.top, 60)
        .padding(.bottom, insets.bottom + 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black.opacity(expanded ? 0.85 : 0.65), location: 0.35),
                    .init(color: .black.opacity(expanded ? 0.9 : 0.8), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
        }
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

/// Paging that moves one step per swipe at most – plain `.paging` let a
/// quick swipe fly past the next step.
struct OneStepPaging: ScrollTargetBehavior {
    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let width = context.containerSize.width
        guard width > 0 else { return }
        let current = (context.originalTarget.rect.minX / width).rounded()
        let proposed = target.rect.minX / width
        let next = min(max(proposed.rounded(), current - 1), current + 1)
        target.rect.origin.x = next * width
    }
}
