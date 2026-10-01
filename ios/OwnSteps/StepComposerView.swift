import CoreLocation
import OwnStepsKit
import PhotosUI
import SwiftUI

/// Writing a step – also without a connection ([D19]). Everything goes into
/// the upload queue on save; the queue brings it to the server when it can.
/// In `addTo` mode it only adds photos to an existing step.
struct StepComposerView: View {
    enum Mode: Equatable {
        case new(tripID: Int)
        case addTo(tripID: Int, stepID: Int)
    }

    let account: Account
    let mode: Mode

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage("uploadOriginalVideos") private var originalVideos = false

    @State private var selection: [PhotosPickerItem] = []
    @State private var prepared: [PhotosPickerItem: PreparedMedia] = [:]
    @State private var preparing = false
    @State private var bodyText = ""
    @State private var placeName = ""
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var date = Date()
    @State private var dateTouched = false
    @State private var locating = false
    @State private var error: String?

    private var isNew: Bool { if case .new = mode { true } else { false } }
    private var calendar: TripCalendar { model.calendar(for: account) }

    private var canSave: Bool {
        guard !preparing, !locating else { return false }
        if isNew {
            return !selection.isEmpty || !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !placeName.trimmingCharacters(in: .whitespaces).isEmpty
        }
        return !selection.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    PhotosPicker(
                        selection: $selection,
                        matching: .any(of: [.images, .videos]),
                        preferredItemEncoding: .current,
                        photoLibrary: .shared()
                    ) {
                        Label(selection.isEmpty ? "Add photos or videos" : "Change selection", systemImage: "photo.on.rectangle.angled")
                    }
                    if !selection.isEmpty {
                        PreviewStrip(items: selection, prepared: prepared)
                    }
                    if preparing {
                        Label("Preparing photos …", systemImage: "hourglass")
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    if originalVideos {
                        Text("Videos are uploaded in original quality (see Settings).")
                    }
                }

                if isNew {
                    Section("What happened?") {
                        TextField("Tell about this day …", text: $bodyText, axis: .vertical)
                            .lineLimit(4...12)
                    }

                    Section {
                        DatePicker(
                            "Date",
                            selection: Binding(get: { date }, set: { date = $0; dateTouched = true }),
                            displayedComponents: .date
                        )
                        .environment(\.timeZone, calendar.calendar.timeZone)
                        TextField("Place (optional)", text: $placeName)
                        Button {
                            useCurrentLocation()
                        } label: {
                            HStack {
                                Label("Use my location", systemImage: "location")
                                if locating { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(locating)
                        if let coordinate {
                            Text(String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude))
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    } footer: {
                        Text("Place and date come from the photos when they carry them.")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(isNew ? "New step" : "Add photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) {
                        discardPrepared(Array(prepared.values))
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(!canSave)
                }
            }
            .onChange(of: selection) { prepareSelection() }
            .interactiveDismissDisabled(preparing || !selection.isEmpty || !bodyText.isEmpty)
        }
    }

    /// Prepares new picks right away, so saving is instant and the date can
    /// default to the earliest photo.
    private func prepareSelection() {
        let removed = prepared.keys.filter { !selection.contains($0) }
        discardPrepared(removed.compactMap { prepared.removeValue(forKey: $0) })
        let missing = selection.filter { prepared[$0] == nil }
        guard !missing.isEmpty else { return }

        preparing = true
        error = nil
        Task {
            defer { preparing = false }
            do {
                let results = try await MediaImporter.prepare(
                    missing,
                    timeZone: calendar.calendar.timeZone,
                    originalVideos: originalVideos,
                    progress: { _ in }
                )
                for (item, result) in zip(missing, results) { prepared[item] = result }
                if !dateTouched, let earliest = prepared.values.compactMap(\.captureDate).min() {
                    date = earliest
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func useCurrentLocation() {
        locating = true
        error = nil
        Task {
            defer { locating = false }
            do {
                let location = try await CurrentLocation.fetch()
                coordinate = location.coordinate
                if placeName.trimmingCharacters(in: .whitespaces).isEmpty,
                   let name = await CurrentLocation.placeName(for: location)
                {
                    placeName = name
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func save() {
        let media = selection.compactMap { prepared[$0]?.media }
        do {
            guard media.count == selection.count else { throw MediaImporter.Problem.unreadable }
            switch mode {
            case .new(let tripID):
                enqueueNew(tripID: tripID, media: media)
            case .addTo(let tripID, let stepID):
                Task {
                    try? await model.uploads.enqueueMedia(accountID: account.id, tripID: tripID, stepID: stepID, media: media)
                    model.resumeUploads()
                }
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func enqueueNew(tripID: Int, media: [UploadQueue.NewMedia]) {
        let (body, place, coordinate, date) = (bodyText, placeName, coordinate, date)
        let uploads = model.uploads
        let accountID = account.id
        Task {
            try? await uploads.enqueueStep(
                accountID: accountID,
                tripID: tripID,
                body: body,
                placeName: place,
                lat: coordinate?.latitude,
                lon: coordinate?.longitude,
                occurredAt: date,
                media: media
            )
            model.resumeUploads()
        }
    }

    private func discardPrepared(_ items: [PreparedMedia]) {
        for item in items {
            for url in [item.media.file, item.media.poster, item.media.thumbnail].compactMap({ $0 }) {
                try? FileManager.default.removeItem(at: url)
            }
        }
    }
}

/// The picked photos as small squares, filled in as they're prepared.
private struct PreviewStrip: View {
    let items: [PhotosPickerItem]
    let prepared: [PhotosPickerItem: PreparedMedia]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(items, id: \.self) { item in
                    ZStack {
                        if let url = prepared[item]?.media.thumbnail, let image = UIImage(contentsOfFile: url.path(percentEncoded: false)) {
                            Image(uiImage: image).resizable().scaledToFill()
                        } else {
                            Rectangle().fill(.quaternary)
                            ProgressView()
                        }
                        if prepared[item]?.media.mime.hasPrefix("video/") == true {
                            Image(systemName: "play.circle.fill").foregroundStyle(.white, .black.opacity(0.4))
                        }
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(.rect(cornerRadius: 8))
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}
