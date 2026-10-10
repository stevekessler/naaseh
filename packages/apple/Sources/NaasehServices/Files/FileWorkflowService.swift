import Foundation
import NaasehCrypto
import Security

public enum NativeAttachmentKind: String, Codable, Sendable { case document, photo, camera }
public enum NativeAttachmentScanState: String, Codable, Sendable { case pending, clean, rejected }
public struct NativeAttachment: Codable, Equatable, Identifiable, Sendable { public let id: String; public let filename: String; public let contentType: String; public let byteSize: Int; public var scanState: NativeAttachmentScanState; public init(id: String = UUID().uuidString, filename: String, contentType: String, byteSize: Int, scanState: NativeAttachmentScanState = .pending) { self.id = id; self.filename = filename; self.contentType = contentType; self.byteSize = byteSize; self.scanState = scanState } }
public protocol FileUploadTransport: Sendable { func upload(metadata: NativeAttachment, encryptedBody: Data, mutationID: String) async throws -> NativeAttachment }
public enum FileWorkflowError: Error, Equatable, Sendable { case unsupportedType, tooLarge, cancelled, scanPending, scanRejected, corruptCiphertext }

public actor FileWorkflowService {
    private struct EncryptedChunk: Codable { let index: Int; let nonce: Data; let ciphertext: Data; let tag: Data }
    public static let maximumBytes = 25 * 1024 * 1024
    private let rootKey: Data
    private let stagingDirectory: URL
    private let transport: any FileUploadTransport
    private let allowedTypes: Set<String> = ["application/pdf", "image/jpeg", "image/png", "text/plain"]
    public init(rootKey: Data, stagingDirectory: URL, transport: any FileUploadTransport) throws {
        guard rootKey.count == 32 else { throw FileWorkflowError.corruptCiphertext }
        self.rootKey = rootKey
        self.stagingDirectory = stagingDirectory
        self.transport = transport
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = stagingDirectory
        try mutable.setResourceValues(values)
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: stagingDirectory.path
        )
        #endif
    }
    public func stage(source: URL, contentType: String, kind: NativeAttachmentKind) throws -> URL { guard allowedTypes.contains(contentType) else { throw FileWorkflowError.unsupportedType }; let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0; guard size <= Self.maximumBytes else { throw FileWorkflowError.tooLarge }; let target = stagingDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(source.pathExtension); try FileManager.default.copyItem(at: source, to: target); return target }
    public func upload(
        stagedURL: URL,
        contentType: String,
        mutationID: String,
        maximumAttempts: Int = 3,
        progress: @Sendable (Double) -> Void = { _ in }
    ) async throws -> NativeAttachment {
        let accessed = stagedURL.startAccessingSecurityScopedResource()
        defer { if accessed { stagedURL.stopAccessingSecurityScopedResource() }; try? FileManager.default.removeItem(at: stagedURL) }
        let size = try stagedURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= Self.maximumBytes else { throw FileWorkflowError.tooLarge }
        let metadata = NativeAttachment(filename: stagedURL.lastPathComponent, contentType: contentType, byteSize: size)
        let handle = try FileHandle(forReadingFrom: stagedURL); defer { try? handle.close() }
        var chunks: [EncryptedChunk] = [], processed = 0, index = 0
        while true {
            try Task.checkCancellation()
            guard let plaintext = try handle.read(upToCount: 256 * 1024), !plaintext.isEmpty else { break }
            let nonce = try randomData(12)
            let aad = Data("attachment|\(metadata.id)|\(contentType)|1|\(index)".utf8)
            let sealed = try NaasehCrypto.aesGCMSeal(plaintext: plaintext, key: rootKey, nonce: nonce, authenticatedData: aad)
            chunks.append(.init(index: index, nonce: nonce, ciphertext: sealed.ciphertext, tag: sealed.tag))
            processed += plaintext.count; index += 1; progress(size == 0 ? 1 : Double(processed) / Double(size))
        }
        let encryptedBody = try JSONEncoder().encode(chunks)
        var lastError: Error?
        for _ in 0 ..< max(1, maximumAttempts) {
            try Task.checkCancellation()
            do { return try await transport.upload(metadata: metadata, encryptedBody: encryptedBody, mutationID: mutationID) }
            catch { lastError = error }
        }
        throw lastError ?? FileWorkflowError.cancelled
    }
    public func preview(encryptedBody: Data, attachment: NativeAttachment) throws -> URL { guard attachment.scanState == .clean else { throw attachment.scanState == .pending ? FileWorkflowError.scanPending : FileWorkflowError.scanRejected }; let chunks: [EncryptedChunk]; do { chunks = try JSONDecoder().decode([EncryptedChunk].self, from: encryptedBody) } catch { throw FileWorkflowError.corruptCiphertext }; var plaintext = Data(); for chunk in chunks.sorted(by: { $0.index < $1.index }) { let aad = Data("attachment|\(attachment.id)|\(attachment.contentType)|1|\(chunk.index)".utf8); plaintext.append(try NaasehCrypto.aesGCMOpen(.init(nonce: chunk.nonce, ciphertext: chunk.ciphertext, tag: chunk.tag), key: rootKey, authenticatedData: aad)) }; let url = stagingDirectory.appendingPathComponent("preview-\(attachment.id)-\(attachment.filename)"); try plaintext.write(to: url, options: protectedWriteOptions); return url }
    public func cleanup() throws { for url in try FileManager.default.contentsOfDirectory(at: stagingDirectory, includingPropertiesForKeys: nil) { try FileManager.default.removeItem(at: url) } }
    private func randomData(_ count: Int) throws -> Data { var data = Data(repeating: 0, count: count); guard data.withUnsafeMutableBytes({ SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }) == errSecSuccess else { throw FileWorkflowError.corruptCiphertext }; return data }
    private var protectedWriteOptions: Data.WritingOptions {
        #if os(iOS)
        [.atomic, .completeFileProtection]
        #else
        [.atomic]
        #endif
    }
}
