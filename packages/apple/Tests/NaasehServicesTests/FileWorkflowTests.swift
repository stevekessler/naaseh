import Foundation
import NaasehServices
import Testing

private actor FileTransportFixture: FileUploadTransport {
    var body = Data()
    var attempts = 0
    var failuresRemaining = 1
    func upload(metadata: NativeAttachment, encryptedBody: Data, mutationID: String) throws -> NativeAttachment {
        attempts += 1
        if failuresRemaining > 0 { failuresRemaining -= 1; throw FileWorkflowError.cancelled }
        body = encryptedBody; var result = metadata; result.scanState = .clean; return result
    }
}

@Suite("Protected file workflow") struct FileWorkflowTests {
    @Test("type, size, encrypted upload, scan gate, preview, and cleanup fail closed")
    func workflow() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let source = root.appendingPathComponent("source.txt")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("synthetic private attachment".utf8).write(to: source)
        let transport = FileTransportFixture()
        let service = try FileWorkflowService(rootKey: Data(repeating: 7, count: 32), stagingDirectory: root.appendingPathComponent("staging"), transport: transport)
        await #expect(throws: FileWorkflowError.unsupportedType) { try await service.stage(source: source, contentType: "application/x-unsafe", kind: .document) }
        let staged = try await service.stage(source: source, contentType: "text/plain", kind: .document)
        let attachment = try await service.upload(stagedURL: staged, contentType: "text/plain", mutationID: "upload-1")
        #expect(await transport.attempts == 2)
        let encrypted = await transport.body
        #expect(String(decoding: encrypted, as: UTF8.self).contains("private attachment") == false)
        let preview = try await service.preview(encryptedBody: encrypted, attachment: attachment)
        #expect(try String(contentsOf: preview, encoding: .utf8) == "synthetic private attachment")
        try await service.cleanup()
        #expect(FileManager.default.fileExists(atPath: preview.path) == false)
    }
}
