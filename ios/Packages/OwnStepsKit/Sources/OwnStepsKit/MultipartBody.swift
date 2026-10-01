import Foundation

/// Writes a multipart/form-data body to a file. Background uploads need the
/// body on disk (`uploadTask(with:fromFile:)`), and a 400 MB video must not
/// pass through memory on the way there.
public struct MultipartBody {
    public enum Part {
        case field(name: String, value: String)
        case file(name: String, fileName: String, mime: String, url: URL)
    }

    public let boundary: String

    public init(boundary: String = "ownsteps-\(UUID().uuidString)") {
        self.boundary = boundary
    }

    public var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    /// Returns the number of bytes written.
    @discardableResult
    public func write(_ parts: [Part], to destination: URL) throws -> Int64 {
        FileManager.default.createFile(atPath: destination.path(percentEncoded: false), contents: nil)
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }

        func write(_ text: String) throws { try output.write(contentsOf: Data(text.utf8)) }

        for part in parts {
            try write("--\(boundary)\r\n")
            switch part {
            case let .field(name, value):
                try write("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                try write(value)
            case let .file(name, fileName, mime, url):
                try write("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileName)\"\r\n")
                try write("Content-Type: \(mime)\r\n\r\n")
                let input = try FileHandle(forReadingFrom: url)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty {
                    try output.write(contentsOf: chunk)
                }
            }
            try write("\r\n")
        }
        try write("--\(boundary)--\r\n")
        return Int64(try output.offset())
    }
}
