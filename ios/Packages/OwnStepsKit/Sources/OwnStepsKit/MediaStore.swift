import Foundation

/// Loads photos with the account's token and keeps them on disk. A photo's
/// files never change (`storage_key` is unique per upload), so a cached file
/// is valid forever; deleting the photo only means it isn't asked for again.
public actor MediaStore {
    private let directory: URL
    private let session: URLSession
    private let memory = NSCache<NSString, NSData>()

    public init(directory: URL, session: URLSession = .shared) {
        self.directory = directory
        self.session = session
        memory.totalCostLimit = 64 * 1024 * 1024
    }

    private func fileURL(accountID: UUID, photoID: Int, variant: MediaVariant) -> URL {
        directory
            .appending(path: accountID.uuidString, directoryHint: .isDirectory)
            .appending(path: "\(photoID)-\(variant.rawValue).webp")
    }

    /// From memory, from disk, or from the server – in that order.
    public func data(
        accountID: UUID,
        photoID: Int,
        variant: MediaVariant,
        request: URLRequest
    ) async throws -> Data {
        let file = fileURL(accountID: accountID, photoID: photoID, variant: variant)
        let key = file.path as NSString
        if let cached = memory.object(forKey: key) { return cached as Data }
        if let data = try? Data(contentsOf: file) {
            memory.setObject(data as NSData, forKey: key, cost: data.count)
            return data
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.unexpected(status: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        try? FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? data.write(to: file, options: .atomic)
        memory.setObject(data as NSData, forKey: key, cost: data.count)
        return data
    }

    /// Only what's already on the device – for offline fallbacks.
    public func cachedData(accountID: UUID, photoID: Int, variant: MediaVariant) -> Data? {
        let file = fileURL(accountID: accountID, photoID: photoID, variant: variant)
        if let cached = memory.object(forKey: file.path as NSString) { return cached as Data }
        return try? Data(contentsOf: file)
    }

    public func removeAll(for accountID: UUID) {
        memory.removeAllObjects()
        try? FileManager.default.removeItem(
            at: directory.appending(path: accountID.uuidString, directoryHint: .isDirectory)
        )
    }
}
