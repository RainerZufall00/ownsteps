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
    let actions: StepActions
    /// Where the step's page zooms out of.
    let transition: Namespace.ID
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
                                .matchedTransitionSource(id: step.id, in: transition)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Open", systemImage: "arrow.up.forward.app") { open(step.id) }
                                Button("Comments", systemImage: "bubble.left") { actions.comment(step) }
                                if actions.isAuthor {
                                    Button("Edit", systemImage: "pencil") { actions.edit(step) }
                                    Button("Add photos", systemImage: "photo.badge.plus") { actions.addPhotos(step) }
                                    Button("Share …", systemImage: "square.and.arrow.up") { actions.share(step) }
                                }
                            }
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
        // Grouped: white in the light, a raised gray in the dark – on
        // pure black the cards looked like holes in the map.
        background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: StepPager.cornerRadius))
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

/// The trip at a glance, at the top of the map: cover, title, dates, how
/// far it has come. Tapping it shows the whole route – the overview the trip card
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
                    Text(trip.title)
                        .font(.subheadline.weight(.semibold))
                    Group {
                        if let staleSince {
                            OfflineNote(fetchedAt: staleSince)
                        } else {
                            TripMetaLine(trip: trip.withoutSteps, calendar: calendar)
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
        .contentShape(.contextMenuPreview, .rect(cornerRadius: StepPager.cornerRadius))
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
    /// A zoomed photo keeps the drags for itself.
    @State private var photoZoomed = false
    @State private var position = ScrollPosition(idType: Int.self)
    /// A soft knock when tapping past the first or last photo.
    @State private var edgeBump = 0

    var body: some View {
        let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt)
        let steps = trip.steps
        let current = steps.first { $0.id == stepID }
        // The bars' sizes are read before the safe area is ignored: the
        // backdrop runs under them, the controls stay clear of them. Each
        // side counts on its own – on iPhone Duo's inner display the bars and
        // the status bar can sit on one side only.
        GeometryReader { geometry in
            let insets = geometry.safeAreaInsets
            let size = CGSize(
                width: geometry.size.width + insets.leading + insets.trailing,
                height: geometry.size.height + insets.top + insets.bottom
            )
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
                            showComments: { actions.comment(step) },
                            showOnMap: { actions.showOnMap(step) },
                            isZoomed: $photoZoomed
                        )
                        .frame(width: size.width, height: size.height)
                        .id(step.id)
                    }
                }
                .scrollTargetLayout()
                // The first and last step end the trip, with nothing behind them.
                .background(NoBounce())
            }
            .scrollTargetBehavior(OneStepPaging(axis: .vertical))
            .scrollIndicators(.hidden)
            .scrollDisabled(photoZoomed)
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
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.5), trigger: edgeBump)
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
    }

    /// Next or previous photo within the step. Days change only by swiping
    /// up and down – tapping past the last photo used to land in the next
    /// day without noticing.
    private func advance(from step: Components.Schemas.Step, by delta: Int) {
        let current = min(photoIndex[step.id] ?? 0, max(step.photos.count - 1, 0))
        let target = current + delta
        if target >= 0 && target < step.photos.count {
            photoIndex[step.id] = target
        } else {
            edgeBump += 1
        }
    }
}

/// Stops the scroll view around it at its ends. `scrollBounceBehavior` can't:
/// it only leaves out the bounce for content that fits.
private struct NoBounce: UIViewRepresentable {
    final class Probe: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            let ancestors = sequence(first: self as UIView) { $0.superview }
            ancestors.lazy.compactMap { $0 as? UIScrollView }.first?.bounces = false
        }
    }

    func makeUIView(context: Context) -> Probe { Probe() }
    func updateUIView(_ view: Probe, context: Context) {}
}

struct CommentsRequest: Identifiable {
    let stepID: Int
    var id: Int { stepID }
}

/// One step as a story: its photos side by side over the whole screen, all
/// of them equal – none is the step's "title photo". They follow the finger
/// sideways; a tap on the right goes on, on the left back, and pinching
/// zooms right here, with the text in view. Each layer has
/// its own place, so it's clear what belongs to what: day and place at the
/// top under the bars, like the sender of a status, and the day's text at
/// the bottom – both stay while swiping. The photo sits between them, never
/// under them (a portrait photo would otherwise run behind the text), with
/// its caption right below it, moving along with it. A longer text opens
/// in a reading sheet. A step without photos becomes a text story.
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
    /// The shown photo is zoomed in.
    @Binding var isZoomed: Bool

    @State private var reading = false
    /// The shown photo's zoom and where it was dragged to, each with the
    /// value the running gesture started from.
    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var basePan: CGSize = .zero
    @State private var position = ScrollPosition(idType: Int.self)
    /// Heights of the day header and the text below – the photos keep clear
    /// of both.
    @State private var topHeight: CGFloat = 0
    @State private var bottomHeight: CGFloat = 0

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
        .overlay(alignment: .top) { top }
        .overlay(alignment: .bottom) { bottom }
        .foregroundStyle(.white)
        .clipped()
        // Leaving the step behind leaves its zoom behind.
        .onChange(of: isCurrent) { if scale > 1 { resetZoom() } }
        .sheet(isPresented: $reading) {
            StepTextSheet(step: step, day: day, calendar: calendar)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Photos

    /// Black between photos while swiping, like the Photos app.
    private static let gap: CGFloat = 20
    private static let maxZoom: CGFloat = 4

    /// Paged like the Photos app: one photo per swipe with the system's own
    /// paging, a gap between photos, and the blurred backdrop standing
    /// still and fading instead of sliding along.
    private var photoPager: some View {
        ZStack {
            backdrop
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(Array(step.photos.enumerated()), id: \.element.id) { offset, photo in
                        page(photo, offset: offset)
                            .frame(width: size.width, height: size.height)
                            .clipped()
                            // The gap sits after each photo, outside the screen at rest.
                            .padding(.trailing, Self.gap)
                    }
                }
                .scrollTargetLayout()
            }
            .frame(width: size.width + Self.gap)
            .frame(width: size.width, alignment: .leading)
            .scrollTargetBehavior(.paging)
            .scrollIndicators(.hidden)
            .scrollDisabled(scale > 1)
            .scrollPosition($position)
            // Taken over once the scroll has settled, like the steps.
            .onScrollPhaseChange { _, phase in
                guard phase == .idle, let id = position.viewID(type: Int.self),
                      let shown = step.photos.firstIndex(where: { $0.id == id }), shown != index
                else { return }
                index = shown
            }
            .onChange(of: index, initial: true) { old, index in
                guard step.photos.indices.contains(index) else { return }
                let id = step.photos[index].id
                guard position.viewID(type: Int.self) != id else { return }
                if old == index {
                    position.scrollTo(id: id)
                } else {
                    withAnimation(.smooth(duration: 0.35)) { position.scrollTo(id: id) }
                }
            }
        }
    }

    /// The shown photo, blurred, behind everything – it fades from photo to
    /// photo instead of sliding with them.
    private var backdrop: some View {
        Color.black
            .overlay {
                if let photo {
                    RemoteImage(account: account, photo: photo, variant: .thumb)
                        .blur(radius: 40)
                        .opacity(0.55)
                        .id(photo.id)
                        .transition(.opacity)
                }
            }
            .clipped()
            .animation(.easeInOut(duration: 0.35), value: photo?.id)
            .allowsHitTesting(false)
    }

    private func page(_ photo: Components.Schemas.Photo, offset: Int) -> some View {
        VStack(spacing: 12) {
            media(photo, playing: isCurrent && offset == index)
                .aspectRatio(Self.aspectRatio(of: photo), contentMode: .fit)
                .contextMenu {
                    if photo.mediaType == .photo { PhotoMenu(account: account, photo: photo) }
                }
                .scaleEffect(offset == index ? scale : 1)
                .offset(offset == index ? pan : .zero)
            if let caption = Self.caption(of: photo) {
                // The photo's own note, set like a caption under a print.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "photo")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.7))
                        .accessibilityHidden(true)
                    Text(caption)
                        .italic()
                        .lineLimit(4)
                }
                .font(.callout)
                .foregroundStyle(.white.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
            }
        }
        .padding(.top, topHeight + 4)
        .padding(.bottom, bottomHeight + 4)
        .padding(.leading, insets.leading)
        .padding(.trailing, insets.trailing)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(.rect)
            // A video takes the taps on itself for its sound, all but its edges.
            .gesture(SpatialTapGesture().onEnded { value in
                if scale > 1 {
                    resetZoom()
                } else {
                    value.location.x < size.width / 3 ? previous() : next()
                }
            })
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { value in
                        guard photo.mediaType == .photo else { return }
                        zoom(to: baseScale * value.magnification, around: value.startLocation)
                    }
                    .onEnded { _ in
                        baseScale = scale
                        basePan = pan
                        if scale < 1.05 { resetZoom() }
                    }
            )
            // Looking around, only while zoomed: otherwise the drags page.
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        pan = clamped(CGSize(
                            width: basePan.width + value.translation.width,
                            height: basePan.height + value.translation.height
                        ))
                    }
                    .onEnded { _ in basePan = pan },
                isEnabled: scale > 1
            )
            // A video's own actions (sound, playback controls) stay reachable.
            .accessibilityElement(children: photo.mediaType == .video ? .combine : .ignore)
            .accessibilityLabel(Text(photo.caption ?? String(localized: "Photo \(offset + 1)")))
            .accessibilityAction(named: Text("Next photo"), next)
            .accessibilityAction(named: Text("Previous photo"), previous)
    }

    /// Keeps the spot between the fingers where it is.
    private func zoom(to target: CGFloat, around location: CGPoint) {
        let next = min(max(target, 1), Self.maxZoom)
        let ratio = next / baseScale
        // The photo's middle, which lies between the header and the text.
        let x = location.x - size.width / 2
        let y = location.y - (size.height + topHeight - bottomHeight) / 2
        scale = next
        pan = clamped(CGSize(
            width: x - ratio * (x - basePan.width),
            height: y - ratio * (y - basePan.height)
        ))
        isZoomed = next > 1
    }

    /// As far as the edges of the screen, not further.
    private func clamped(_ pan: CGSize) -> CGSize {
        let width = size.width * (scale - 1) / 2
        let height = size.height * (scale - 1) / 2
        return CGSize(width: min(max(pan.width, -width), width), height: min(max(pan.height, -height), height))
    }

    private func resetZoom() {
        withAnimation(.smooth(duration: 0.25)) {
            scale = 1
            pan = .zero
        }
        baseScale = 1
        basePan = .zero
        isZoomed = false
    }

    private func media(_ photo: Components.Schemas.Photo, playing: Bool) -> some View {
        Group {
            if photo.mediaType == .video {
                StoryVideo(account: account, photo: photo, isActive: playing) { forward in
                    forward ? next() : previous()
                }
            } else {
                RemoteImage(account: account, photo: photo, variant: .large, contentMode: .fit, fallbacks: [.medium, .thumb])
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// No photos: the text is the picture, as large as it fits.
    private var textStory: some View {
        ZStack {
            CoverPlaceholder(seed: step.id, symbolSize: 0)
            if !step.body.isEmpty {
                ClampedText(text: step.body, lines: 10) { reading = true }
                    .font(.title3.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 32)
                    .padding(.top, topHeight + 16)
                    .padding(.bottom, bottomHeight + 16)
                    .padding(.leading, insets.leading)
                    .padding(.trailing, insets.trailing)
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

    private static func caption(of photo: Components.Schemas.Photo) -> String? {
        guard let caption = photo.caption?.trimmingCharacters(in: .whitespacesAndNewlines), !caption.isEmpty
        else { return nil }
        return caption
    }

    private static func aspectRatio(of photo: Components.Schemas.Photo) -> CGFloat? {
        photo.width > 0 && photo.height > 0 ? CGFloat(photo.width) / CGFloat(photo.height) : nil
    }

    /// Bars, then day and place – the step's sender, standing still while
    /// the photos move.
    private var top: some View {
        VStack(alignment: .leading, spacing: 10) {
            progress
            VStack(alignment: .leading, spacing: 2) {
                StepDayLine(day: day, date: step.occurredAt, calendar: calendar)
                    .foregroundStyle(.white.opacity(0.85))
                if let place = step.placeName {
                    Text(place)
                        .font(.title2.bold())
                        .lineLimit(2)
                }
            }
            .padding(.horizontal, 20)
            .shadow(color: .black.opacity(0.35), radius: 4)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
        }
        .padding(.top, insets.top + 6)
        .padding(.bottom, 12)
        .padding(.leading, insets.leading)
        .padding(.trailing, insets.trailing)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { topHeight = $0 }
        .background {
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
        }
    }

    private var bottom: some View {
        VStack(alignment: .leading, spacing: 12) {
            // On a text story the text is the picture already.
            if !step.photos.isEmpty && !step.body.isEmpty {
                ClampedText(text: step.body, lines: 3) { reading = true }
                    .font(.body)
                    .lineSpacing(3)
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(maxWidth: .infinity, alignment: .leading)
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
        .padding(.top, 12)
        .padding(.bottom, insets.bottom + 12)
        .padding(.leading, insets.leading)
        .padding(.trailing, insets.trailing)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bottomHeight = $0 }
        .background {
            LinearGradient(colors: [.clear, .black.opacity(0.5)], startPoint: .top, endPoint: .bottom)
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

/// Text cut to `lines`. When anything was cut, the last line fades out
/// and ends in a bold "… more", like captions in Instagram or WhatsApp,
/// and the whole text opens `more` – a separate button in the row below
/// was easy to miss.
struct ClampedText: View {
    let text: String
    let lines: Int
    let more: () -> Void

    @State private var full: CGFloat = 0
    @State private var shown: CGFloat = 0
    @State private var lineHeight: CGFloat = 0
    @State private var moreWidth: CGFloat = 0

    private var truncated: Bool { full > shown + 1 }

    /// Paragraphs run on in the preview, or "more" could end up on an empty
    /// line between them; the reading sheet keeps them.
    private var flowing: String {
        text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }.joined(separator: " ")
    }

    var body: some View {
        Text(flowing)
            .lineLimit(lines)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { shown = $0 }
            .background {
                Text(flowing)
                    .fixedSize(horizontal: false, vertical: true)
                    .hidden()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { full = $0 }
                Text(verbatim: "X")
                    .hidden()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { lineHeight = $0 }
            }
            .mask {
                if truncated {
                    VStack(spacing: 0) {
                        Rectangle()
                        HStack(spacing: 0) {
                            Rectangle()
                            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                                .frame(width: 40)
                            Color.clear.frame(width: moreWidth)
                        }
                        .frame(height: lineHeight)
                    }
                } else {
                    Rectangle()
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if truncated {
                    (Text(verbatim: "… ") + Text("more").fontWeight(.bold))
                        .foregroundStyle(.white)
                        .fixedSize()
                        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { moreWidth = $0 }
                }
            }
            .contentShape(.rect)
            .onTapGesture { if truncated { more() } }
            .accessibilityAction(named: Text("Read more")) { if truncated { more() } }
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

/// The comments of a step, with the field to write one right below them,
/// like in Messages. Sending needs a connection ([D19]).
struct StepCommentsSheet: View {
    let account: Account
    let step: Components.Schemas.Step
    let isAuthor: Bool
    let delete: (Components.Schemas.Comment) -> Void
    let refresh: () async -> Void

    @Environment(AppModel.self) private var model
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    if step.comments.isEmpty {
                        Text("No comments yet")
                            .foregroundStyle(.secondary)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(step.comments, id: \.id) { comment in
                        CommentRow(comment: comment)
                            .id(comment.id)
                            .swipeActions {
                                if isAuthor {
                                    Button("Delete comment", systemImage: "trash", role: .destructive) { delete(comment) }
                                }
                            }
                            .contextMenu {
                                Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = comment.body }
                                if isAuthor {
                                    Button("Delete comment", systemImage: "trash", role: .destructive) { delete(comment) }
                                }
                            }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: step.comments.last?.id) { _, id in
                    if let id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } }
                }
            }
            .safeAreaBar(edge: .bottom) { inputBar }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var inputBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 6)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Comment as \(account.displayName)", text: $text, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 20))
                Button(action: send) {
                    Group {
                        if sending {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.body.weight(.semibold))
                        }
                    }
                    .frame(width: 26, height: 26)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .disabled(trimmed.isEmpty || sending)
                .accessibilityLabel(Text("Send"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func send() {
        sending = true
        error = nil
        Task {
            defer { sending = false }
            do {
                _ = try await model.client(for: account).comment(stepID: step.id, body: trimmed)
                text = ""
                await refresh()
            } catch {
                self.error = ErrorText.message(for: error)
            }
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
