import Foundation

/// The upload queue's folder: prepared files, previews and the multipart
/// bodies the background sessions send. It lives in the app group, so the
/// Share Extension can hand files over that the app later keeps track of.
public struct QueueFiles: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Moves a prepared file (and its poster and preview) into the folder
    /// and describes it as an upload.
    func adopt(
        _ item: UploadQueue.NewMedia,
        accountID: UUID,
        tripID: Int,
        index: Int,
        stepClientUUID: String?,
        now: Date
    ) throws -> PendingUpload {
        let uuid = UUID().uuidString.lowercased()
        let fileName = "\(uuid).\(item.file.pathExtension.isEmpty ? "bin" : item.file.pathExtension)"
        try FileManager.default.moveItem(at: item.file, to: url(fileName))
        var posterName: String?
        if let poster = item.poster {
            posterName = "\(uuid)-poster.jpg"
            try FileManager.default.moveItem(at: poster, to: url(posterName!))
        }
        var thumbnailName: String?
        if let thumbnail = item.thumbnail {
            thumbnailName = "\(uuid)-thumb.jpg"
            try FileManager.default.moveItem(at: thumbnail, to: url(thumbnailName!))
        }
        let size = (try? url(fileName).resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return PendingUpload(
            clientUUID: uuid,
            accountID: accountID,
            tripID: tripID,
            stepClientUUID: stepClientUUID,
            stepID: nil,
            sortIndex: index,
            assetID: item.assetID,
            fileName: fileName,
            posterName: posterName,
            thumbnailName: thumbnailName,
            mime: item.mime,
            durationMs: item.durationMs,
            byteCount: Int64(size),
            state: .queued,
            attempts: 0,
            notBefore: nil,
            lastError: nil,
            photoID: nil,
            createdAt: now,
            caption: item.caption
        )
    }

    /// The multipart body is written once and kept until the upload
    /// succeeded, so retries don't need the original files any more.
    func bodyFile(for upload: PendingUpload) throws -> (url: URL, contentType: String) {
        let body = url("\(upload.clientUUID).body")
        let boundaryFile = url("\(upload.clientUUID).boundary")
        if FileManager.default.fileExists(atPath: body.path(percentEncoded: false)),
           let boundary = try? String(contentsOf: boundaryFile, encoding: .utf8)
        {
            return (body, MultipartBody(boundary: boundary).contentType)
        }

        let multipart = MultipartBody()
        let file = url(upload.fileName)
        var parts: [MultipartBody.Part] = [
            .field(name: "clientUuid", value: upload.clientUUID),
            .file(name: "file", fileName: upload.fileName, mime: upload.mime, url: file),
        ]
        if let poster = upload.posterName {
            parts.append(.file(name: "poster", fileName: poster, mime: "image/jpeg", url: url(poster)))
        }
        if let duration = upload.durationMs {
            parts.append(.field(name: "durationMs", value: String(duration)))
        }
        if let caption = upload.caption, !caption.isEmpty {
            parts.append(.field(name: "caption", value: caption))
        }
        try multipart.write(parts, to: body)
        try multipart.boundary.write(to: boundaryFile, atomically: true, encoding: .utf8)

        // The body holds everything now.
        try? FileManager.default.removeItem(at: file)
        if let poster = upload.posterName {
            try? FileManager.default.removeItem(at: url(poster))
        }
        return (body, multipart.contentType)
    }

    func removeFiles(of upload: PendingUpload) {
        for name in [
            upload.fileName, upload.posterName, upload.thumbnailName,
            "\(upload.clientUUID).body", "\(upload.clientUUID).boundary",
        ] {
            guard let name else { continue }
            try? FileManager.default.removeItem(at: url(name))
        }
    }

    func url(_ name: String) -> URL {
        directory.appending(path: name)
    }
}
