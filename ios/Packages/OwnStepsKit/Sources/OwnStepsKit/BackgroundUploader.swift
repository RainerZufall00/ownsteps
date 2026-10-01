import Foundation

/// Uploads through a background `URLSession`: they keep running when the
/// app is suspended or the phone is in a pocket ([D20] / Q4 a), and iOS
/// relaunches the app when they finish.
public final class BackgroundUploader: NSObject, UploadTransport, URLSessionDataDelegate, @unchecked Sendable {
    /// The app's own session.
    public static let sessionIdentifier = "ownsteps.uploads"
    /// Prefix of the Share Extension's sessions – one per share, so the
    /// extension and the app never use the same session at the same time.
    public static let shareSessionPrefix = "ownsteps.share."

    public let identifier: String
    private let sharedContainerIdentifier: String?

    /// Set by the app; receives every finished upload.
    public var onCompletion: (@Sendable (String, Int?, Data?, (any Error)?) -> Void)?
    /// Progress per upload ID, 0…1.
    public var onProgress: (@Sendable (String, Double) -> Void)?
    /// Handed over by the app delegate when iOS wakes the app for this session.
    public var backgroundEventsCompletion: (() -> Void)?

    private let lock = NSLock()
    private var responses: [Int: Data] = [:]

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: identifier)
        // The user asked for it – don't wait for Wi-Fi and a charger.
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        // An extension's session needs this to upload from the app group.
        configuration.sharedContainerIdentifier = sharedContainerIdentifier
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    public init(identifier: String = BackgroundUploader.sessionIdentifier, sharedContainerIdentifier: String? = nil) {
        self.identifier = identifier
        self.sharedContainerIdentifier = sharedContainerIdentifier
        super.init()
    }

    /// Reconnects to uploads that ran while the app wasn't.
    public func activate() {
        _ = session
    }

    /// Lets running uploads finish, then lets go of the session.
    public func finish() {
        session.finishTasksAndInvalidate()
    }

    public func start(request: URLRequest, bodyFile: URL, uploadID: String) async {
        let task = session.uploadTask(with: request, fromFile: bodyFile)
        task.taskDescription = uploadID
        task.resume()
    }

    public func activeUploadIDs() async -> Set<String> {
        let tasks = await session.allTasks
        return Set(tasks.filter { $0.state == .running || $0.state == .suspended }.compactMap(\.taskDescription))
    }

    // MARK: URLSessionDataDelegate

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.withLock { responses[dataTask.taskIdentifier, default: Data()].append(data) }
    }

    public func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard let id = task.taskDescription, totalBytesExpectedToSend > 0 else { return }
        onProgress?(id, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let body = lock.withLock { responses.removeValue(forKey: task.taskIdentifier) }
        guard let id = task.taskDescription else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode
        onCompletion?(id, status, body, error)
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [self] in
            backgroundEventsCompletion?()
            backgroundEventsCompletion = nil
        }
    }
}

/// The app's uploads: its own background session for everything it starts,
/// plus the sessions the Share Extension left running, which the app joins
/// to hear how those uploads ended.
public final class UploaderGroup: UploadTransport, @unchecked Sendable {
    public let main: BackgroundUploader
    private let sharedContainerIdentifier: String?
    private let lock = NSLock()
    private var extra: [String: BackgroundUploader] = [:]

    public var onCompletion: (@Sendable (String, Int?, Data?, (any Error)?) -> Void)? {
        didSet { lock.withLock { ([main] + Array(extra.values)) }.forEach { $0.onCompletion = onCompletion } }
    }
    public var onProgress: (@Sendable (String, Double) -> Void)? {
        didSet { lock.withLock { ([main] + Array(extra.values)) }.forEach { $0.onProgress = onProgress } }
    }

    public init(sharedContainerIdentifier: String?) {
        self.sharedContainerIdentifier = sharedContainerIdentifier
        self.main = BackgroundUploader(sharedContainerIdentifier: sharedContainerIdentifier)
    }

    /// The uploader for a session, joining it if needed.
    @discardableResult
    public func uploader(for identifier: String) -> BackgroundUploader {
        if identifier == main.identifier { return main }
        return lock.withLock {
            if let existing = extra[identifier] { return existing }
            let uploader = BackgroundUploader(identifier: identifier, sharedContainerIdentifier: sharedContainerIdentifier)
            uploader.onCompletion = onCompletion
            uploader.onProgress = onProgress
            uploader.activate()
            extra[identifier] = uploader
            return uploader
        }
    }

    /// Lets go of share sessions with nothing left to do.
    public func releaseIdleSessions() async {
        let sessions = lock.withLock { extra }
        for (identifier, uploader) in sessions where await uploader.activeUploadIDs().isEmpty {
            // Only once iOS has delivered the session's events, if it was woken for them.
            guard uploader.backgroundEventsCompletion == nil else { continue }
            uploader.finish()
            _ = lock.withLock { extra.removeValue(forKey: identifier) }
        }
    }

    public func start(request: URLRequest, bodyFile: URL, uploadID: String) async {
        await main.start(request: request, bodyFile: bodyFile, uploadID: uploadID)
    }

    public func activeUploadIDs() async -> Set<String> {
        var ids = await main.activeUploadIDs()
        for uploader in lock.withLock({ Array(extra.values) }) {
            ids.formUnion(await uploader.activeUploadIDs())
        }
        return ids
    }
}
