import Foundation

/// An invitation to follow a trip ([D18]): the trip's share link, as it
/// comes from `ownsteps://join?url=…`, a pasted link or a scanned QR code.
/// The server is wherever the link points, minus `/s/<token>`.
public struct Invite: Sendable, Hashable, Identifiable {
    public let shareLink: URL
    public let serverURL: URL

    public var id: String { shareLink.absoluteString }

    public init?(_ url: URL) {
        if url.scheme == "ownsteps" {
            guard url.host() == "join",
                  let inner = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                      .queryItems?.first(where: { $0.name == "url" })?.value,
                  let link = URL(string: inner)
            else { return nil }
            self.init(shareLink: link)
        } else {
            self.init(shareLink: url)
        }
    }

    /// Text the user pasted – with or without `https://`.
    public init?(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: withScheme) else { return nil }
        self.init(url)
    }

    private init?(shareLink: URL) {
        // Only a share link invites; a bare server address doesn't.
        guard let range = shareLink.path().range(of: "/s/"),
              !shareLink.path()[range.upperBound...].isEmpty,
              let server = try? ServerAddress.normalize(shareLink.absoluteString)
        else { return nil }
        self.shareLink = shareLink
        self.serverURL = server
    }
}

/// What background refresh tells the user about ([D16]): readers hear about
/// new steps, authors about comments from others. Decided by comparing the
/// trip as the device last saw it with the fresh copy – the change feed
/// doesn't say who did something, and edits shouldn't ring.
public enum TripNews {
    public struct Item: Sendable, Equatable {
        public enum Kind: Sendable, Equatable { case step, comment }
        public let kind: Kind
        public let tripID: Int
        public let stepID: Int
        public let title: String
        public let body: String
    }

    public static func items(
        old: Components.Schemas.TripDetail?,
        new: Components.Schemas.TripDetail,
        reader: Bool,
        ownName: String
    ) -> [Item] {
        // Never seen before: nothing to compare with, so nothing is "new".
        guard let old else { return [] }
        if reader {
            let known = Set(old.steps.map(\.id))
            return new.steps.filter { !known.contains($0.id) }.map { step in
                Item(
                    kind: .step, tripID: new.id, stepID: step.id,
                    title: step.placeName.map { "\(new.title) · \($0)" } ?? new.title,
                    body: excerpt(step.body)
                )
            }
        }
        let known = Set(old.steps.flatMap(\.comments).map(\.id))
        return new.steps.flatMap { step in
            step.comments
                .filter { !known.contains($0.id) && $0.authorName != ownName }
                .map { comment in
                    Item(
                        kind: .comment, tripID: new.id, stepID: step.id,
                        title: "\(comment.authorName) · \(new.title)",
                        body: excerpt(comment.body)
                    )
                }
        }
    }

    static func excerpt(_ text: String, limit: Int = 180) -> String {
        let flat = text.split(whereSeparator: \.isNewline).joined(separator: " ")
        return flat.count > limit ? String(flat.prefix(limit - 1)) + "…" : flat
    }
}
