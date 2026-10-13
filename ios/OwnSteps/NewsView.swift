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
                        .listRowBackground(entry.read ? nil : Color.accentColor.opacity(0.08))
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("News")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
    }
}

private struct NewsRow: View {
    let entry: NewsEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: entry.kind == .step ? "mappin.and.ellipse" : "bubble.left")
                .foregroundStyle(.tint)
                .frame(width: 24)
                .overlay(alignment: .topTrailing) {
                    if !entry.read {
                        Circle().fill(.red).frame(width: 8, height: 8).offset(x: 4, y: -2)
                    }
                }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.at.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(entry.kind == .step ? String(localized: "New step: \(entry.title)") : entry.title)
                    .font(.body.weight(entry.read ? .regular : .semibold))
                    .lineLimit(1)
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
