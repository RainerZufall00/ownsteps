import Foundation

/// Uploads through a background `URLSession`: they keep running when the
/// app is suspended or the phone is in a pocket ([D20] / Q4 a), and iOS
/// relaunches the app when they finish.
public final class BackgroundUploader: NSObject, UploadTransport, URLSessionDataDelegate, @unchecked Sendable {
    public static let sessionIdentifier = "ownsteps.uploads"

    /// Set by the app; receives every finished upload.
    public var onCompletion: (@Sendable (String, Int?, Data?, (any Error)?) -> Void)?
    /// Progress per upload ID, 0…1.
    public var onProgress: (@Sendable (String, Double) -> Void)?
    /// Handed over by the app delegate when iOS wakes the app for this session.
    public var backgroundEventsCompletion: (() -> Void)?

    private let lock = NSLock()
    private var responses: [Int: Data] = [:]

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        // The user asked for it – don't wait for Wi-Fi and a charger.
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    public override init() {
        super.init()
    }

    /// Reconnects to uploads that ran while the app wasn't.
    public func activate() {
        _ = session
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
