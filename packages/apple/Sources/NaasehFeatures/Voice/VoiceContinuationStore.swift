import Foundation
import NaasehCrypto

public enum VoiceContinuationError: Error, Equatable, Sendable { case expired, missing, corrupt }

public actor VoiceContinuationStore {
    private struct Envelope: Codable, Sendable { let request: VoiceTaskRequest; let expiresAt: Date }
    private let key: Data
    private var values: [String: NaasehCrypto.AESGCMSealedBox] = [:]

    public init(key: Data) throws {
        guard key.count == 32 else { throw VoiceContinuationError.corrupt }
        self.key = key
    }

    public func save(_ request: VoiceTaskRequest, now: Date = Date(), lifetime: TimeInterval = 5 * 60) throws -> String {
        let token = UUID().uuidString
        let plaintext = try JSONEncoder().encode(Envelope(request: request, expiresAt: now.addingTimeInterval(lifetime)))
        let nonce = Data((0 ..< 12).map { _ in UInt8.random(in: .min ... .max) })
        values[token] = try NaasehCrypto.aesGCMSeal(
            plaintext: plaintext, key: key, nonce: nonce,
            authenticatedData: Data("naaseh:voice-continuation:\(token)".utf8)
        )
        return token
    }

    public func take(_ token: String, now: Date = Date()) throws -> VoiceTaskRequest {
        guard let box = values.removeValue(forKey: token) else { throw VoiceContinuationError.missing }
        do {
            let plaintext = try NaasehCrypto.aesGCMOpen(
                box, key: key, authenticatedData: Data("naaseh:voice-continuation:\(token)".utf8)
            )
            let envelope = try JSONDecoder().decode(Envelope.self, from: plaintext)
            guard envelope.expiresAt > now else { throw VoiceContinuationError.expired }
            return envelope.request
        } catch let error as VoiceContinuationError { throw error }
        catch { throw VoiceContinuationError.corrupt }
    }

    public func purge() { values.removeAll(keepingCapacity: false) }
}
