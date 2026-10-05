import Foundation

/// Dates the way the web shows them: in the server's time zone, with trip
/// days counted from the entered start date or else the first step ([E14]).
public struct TripCalendar: Sendable {
    public let calendar: Calendar

    public init(timeZone: TimeZone, locale: Locale = .current) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = locale
        self.calendar = calendar
    }

    /// "2026-07-01" as the start of that day in the server's time zone –
    /// not UTC midnight, which would shift the day.
    public func date(fromCalendarDay text: String?) -> Date? {
        guard let text else { return nil }
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// The inverse: the calendar day `date` falls on there, as "2026-07-01".
    public func calendarDay(of date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Day 1 is the trip's start; a step on the start day is day 1.
    public func tripDay(of date: Date, start: Date) -> Int {
        let from = calendar.startOfDay(for: start)
        let to = calendar.startOfDay(for: date)
        return (calendar.dateComponents([.day], from: from, to: to).day ?? 0) + 1
    }

    /// Where day counting starts: the entered start date, else the first step.
    public func tripStart(startDate: String?, firstStepAt: Date?) -> Date? {
        date(fromCalendarDay: startDate) ?? firstStepAt
    }
}
