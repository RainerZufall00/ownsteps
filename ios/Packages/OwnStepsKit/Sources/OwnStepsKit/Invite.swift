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

/// What the bell lists and background refresh notifies about ([D16]): readers hear about
/// new steps, authors about comments from others. Decided by comparing the
/// trip as the device last saw it with the fresh copy – the change feed
/// doesn't say who did something, and edits shouldn't ring.
public enum TripNews {
    public struct Item: Sendable, Equatable {
        public enum Kind: String, Sendable, Equatable { case step, comment }
        public let kind: Kind
        /// The step's or the comment's ID.
        public let id: Int
        public let tripID: Int
        public let stepID: Int
        public let title: String
        public let body: String
        /// When it was written on the server.
        public let at: Date
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
                    kind: .step, id: step.id, tripID: new.id, stepID: step.id,
                    title: step.placeName.map { "\(new.title) · \($0)" } ?? new.title,
                    body: excerpt(step.body), at: step.updatedAt
                )
            }
        }
        let known = Set(old.steps.flatMap(\.comments).map(\.id))
        return new.steps.flatMap { step in
            step.comments
                .filter { !known.contains($0.id) && !isOwn($0, ownName: ownName) }
                .map { comment in
                    Item(
                        kind: .comment, id: comment.id, tripID: new.id, stepID: step.id,
                        title: "\(comment.authorName) · \(new.title)",
                        body: excerpt(comment.body), at: comment.createdAt
                    )
                }
        }
    }

    /// The server knows who wrote it; only older ones leave the name to go
    /// by – which anyone may pick.
    private static func isOwn(_ comment: Components.Schemas.Comment, ownName: String) -> Bool {
        comment.isOwn ?? (comment.authorName == ownName)
    }

    static func excerpt(_ text: String, limit: Int = 180) -> String {
        let flat = text.split(whereSeparator: \.isNewline).joined(separator: " ")
        return flat.count > limit ? String(flat.prefix(limit - 1)) + "…" : flat
    }
}
