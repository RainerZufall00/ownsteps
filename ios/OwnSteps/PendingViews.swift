import OwnStepsKit
import SwiftUI

/// A step written on the device that the server doesn't have yet.
struct LocalStepCard: View {
    let account: Account
    let local: UploadSnapshot.LocalStep
    let day: Int?
    let calendar: TripCalendar

    @Environment(AppModel.self) private var model
    @State private var confirmDiscard = false

    private var step: PendingStep { local.step }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            StepHeader(day: day, date: step.occurredAt, calendar: calendar, place: step.placeName) {
                Button("Discard step", systemImage: "trash", role: .destructive) { confirmDiscard = true }
            }

            if !local.uploads.isEmpty {
                LocalThumbnails(uploads: local.uploads)
            }

            if !step.body.isEmpty {
                Text(step.body)
            }

            if let error = step.lastError {
                Label(ErrorText.uploadProblem(error), systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
            } else if local.uploads.isEmpty {
                Label("Waiting to be sent", systemImage: "clock.arrow.circlepath")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                PendingUploadsView(uploads: local.uploads, showThumbnails: false)
            }
        }
        .opacity(0.92)
        .confirmationDialog("Discard this step? It hasn't reached the server.", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard step", role: .destructive) {
                Task { await model.uploads.removeStep(clientUUID: step.clientUUID) }
            }
        }
    }
}

/// Status of uploads still on the way, with retry for the failed ones.
struct PendingUploadsView: View {
    let uploads: [PendingUpload]
    var showThumbnails = true

    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if showThumbnails {
                LocalThumbnails(uploads: uploads)
            }
            let failed = uploads.filter { $0.state == .failed }
            let active = uploads.filter { $0.state != .failed }
            if !active.isEmpty {
                let uploading = active.filter { $0.state == .uploading }
                if uploading.isEmpty {
                    Label(
                        active.contains { $0.lastError != nil } ? "Waiting for a connection" : "Waiting to upload \(active.count) items",
                        systemImage: "clock.arrow.circlepath"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                } else {
                    let total = active.reduce(0.0) { $0 + (model.uploadProgress[$1.id] ?? 0) }
                    ProgressView(value: total / Double(active.count)) {
                        Text("Uploading \(active.count) items …").font(.footnote)
                    }
                }
            }
            ForEach(failed) { upload in
                HStack {
                    Label(ErrorText.uploadProblem(upload.lastError ?? ""), systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.red)
                    Spacer()
                    Button("Retry") { Task { await model.uploads.retry(uploadID: upload.id) } }
                        .font(.footnote)
                    Button("Remove", role: .destructive) { Task { await model.uploads.remove(uploadID: upload.id) } }
                        .font(.footnote)
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

/// Previews of media that only exist on the device so far.
struct LocalThumbnails: View {
    let uploads: [PendingUpload]

    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(uploads) { upload in
                    ZStack {
                        if let url = model.uploads.thumbnailURL(for: upload),
                           let image = UIImage(contentsOfFile: url.path(percentEncoded: false))
                        {
                            Image(uiImage: image).resizable().scaledToFill()
                        } else {
                            Rectangle().fill(.quaternary)
                        }
                        if upload.isVideo {
                            Image(systemName: "play.circle.fill").foregroundStyle(.white, .black.opacity(0.4))
                        }
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(.rect(cornerRadius: 8))
                    .opacity(upload.state == .failed ? 0.5 : 1)
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}
