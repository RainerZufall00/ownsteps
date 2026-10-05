import OwnStepsKit
import SwiftUI

/// Changing a step the server has. Needs a connection – offline, only new
/// steps can be written ([D19]).
struct EditStepView: View {
    let account: Account
    let step: Components.Schemas.Step
    let onChange: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var bodyText: String
    @State private var placeName: String
    @State private var date: Date
    @State private var captions: [Int: String]
    @State private var removedPhotos: Set<Int> = []
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false

    init(account: Account, step: Components.Schemas.Step, onChange: @escaping () -> Void) {
        self.account = account
        self.step = step
        self.onChange = onChange
        _bodyText = State(initialValue: step.body)
        _placeName = State(initialValue: step.placeName ?? "")
        _date = State(initialValue: step.occurredAt)
        _captions = State(initialValue: Dictionary(uniqueKeysWithValues: step.photos.map { ($0.id, $0.caption ?? "") }))
    }

    private var calendar: TripCalendar { model.calendar(for: account) }

    var body: some View {
        NavigationStack {
            Form {
                Section("What happened?") {
                    TextField("Tell about this day …", text: $bodyText, axis: .vertical)
                        .lineLimit(4...12)
                }
                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                        .environment(\.timeZone, calendar.calendar.timeZone)
                    TextField("Place (optional)", text: $placeName)
                }

                let photos = step.photos.filter { !removedPhotos.contains($0.id) }
                if !photos.isEmpty {
                    Section("Photos") {
                        ForEach(photos, id: \.id) { photo in
                            HStack(spacing: 12) {
                                RemoteImage(account: account, photo: photo, variant: .thumb)
                                    .frame(width: 56, height: 56)
                                    .clipShape(.rect(cornerRadius: 8))
                                TextField("Caption (optional)", text: Binding(
                                    get: { captions[photo.id] ?? "" },
                                    set: { captions[photo.id] = $0 }
                                ), axis: .vertical)
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets { removedPhotos.insert(photos[index].id) }
                        }
                    }
                }

                Section {
                    Button("Delete step", role: .destructive) { confirmDelete = true }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Edit step")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(busy)
                }
            }
            .disabled(busy)
            .overlay { if busy { ProgressView().controlSize(.large) } }
            .confirmationDialog("Delete this step with all its photos?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete step", role: .destructive, action: delete)
            }
        }
    }

    private func save() {
        run {
            let client = model.client(for: account)
            let dayChanged = !calendar.calendar.isDate(date, inSameDayAs: step.occurredAt)
            _ = try await client.updateStep(id: step.id, .init(
                body: bodyText,
                // An empty string clears the place.
                placeName: placeName.trimmingCharacters(in: .whitespaces),
                // The server keeps the time of day from the photos and only
                // swaps the date.
                occurredDate: dayChanged ? calendar.calendarDay(of: date) : nil
            ))
            for photo in step.photos where removedPhotos.contains(photo.id) {
                try await client.deletePhoto(id: photo.id)
            }
            for photo in step.photos where !removedPhotos.contains(photo.id) {
                let caption = captions[photo.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if caption != (photo.caption ?? "") {
                    _ = try await client.updateCaption(photoID: photo.id, caption: caption)
                }
            }
        }
    }

    private func delete() {
        run { try await model.client(for: account).deleteStep(id: step.id) }
    }

    private func run(_ action: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await action()
                onChange()
                dismiss()
            } catch {
                self.error = ErrorText.message(for: error)
            }
        }
    }
}
