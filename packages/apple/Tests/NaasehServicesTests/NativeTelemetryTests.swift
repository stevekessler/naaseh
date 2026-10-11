import Foundation
import NaasehServices
import NaasehTestSupport
import Testing

@Suite("Privacy-safe native telemetry")
struct NativeTelemetryTests {
    @Test("memory-only fallback remains usable without a persistent key")
    func memoryOnlyFallback() async throws {
        let buffer = NativeTelemetryBuffer(memoryOnlyMaximumCount: 1)
        #expect(await buffer.storageMode == .memoryOnly)
        try await buffer.record(event(index: 0))
        #expect(await buffer.pending().count == 1)
    }

    @Test("closed event schema contains only bounded diagnostic fields")
    func closedSchema() throws {
        let encoded = try JSONEncoder.naasehTelemetry.encode(event(index: 1))
        let object = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(
            Set(object.keys) == [
                "eventId", "occurredAt", "platform", "appVersion", "buildNumber",
                "contractVersion", "operationClass", "outcome", "errorClass", "retryable",
                "correlationId",
            ]
        )
        #expect(!String(decoding: encoded, as: UTF8.self).contains("task"))
    }

    @Test("encrypted ring keeps newest 100 events and never writes plaintext")
    func encryptedRingAndOverflow() async throws {
        let store = try TemporaryStore()
        let buffer = try NativeTelemetryBuffer(
            directory: store.directory,
            encryptionKey: Data(repeating: 7, count: 32)
        )
        for index in 0 ..< 105 {
            try await buffer.record(event(index: index))
        }

        let pending = await buffer.pending()
        #expect(pending.count == 100)
        #expect(pending.first?.eventId == event(index: 5).eventId)
        #expect(await buffer.droppedCount == 5)
        let disk = try Data(contentsOf: buffer.fileURL)
        #expect(!String(decoding: disk, as: UTF8.self).contains("migrationFailed"))
    }

    @Test("missing key keeps telemetry in memory only")
    func memoryOnlyWithoutKey() async throws {
        let store = try TemporaryStore()
        let buffer = try NativeTelemetryBuffer(directory: store.directory, encryptionKey: nil)
        try await buffer.record(event(index: 1))
        #expect(await buffer.storageMode == .memoryOnly)
        #expect(!FileManager.default.fileExists(atPath: buffer.fileURL.path))
    }

    @Test("flush requires validation, bounds retries, and does not recursively record failures")
    func authenticatedBoundedFlush() async throws {
        let store = try TemporaryStore()
        let buffer = try NativeTelemetryBuffer(
            directory: store.directory,
            encryptionKey: Data(repeating: 9, count: 32)
        )
        try await buffer.record(event(index: 1))
        let transport = FailingTelemetryTransport()
        let uploader = NativeTelemetryUploader(buffer: buffer, transport: transport, maxAttempts: 3)

        await uploader.flush(sessionIsValidated: false)
        #expect(await transport.attempts == 0)
        await uploader.flush(sessionIsValidated: true)
        #expect(await transport.attempts == 3)
        #expect(await buffer.pending().count == 1)
    }

    private func event(index: Int) -> NativeDiagnosticEvent {
        NativeDiagnosticEvent(
            eventId: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index))!,
            occurredAt: Date(timeIntervalSince1970: TimeInterval(index)),
            platform: .macos,
            appVersion: "0.1.0",
            buildNumber: 1,
            contractVersion: 4,
            operationClass: .migration,
            outcome: .failed,
            errorClass: .migrationFailed,
            retryable: true,
            correlationId: UUID(uuidString: String(format: "10000000-0000-0000-0000-%012d", index))!
        )
    }
}

private actor FailingTelemetryTransport: NativeTelemetryTransport {
    private(set) var attempts = 0

    func send(events _: [NativeDiagnosticEvent]) async throws {
        attempts += 1
        throw URLError(.notConnectedToInternet)
    }
}

private extension JSONEncoder {
    static var naasehTelemetry: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}
