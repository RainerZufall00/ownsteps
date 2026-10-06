import OwnStepsKit
import SwiftUI
import UIKit

/// The trip's steps as cards side by side under the map, like Polarsteps:
/// swiping moves to the previous or next step and the map follows. Oldest
/// on the left, so the route reads left to right; it opens on the newest,
/// which is what readers come back for ([E13] – only the display differs,
/// the data stays chronological). The trip itself isn't a card – it reads
/// like one more day – but the `TripOverviewBar` above the map; only a trip
/// without steps shows its cover card here. The cards float over the map,
/// so they're Liquid Glass, like the panels of Apple's Maps.
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
                                .glassEffect(.regular, in: .rect(cornerRadius: StepPager.cornerRadius))
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
        .glassEffect(.regular, in: .rect(cornerRadius: StepPager.cornerRadius))
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
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: StepPager.cornerRadius))
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
/// sideways to the previous and next step. Actions sit in the toolbars.
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
    /// One viewer for all pages: with one per page, reused pages presented
    /// another step's photos (as List rows did).
    @State private var viewer: ViewerRequest?
    @Namespace private var photoTransition

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        let steps = trip.steps
        let index = steps.firstIndex { $0.id == stepID }
        let current = index.map { steps[$0] }
        TabView(selection: $stepID) {
            ForEach(steps) { step in
                StepDetailPage(
                    account: account,
                    step: step,
                    day: start.map { calendar.tripDay(of: step.occurredAt, start: $0) },
                    calendar: calendar,
                    pending: queue.uploadsByStepID[step.id] ?? [],
                    viewCount: showViews ? step.viewCount : nil,
                    actions: actions,
                    photoTransition: photoTransition
                ) { photo in
                    viewer = ViewerRequest(stepID: step.id, index: photo)
                }
                .refreshable { await refresh() }
                .tag(step.id)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(title(of: current, start: start))
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
            ToolbarItem(placement: .bottomBar) {
                Button {
                    if let index, index > 0 { withAnimation { stepID = steps[index - 1].id } }
                } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled((index ?? 0) == 0)
                .accessibilityLabel(Text("Previous step"))
            }
            ToolbarSpacer(.flexible, placement: .bottomBar)
            if let current {
                ToolbarItem(placement: .bottomBar) {
                    Button { actions.comment(current) } label: {
                        Label("Comment", systemImage: "bubble.left")
                    }
                }
            }
            ToolbarSpacer(.flexible, placement: .bottomBar)
            ToolbarItem(placement: .bottomBar) {
                Button {
                    if let index, index < steps.count - 1 { withAnimation { stepID = steps[index + 1].id } }
                } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled((index ?? steps.count - 1) >= steps.count - 1)
                .accessibilityLabel(Text("Next step"))
            }
        }
        // The step was deleted while open.
        .onChange(of: steps.map(\.id)) { _, ids in
            if !ids.contains(stepID) { dismiss() }
        }
        .fullScreenCover(item: $viewer) { request in
            if let step = steps.first(where: { $0.id == request.stepID }) {
                PhotoViewer(account: account, photos: step.photos, startIndex: request.index)
                    .navigationTransition(.zoom(sourceID: request.id, in: photoTransition))
            }
        }
    }

    /// The place, like the heading of a step on the web; else the day.
    private func title(of step: Components.Schemas.Step?, start: Date?) -> Text {
        guard let step else { return Text(verbatim: "") }
        if let place = step.placeName { return Text(verbatim: place) }
        if let start { return Text("Day \(calendar.tripDay(of: step.occurredAt, start: start))") }
        return Text(step.occurredAt.formatted(
            Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone)
        ))
    }
}

/// One step as a grouped list, like a detail screen in Apple's apps: the
/// photos on top, then the text, the facts, and the comments.
struct StepDetailPage: View {
    let account: Account
    let step: Components.Schemas.Step
    let day: Int?
    let calendar: TripCalendar
    var pending: [PendingUpload] = []
    /// Readers who saw the step – authors only.
    var viewCount: Int?
    let actions: StepActions
    let photoTransition: Namespace.ID
    let openPhoto: (Int) -> Void

    var body: some View {
        List {
            if !step.photos.isEmpty {
                Section {
                    PhotoGrid(account: account, stepID: step.id, photos: step.photos, transition: photoTransition, open: openPhoto)
                        .listRowInsets(EdgeInsets())
                }
            }

            if !pending.isEmpty {
                Section {
                    PendingUploadsView(uploads: pending)
                }
            }

            if !step.body.isEmpty {
                Section {
                    Text(step.body)
                        .lineSpacing(2)
                        .textSelection(.enabled)
                        .padding(.vertical, 4)
                }
            }

            Section {
                LabeledContent {
                    if let day { Text("Day \(day)") }
                } label: {
                    Label(
                        step.occurredAt.formatted(
                            Date.FormatStyle(timeZone: calendar.calendar.timeZone).weekday(.wide).day().month(.wide).year()
                        ),
                        systemImage: "calendar"
                    )
                }
                if let place = step.placeName {
                    if step.lat != nil && step.lon != nil {
                        Button { actions.showOnMap(step) } label: {
                            Label(place, systemImage: "mappin.and.ellipse")
                        }
                        .accessibilityHint(Text("Show on map"))
                    } else {
                        Label(place, systemImage: "mappin.and.ellipse")
                    }
                }
                if let viewCount {
                    LabeledContent {
                        Text("\(viewCount) readers")
                    } label: {
                        Label("Seen by", systemImage: "eye")
                    }
                }
            } footer: {
                if viewCount != nil {
                    Text("Readers who have seen this step, each counted once.")
                }
            }

            Section("Comments") {
                ForEach(step.comments, id: \.id) { comment in
                    CommentRow(comment: comment)
                        .contextMenu {
                            if actions.isAuthor {
                                Button("Delete comment", systemImage: "trash", role: .destructive) {
                                    actions.deleteComment(comment)
                                }
                            }
                        }
                }
                Button { actions.comment(step) } label: {
                    Label("Write a comment", systemImage: "square.and.pencil")
                }
            }
        }
        .listStyle(.insetGrouped)
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
