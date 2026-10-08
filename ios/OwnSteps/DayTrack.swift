import OwnStepsKit
import SwiftUI

/// The trip as a blue bar above the step cards, like Polarsteps: filled up
/// to the step in view, with "Day n" riding on its end. Dragging along it
/// scrubs through the steps – the cards and the map follow.
struct DayTrack: View {
    let items: [TimelineItem]
    let start: Date?
    let end: Date?
    @Binding var focusedItem: String?

    static let height: CGFloat = 40
    private static let blue = Color(red: 0.16, green: 0.52, blue: 1)

    /// The step in view; before the pager reported one, the newest.
    private var current: TimelineItem? {
        items.first { $0.id == focusedItem } ?? items.last
    }

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let fraction = current.map(fraction(of:)) ?? 1
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.black.opacity(0.35))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 0.5))
                    .frame(height: 6)
                Capsule()
                    .fill(LinearGradient(colors: [Self.blue.opacity(0.7), Self.blue], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(6, width * fraction), height: 6)
                    .shadow(color: Self.blue.opacity(0.6), radius: 4)
                thumb
                    .fixedSize()
                    .position(x: thumbCenter(width: width, fraction: fraction), y: geometry.size.height / 2)
            }
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        select(at: min(max(value.location.x / max(width, 1), 0), 1))
                    }
            )
            .animation(.smooth(duration: 0.3), value: focusedItem)
        }
        .frame(height: Self.height)
        .accessibilityElement()
        .accessibilityLabel(Text("Trip progress"))
        .accessibilityValue(current?.day.map { Text("Day \($0)") } ?? Text(verbatim: ""))
        .accessibilityAdjustableAction { direction in
            guard let index = items.firstIndex(where: { $0.id == current?.id }) else { return }
            let next = direction == .increment ? index + 1 : index - 1
            if items.indices.contains(next) { focusedItem = items[next].id }
        }
    }

    private var thumb: some View {
        HStack(spacing: 5) {
            Image(systemName: "figure.walk")
            if let day = current?.day {
                Text("Day \(day)")
                    .contentTransition(.numericText())
            }
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Self.blue, in: .capsule)
        .overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 1))
        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
    }

    /// Where on the bar a step lies: by time, from the trip's start to its
    /// end (or its last step).
    private func fraction(of item: TimelineItem) -> CGFloat {
        guard let start, let end, end > start else { return 1 }
        return CGFloat(min(max(item.date.timeIntervalSince(start) / end.timeIntervalSince(start), 0), 1))
    }

    /// The pill stays on the bar even at its very ends.
    private func thumbCenter(width: CGFloat, fraction: CGFloat) -> CGFloat {
        let half: CGFloat = 44
        return min(max(width * fraction, half), width - half)
    }

    /// The step nearest to a point on the bar.
    private func select(at fraction: CGFloat) {
        guard let nearest = items.min(by: {
            abs(self.fraction(of: $0) - fraction) < abs(self.fraction(of: $1) - fraction)
        }) else { return }
        if focusedItem != nearest.id { focusedItem = nearest.id }
    }
}
