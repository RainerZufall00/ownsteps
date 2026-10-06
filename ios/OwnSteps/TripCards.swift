import OwnStepsKit
import SwiftUI

/// A trip as a large cover card: the lead photo edge to edge, title and
/// dates on a shade at the bottom.
struct TripCard: View {
    let account: Account
    let trip: Components.Schemas.Trip
    let calendar: TripCalendar
    /// Shown as a glass badge in the corner, e.g. the server of a followed trip.
    var badge: String?

    var body: some View {
        Color.clear
            .frame(height: 230)
            .overlay { TripCover(account: account, trip: trip, variant: .medium) }
            .overlay {
                LinearGradient(
                    stops: [.init(color: .clear, location: 0.35), .init(color: .black.opacity(0.72), location: 1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(trip.title)
                        .font(.title2.bold())
                        .lineLimit(2)
                    TripMetaLine(trip: trip, calendar: calendar)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
                .padding(18)
            }
            .overlay(alignment: .topLeading) {
                if let badge {
                    Label(badge, systemImage: "person.2.fill")
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .glassEffect(.regular, in: .capsule)
                        .environment(\.colorScheme, .dark)
                        .padding(12)
                }
            }
            .clipShape(.rect(cornerRadius: 26))
            .contentShape(.rect(cornerRadius: 26))
    }
}

/// A trip in the iPad sidebar: small cover, title, dates.
struct TripSidebarRow: View {
    let account: Account
    let trip: Components.Schemas.Trip
    let calendar: TripCalendar
    var caption: String?

    var body: some View {
        HStack(spacing: 12) {
            Color.clear
                .frame(width: 56, height: 56)
                .overlay { TripCover(account: account, trip: trip, variant: .thumb, symbolSize: 20) }
                .clipShape(.rect(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
                Text(trip.title)
                    .font(.headline)
                    .lineLimit(1)
                if let range = TripDates.range(of: trip, calendar: calendar) {
                    Text(range)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let caption {
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// The trip's lead photo, or a colored placeholder when it has none yet.
struct TripCover: View {
    let account: Account
    let trip: Components.Schemas.Trip
    var variant: MediaVariant = .medium
    var symbolSize: CGFloat = 54

    var body: some View {
        if let cover = trip.cover {
            RemoteImage(account: account, photo: cover, variant: variant)
        } else {
            CoverPlaceholder(seed: trip.id, symbolSize: symbolSize)
        }
    }
}

/// One of a few calm gradients, picked by trip so it stays the same.
struct CoverPlaceholder: View {
    let seed: Int
    var symbolSize: CGFloat = 54

    private static let palettes: [[Color]] = [
        [Color(red: 0.16, green: 0.45, blue: 0.62), Color(red: 0.09, green: 0.22, blue: 0.40)],
        [Color(red: 0.93, green: 0.49, blue: 0.33), Color(red: 0.70, green: 0.24, blue: 0.32)],
        [Color(red: 0.30, green: 0.55, blue: 0.42), Color(red: 0.12, green: 0.30, blue: 0.30)],
        [Color(red: 0.49, green: 0.40, blue: 0.72), Color(red: 0.23, green: 0.18, blue: 0.45)],
    ]

    var body: some View {
        let colors = Self.palettes[abs(seed) % Self.palettes.count]
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay {
                Image(systemName: "map.fill")
                    .font(.system(size: symbolSize, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.22))
            }
    }
}

/// "2–12 May 2026 · 6 steps"
struct TripMetaLine: View {
    let trip: Components.Schemas.Trip
    let calendar: TripCalendar

    var body: some View {
        HStack(spacing: 6) {
            if let range = TripDates.range(of: trip, calendar: calendar) {
                Text(range)
                Text("·")
            }
            Text("\(trip.stepCount) steps")
        }
    }
}

/// Gives cards a slight press-down instead of the highlight of list rows.
struct CardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}

/// "Offline · as of …" under content that couldn't be refreshed.
struct OfflineNote: View {
    let fetchedAt: Date

    var body: some View {
        Label {
            Text("Offline · as of \(fetchedAt.formatted(.relative(presentation: .named)))")
        } icon: {
            Image(systemName: "wifi.slash")
        }
        .font(.footnote)
    }
}

/// Date range like the web shows it: entered dates win over the steps ([E14]).
enum TripDates {
    static func range(of trip: Components.Schemas.Trip, calendar: TripCalendar) -> String? {
        range(
            start: calendar.date(fromCalendarDay: trip.startDate) ?? trip.firstStepAt,
            end: calendar.date(fromCalendarDay: trip.endDate) ?? trip.lastStepAt,
            calendar: calendar
        )
    }

    static func range(start: Date?, end: Date?, calendar: TripCalendar) -> String? {
        guard let start else { return nil }
        var style = Date.IntervalFormatStyle().day().month(.abbreviated).year()
        style.timeZone = calendar.calendar.timeZone
        guard let end, !calendar.calendar.isDate(start, inSameDayAs: end) else {
            return start.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone))
        }
        return (min(start, end)..<max(start, end)).formatted(style)
    }
}
