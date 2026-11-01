import OwnStepsKit
import SwiftUI

/// New comments (authors) and steps (readers) across every trip, newest
/// first ([D16]). Unread ones stand out until the list is closed; opening
/// an entry marks only that one read. A tap opens the trip at that step,
/// like a notification.
struct NewsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let onOpen: (NewsEntry) -> Void

    var body: some View {
        NavigationStack {
            Group {
                if model.newsEntries.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing new yet", systemImage: "bell")
                    } description: {
                        Text("New comments on your trips, and new steps in trips you follow, show up here.")
                    }
                } else {
                    List(model.newsEntries) { entry in
                        Button {
                            model.markRead(entry)
                            onOpen(entry)
                            dismiss()
                        } label: {
                            NewsRow(entry: entry)
                        }
                        .swipeActions(edge: .leading) {
                            if !entry.read {
                                Button("Mark as read", systemImage: "envelope.open") { model.markRead(entry) }
                                    .tint(.accentColor)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("News")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
    }
}

private struct NewsRow: View {
    let entry: NewsEntry

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            // Like Mail: a dot in front of what's unread, nothing else.
            Circle()
                .fill(.tint)
                .frame(width: 9, height: 9)
                .opacity(entry.read ? 0 : 1)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.kind == .step ? String(localized: "New step: \(entry.title)") : entry.title)
                        .font(.body.weight(entry.read ? .regular : .semibold))
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(entry.at.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if !entry.body.isEmpty {
                    Text(entry.body)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
            }
        }
        .foregroundStyle(.primary)
        .accessibilityElement(children: .combine)
        .accessibilityValue(entry.read ? Text(verbatim: "") : Text("Unread"))
    }
}
