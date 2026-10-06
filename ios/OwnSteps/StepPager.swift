import OwnStepsKit
import SwiftUI

/// The trip's steps as cards side by side under the map, like Polarsteps:
/// swiping moves to the previous or next step and the map follows. Oldest
/// on the left, so the route reads left to right; it opens on the newest,
/// which is what readers come back for ([E13] – only the display differs,
/// the data stays chronological). The trip itself is the first card, with
/// its cover.
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

    var body: some View {
        let items = TimelineItem.items(of: trip, queue: queue, calendar: calendar)
        ScrollView(.horizontal) {
            LazyHStack(spacing: 10) {
                TripCoverCard(account: account, trip: trip, calendar: calendar, staleSince: staleSince)
                    .pagerCard()
                    .id(TimelineItem.coverID)

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
                            .buttonStyle(CardButtonStyle())
                            .accessibilityHint(Text("Opens the step"))
                        case .local(let local):
                            LocalStepCard(account: account, local: local, day: item.day, calendar: calendar)
                                .padding(16)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .pagerCardBackground()
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
        .contentMargins(.horizontal, 20, for: .scrollContent)
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .frame(height: Self.height)
    }
}

private extension View {
    /// Most of the width, so the neighbors peek in and show there's more.
    func pagerCard() -> some View {
        containerRelativeFrame(.horizontal) { width, _ in min(width * 0.88, 440) }
            .frame(height: StepPager.height)
    }
}

extension View {
    /// Cards are content, not controls – solid, not glass.
    func pagerCardBackground() -> some View {
        background(.background, in: .rect(cornerRadius: 24))
            .clipShape(.rect(cornerRadius: 24))
            .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
    }
}

/// The first card: cover, title, dates and the trip in numbers.
struct TripCoverCard: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let staleSince: Date?

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.firstStepAt)
        let end = calendar.date(fromCalendarDay: trip.endDate) ?? trip.lastStepAt
        Color.clear
            .overlay { TripCover(account: account, trip: trip.withoutSteps, variant: .medium) }
            .overlay {
                LinearGradient(
                    stops: [.init(color: .black.opacity(0.1), location: 0), .init(color: .black.opacity(0.78), location: 1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(trip.title)
                            .font(.title2.bold())
                            .lineLimit(2)
                        if let range = TripDates.range(start: start, end: end, calendar: calendar) {
                            Text(range)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                    }
                    HStack(alignment: .top, spacing: 0) {
                        if let start, let end {
                            TripStat(label: "Days", value: max(calendar.tripDay(of: end, start: start), 1))
                        }
                        TripStat(label: "Steps", value: trip.stepCount)
                        TripStat(label: "Photos", value: trip.photoCount)
                    }
                    if let staleSince {
                        OfflineNote(fetchedAt: staleSince)
                    } else if trip.steps.isEmpty {
                        Text("Steps appear here once the trip gets going.")
                            .font(.footnote)
                    } else if let summary = trip.summary, !summary.isEmpty {
                        Text(summary)
                            .font(.footnote)
                            .lineLimit(2)
                    }
                }
                .foregroundStyle(.white)
                .environment(\.colorScheme, .dark)
                .padding(18)
            }
            .clipShape(.rect(cornerRadius: 24))
            .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
            .accessibilityElement(children: .combine)
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
        VStack(alignment: .leading, spacing: 0) {
            if let photo = step.photos.first {
                Color.clear
                    .frame(height: 110)
                    .overlay { RemoteImage(account: account, photo: photo, variant: .medium, fallbacks: [.thumb]) }
                    .clipped()
                    .overlay(alignment: .bottomTrailing) {
                        if step.photos.count > 1 {
                            Text("+\(step.photos.count - 1)")
                                .font(.caption.weight(.bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .glassEffect(.regular, in: .capsule)
                                .environment(\.colorScheme, .dark)
                                .padding(8)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: 4) {
                StepDateLine(day: day, date: step.occurredAt, calendar: calendar)
                if let place = step.placeName {
                    Text(place)
                        .font(.headline)
                        .lineLimit(1)
                }
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
            .padding(14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .multilineTextAlignment(.leading)
        .foregroundStyle(.primary)
        .pagerCardBackground()
    }
}

/// "Day 3 · Tuesday, 12 May"
struct StepDateLine: View {
    let day: Int?
    let date: Date
    let calendar: TripCalendar

    var body: some View {
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
                ViewCountLabel(count: views)
            }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
        .labelStyle(CompactLabelStyle())
    }
}

/// How many readers saw a step – authors only.
struct ViewCountLabel: View {
    let count: Int

    var body: some View {
        Label("\(count)", systemImage: "eye")
            .accessibilityLabel(Text("\(count) views"))
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

/// Which step is open full screen. The ID stays the same while paging, or
/// the cover would be presented anew on every swipe.
struct StepDetailRequest: Identifiable {
    let id = UUID()
    var stepID: Int
}

/// One step full screen – photos, text, comments – and sideways to the
/// previous and next one.
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
        NavigationStack {
            TabView(selection: $stepID) {
                ForEach(steps) { step in
                    ScrollView {
                        StepCard(
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
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                    }
                    .refreshable { await refresh() }
                    .tag(step.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .navigationTitle(index.map { Text("\($0 + 1) of \(steps.count)") } ?? Text(verbatim: ""))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel(Text("Close"))
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button {
                        if let index, index > 0 { withAnimation { stepID = steps[index - 1].id } }
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .disabled((index ?? 0) == 0)
                    .accessibilityLabel(Text("Previous step"))
                    Spacer()
                    Button {
                        if let index, index < steps.count - 1 { withAnimation { stepID = steps[index + 1].id } }
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .disabled((index ?? steps.count - 1) >= steps.count - 1)
                    .accessibilityLabel(Text("Next step"))
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
                    .navigationTransition(.zoom(sourceID: request.id, in: photoTransition))
            }
        }
    }
}
