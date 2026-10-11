import Foundation
import NaasehContracts

public protocol NaasehClock: Sendable {
    func now() async -> Date
}

public struct SystemNaasehClock: NaasehClock {
    public init() {}

    public func now() async -> Date { Date() }
}

public actor TestClock: NaasehClock {
    private var instant: Date

    public init(_ instant: Date = Date(timeIntervalSince1970: 0)) {
        self.instant = instant
    }

    public func now() -> Date { instant }

    public func advance(by interval: TimeInterval) {
        instant = instant.addingTimeInterval(interval)
    }
}

public protocol NaasehIDGenerator: Sendable {
    func next() async -> UUID
}

public struct RandomIDGenerator: NaasehIDGenerator {
    public init() {}

    public func next() async -> UUID { UUID() }
}

public actor DeterministicIDGenerator: NaasehIDGenerator {
    private var values: [UUID]
    private var index = 0

    public init(values: [UUID]) {
        precondition(!values.isEmpty, "A deterministic generator requires at least one value")
        self.values = values
    }

    public func next() -> UUID {
        defer { index += 1 }
        return values[index % values.count]
    }
}

public struct MockHTTPRequest: Sendable, Equatable {
    public let method: String
    public let path: String
    public let headers: [String: String]
    public let body: Data?

    public init(method: String, path: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.path = path
        self.headers = headers
        self.body = body
    }
}

public struct MockHTTPResponse: Sendable, Equatable {
    public let status: Int
    public let headers: [String: String]
    public let body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }
}

public actor MockTransport {
    private var responses: [MockHTTPResponse]
    public private(set) var requests: [MockHTTPRequest] = []

    public init(responses: [MockHTTPResponse] = []) {
        self.responses = responses
    }

    public func enqueue(_ response: MockHTTPResponse) {
        responses.append(response)
    }

    public func send(_ request: MockHTTPRequest) throws -> MockHTTPResponse {
        requests.append(request)
        guard !responses.isEmpty else { throw MockTransportError.missingResponse }
        return responses.removeFirst()
    }
}

public enum MockTransportError: Error, Equatable {
    case missingResponse
}

public final class TemporaryStore: @unchecked Sendable {
    public let directory: URL

    public init(fileManager: FileManager = .default) throws {
        directory = fileManager.temporaryDirectory
            .appendingPathComponent("naaseh-tests-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    deinit {
        try? FileManager.default.removeItem(at: directory)
    }
}

public enum AppleFixtureLoader {
    public static func data(
        at relativePath: String,
        repositoryRoot: URL = defaultRepositoryRoot()
    ) throws -> Data {
        let fixtureRoot = repositoryRoot
            .appendingPathComponent("packages/test-fixtures/fixtures/apple", isDirectory: true)
            .standardizedFileURL
        let candidate = fixtureRoot.appendingPathComponent(relativePath).standardizedFileURL
        guard candidate.path.hasPrefix(fixtureRoot.path + "/") else {
            throw FixtureError.pathEscapesFixtureRoot
        }
        return try Data(contentsOf: candidate)
    }

    public static func decode<T: Decodable>(
        _ type: T.Type,
        at relativePath: String,
        repositoryRoot: URL = defaultRepositoryRoot(),
        decoder: JSONDecoder = JSONDecoder()
    ) throws -> T {
        try decoder.decode(type, from: data(at: relativePath, repositoryRoot: repositoryRoot))
    }

    public static func defaultRepositoryRoot(file: StaticString = #filePath) -> URL {
        URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent() // NaasehTestSupport
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // apple
            .deletingLastPathComponent() // packages
            .deletingLastPathComponent() // repository
    }

    public enum FixtureError: Error, Equatable {
        case pathEscapesFixtureRoot
    }
}
