import Foundation

/// Library photos from a trip's period that aren't in the trip yet ([D22]).
/// The Photos framework stays in the app; this decides which of its assets
/// count, so the rules can be tested.
public enum PhotoSuggestions {
    /// What the app knows about a library asset.
    public struct Candidate: Sendable, Equatable, Identifiable {
        public var id: String
        public var creationDate: Date
        public var pixelWidth: Int
        public var pixelHeight: Int
        public var durationMs: Int?

        public init(id: String, creationDate: Date, pixelWidth: Int, pixelHeight: Int, durationMs: Int? = nil) {
            self.id = id
            self.creationDate = creationDate
            self.pixelWidth = pixelWidth
            self.pixelHeight = pixelHeight
            self.durationMs = durationMs
        }
    }

    /// How long after its last step a trip without an end date still
    /// collects photos – an ongoing trip shouldn't suggest a whole year later.
    public static let openEndGrace: TimeInterval = 14 * 24 * 3600

    /// The trip's period: the entered dates if there are any, else its steps
    /// ([E14]). Without an end date it runs until now, at most two weeks past
    /// the last step.
    public static func window(
        startDate: String?,
        endDate: String?,
        firstStepAt: Date?,
        lastStepAt: Date?,
        calendar: TripCalendar,
        now: Date
    ) -> DateInterval? {
        let cal = calendar.calendar
        guard let startDay = calendar.date(fromCalendarDay: startDate) ?? firstStepAt.map(cal.startOfDay(for:)) else {
            return nil
        }
        let end: Date
        if let endDay = calendar.date(fromCalendarDay: endDate),
           let nextDay = cal.date(byAdding: .day, value: 1, to: endDay)
        {
            end = nextDay
        } else {
            let latest = max(lastStepAt ?? startDay, startDay)
            end = min(now, latest.addingTimeInterval(openEndGrace))
        }
        guard end > startDay else { return nil }
        return DateInterval(start: startDay, end: end)
    }

    /// The candidates left after taking out what this device uploaded, what
    /// the user dismissed and what looks like a photo already on the server.
    public static func filter(
        _ candidates: [Candidate],
        uploaded: Set<String>,
        ignored: Set<String>,
        serverPhotos: [Components.Schemas.Photo]
    ) -> [Candidate] {
        candidates.filter { candidate in
            !uploaded.contains(candidate.id)
                && !ignored.contains(candidate.id)
                && !serverPhotos.contains { isSameMedia(candidate, $0) }
        }
    }

    /// Photos uploaded some other way – the web, before the app existed –
    /// aren't in `uploaded_asset`. They're recognized by capture time plus
    /// size (photos) or length (videos). The server reads EXIF time in its
    /// own zone ([E12]), so the times may differ by whole quarter hours of
    /// zone offset; seconds must match.
    static func isSameMedia(_ candidate: Candidate, _ photo: Components.Schemas.Photo) -> Bool {
        guard let takenAt = photo.takenAt else { return false }
        let difference = abs(candidate.creationDate.timeIntervalSince(takenAt))
        guard difference <= 14 * 3600 else { return false }
        let offByZone = difference.truncatingRemainder(dividingBy: 900)
        guard offByZone <= 1.5 || offByZone >= 898.5 else { return false }

        if photo.mediaType == .video {
            guard let candidateMs = candidate.durationMs, let serverMs = photo.durationMs else { return false }
            return abs(candidateMs - serverMs) <= 1000
        }
        let same = candidate.pixelWidth == photo.width && candidate.pixelHeight == photo.height
        let turned = candidate.pixelWidth == photo.height && candidate.pixelHeight == photo.width
        return same || turned
    }
}
