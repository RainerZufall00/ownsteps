import OwnStepsKit
import PhotosUI
import SwiftUI

/// Creating a trip, or changing its title, dates, summary and cover.
struct TripFormView: View {
    let account: Account
    /// Nil for a new trip.
    let trip: Components.Schemas.Trip?
    let onSaved: (Components.Schemas.Trip) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var summary: String
    @State private var hasStart: Bool
    @State private var start: Date
    @State private var hasEnd: Bool
    @State private var end: Date
    @State private var coverItem: PhotosPickerItem?
    @State private var coverPreview: Image?
    @State private var busy = false
    @State private var error: String?

    init(account: Account, trip: Components.Schemas.Trip?, calendar: TripCalendar, onSaved: @escaping (Components.Schemas.Trip) -> Void) {
        self.account = account
        self.trip = trip
        self.onSaved = onSaved
        _title = State(initialValue: trip?.title ?? "")
        _summary = State(initialValue: trip?.summary ?? "")
        let start = calendar.date(fromCalendarDay: trip?.startDate)
        let end = calendar.date(fromCalendarDay: trip?.endDate)
        _hasStart = State(initialValue: start != nil)
        _start = State(initialValue: start ?? Date())
        _hasEnd = State(initialValue: end != nil)
        _end = State(initialValue: end ?? Date())
    }

    private var calendar: TripCalendar { model.calendar(for: account) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name of the trip", text: $title)
                    TextField("Short description (optional)", text: $summary, axis: .vertical)
                        .lineLimit(2...5)
                }
                Section {
                    Toggle("Start date", isOn: $hasStart.animation())
                    if hasStart {
                        DatePicker("From", selection: $start, displayedComponents: .date)
                    }
                    Toggle("End date", isOn: $hasEnd.animation())
                    if hasEnd {
                        DatePicker("To", selection: $end, in: (hasStart ? start : .distantPast)..., displayedComponents: .date)
                    }
                } footer: {
                    Text("Optional. Without dates, the trip's steps set the period; day 1 is the start date.")
                }
                .environment(\.timeZone, calendar.calendar.timeZone)

                Section {
                    // The label closure is Sendable: read the state outside.
                    let title = trip?.coverPhotoId == nil && coverItem == nil
                        ? String(localized: "Choose cover image") : String(localized: "Change cover image")
                    let preview = coverPreview
                    PhotosPicker(selection: $coverItem, matching: .images, photoLibrary: .shared()) {
                        HStack {
                            Label(title, systemImage: "photo")
                            Spacer()
                            preview?
                                .resizable().scaledToFill()
                                .frame(width: 44, height: 44)
                                .clipShape(.rect(cornerRadius: 6))
                        }
                    }
                } footer: {
                    Text("The cover appears in the overview and in link previews. Unlike the other photos, it's public once the trip is shared.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(trip == nil ? "New trip" : "Edit trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm, action: save)
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .disabled(busy)
            .overlay { if busy { ProgressView().controlSize(.large) } }
            .onChange(of: coverItem) {
                Task {
                    if let data = try? await coverItem?.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        coverPreview = Image(uiImage: image)
                    }
                }
            }
        }
    }

    private func save() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let client = model.client(for: account)
                let startDay = hasStart ? calendar.calendarDay(of: start) : nil
                let endDay = hasEnd ? calendar.calendarDay(of: end) : nil
                var saved: Components.Schemas.Trip
                if let trip {
                    saved = try await client.updateTrip(id: trip.id, .init(
                        title: title,
                        // Empty strings clear a field on the server.
                        summary: summary,
                        startDate: startDay ?? "",
                        endDate: endDay ?? ""
                    ))
                } else {
                    saved = try await client.createTrip(
                        title: title,
                        summary: summary.isEmpty ? nil : summary,
                        startDate: startDay,
                        endDate: endDay
                    )
                }
                if let coverItem, let coverID = try await uploadCover(coverItem, tripID: saved.id, client: client) {
                    saved.coverPhotoId = coverID
                }
                onSaved(saved)
                dismiss()
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }

    /// The cover goes up right away, not through the queue – it's one image
    /// and the form waits for it.
    private func uploadCover(_ item: PhotosPickerItem, tripID: Int, client: ServerClient) async throws -> Int? {
        let prepared = try await MediaImporter.prepare([item], timeZone: calendar.calendar.timeZone, originalVideos: false)
        guard let cover = prepared.first else { return nil }
        defer { cover.discard() }
        return try await client.uploadCover(tripID: tripID, jpeg: cover.media.file)
    }
}
