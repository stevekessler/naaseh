import Foundation
import NaasehCrypto
import Security

public enum NativeTelemetryStorageMode: Equatable, Sendable {
    case encryptedFile
    case memoryOnly
}

public actor NativeTelemetryBuffer {
    public nonisolated let fileURL: URL
    public private(set) var storageMode: NativeTelemetryStorageMode
    public private(set) var droppedCount = 0

    private let maximumCount: Int
    private let encryptionKey: Data?
    private var events: [NativeDiagnosticEvent]

    public init(
        directory: URL,
        encryptionKey: Data?,
        maximumCount: Int = 100,
        fileManager: FileManager = .default
    ) throws {
        guard maximumCount > 0 else { throw NativeTelemetryBufferError.invalidCapacity }
        if let encryptionKey, encryptionKey.count != 32 {
            throw NativeTelemetryBufferError.invalidKey
        }
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        fileURL = directory.appendingPathComponent("native-telemetry.ring")
        self.maximumCount = maximumCount
        self.encryptionKey = encryptionKey
        storageMode = encryptionKey == nil ? .memoryOnly : .encryptedFile
        if let encryptionKey, fileManager.fileExists(atPath: fileURL.path) {
            events = try Self.readEncryptedFile(fileURL, key: encryptionKey)
            if events.count > maximumCount {
                droppedCount = events.count - maximumCount
                events = Array(events.suffix(maximumCount))
            }
        } else {
            events = []
        }
    }

    /// Provides a non-persistent fallback when the Keychain or encrypted telemetry file cannot be
    /// opened. Telemetry must never prevent the user from launching the application.
    public init(memoryOnlyMaximumCount: Int = 100) {
        fileURL = URL(fileURLWithPath: "/dev/null")
        maximumCount = max(1, memoryOnlyMaximumCount)
        encryptionKey = nil
        events = []
        storageMode = .memoryOnly
    }

    public func record(_ event: NativeDiagnosticEvent) throws {
        events.append(event)
        if events.count > maximumCount {
            let overflow = events.count - maximumCount
            events.removeFirst(overflow)
            droppedCount += overflow
        }
        try persistIfPossible()
    }

    public func pending(limit: Int = 100) -> [NativeDiagnosticEvent] {
        Array(events.prefix(max(0, limit)))
    }

    public func acknowledge(eventIds: Set<UUID>) throws {
        events.removeAll { eventIds.contains($0.eventId) }
        try persistIfPossible()
    }

    private func persistIfPossible() throws {
        guard let encryptionKey else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let plaintext = try encoder.encode(events)
        let nonce = try Self.randomBytes(count: 12)
        let sealed = try NaasehCrypto.aesGCMSeal(
            plaintext: plaintext,
            key: encryptionKey,
            nonce: nonce,
            authenticatedData: Data("naaseh:native-telemetry:v1".utf8)
        )
        let file = EncryptedTelemetryFile(
            version: 1,
            nonce: sealed.nonce,
            ciphertext: sealed.ciphertext,
            tag: sealed.tag
        )
        let encoded = try JSONEncoder().encode(file)
        try encoded.write(to: fileURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: fileURL.path
        )
        #endif
    }

    private static func readEncryptedFile(_ url: URL, key: Data) throws -> [NativeDiagnosticEvent] {
        let encoded = try Data(contentsOf: url)
        let file = try JSONDecoder().decode(EncryptedTelemetryFile.self, from: encoded)
        guard file.version == 1 else { throw NativeTelemetryBufferError.unsupportedVersion }
        let plaintext = try NaasehCrypto.aesGCMOpen(
            .init(nonce: file.nonce, ciphertext: file.ciphertext, tag: file.tag),
            key: key,
            authenticatedData: Data("naaseh:native-telemetry:v1".utf8)
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([NativeDiagnosticEvent].self, from: plaintext)
    }

    private static func randomBytes(count: Int) throws -> Data {
        var data = Data(repeating: 0, count: count)
        let result = data.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, count, bytes.baseAddress!)
        }
        guard result == errSecSuccess else { throw NativeTelemetryBufferError.randomFailure }
        return data
    }
}

public protocol NativeTelemetryTransport: Sendable {
    func send(events: [NativeDiagnosticEvent]) async throws
}

public actor NativeTelemetryUploader {
    private let buffer: NativeTelemetryBuffer
    private let transport: any NativeTelemetryTransport
    private let maxAttempts: Int
    private var isFlushing = false

    public init(
        buffer: NativeTelemetryBuffer,
        transport: any NativeTelemetryTransport,
        maxAttempts: Int = 3
    ) {
        self.buffer = buffer
        self.transport = transport
        self.maxAttempts = max(1, maxAttempts)
    }

    public func flush(sessionIsValidated: Bool) async {
        guard sessionIsValidated, !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        let batch = await buffer.pending(limit: 50)
        guard !batch.isEmpty else { return }
        for _ in 0 ..< maxAttempts {
            do {
                try await transport.send(events: batch)
                try await buffer.acknowledge(eventIds: Set(batch.map(\.eventId)))
                return
            } catch {
                // Telemetry failures are intentionally not recorded as telemetry. Doing so would
                // recurse and could displace the event that explains the user-visible failure.
                continue
            }
        }
    }
}

private struct EncryptedTelemetryFile: Codable {
    let version: Int
    let nonce: Data
    let ciphertext: Data
    let tag: Data
}

public enum NativeTelemetryBufferError: Error, Equatable, Sendable {
    case invalidCapacity
    case invalidKey
    case randomFailure
    case unsupportedVersion
}
