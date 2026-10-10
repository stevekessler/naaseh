import Foundation
import NaasehCrypto

public struct SceneStateSnapshot: Codable, Equatable, Sendable {
    public static let version = 1
    public let version: Int
    public let sceneID: String
    public var selectedSection: AppSection
    public var selectedOpaqueID: String?
    public var filterTokens: [String]
    public var scrollAnchor: String?
    public var encryptedDraftRevision: Int?
    public init(sceneID: String, selectedSection: AppSection, selectedOpaqueID: String? = nil, filterTokens: [String] = [], scrollAnchor: String? = nil, encryptedDraftRevision: Int? = nil) { version = Self.version; self.sceneID = sceneID; self.selectedSection = selectedSection; self.selectedOpaqueID = selectedOpaqueID; self.filterTokens = filterTokens; self.scrollAnchor = scrollAnchor; self.encryptedDraftRevision = encryptedDraftRevision }
}
public struct SceneEditConflict: Equatable, Sendable { public let recordID: String; public let editingSceneIDs: [String]; public init(recordID: String, editingSceneIDs: [String]) { self.recordID = recordID; self.editingSceneIDs = editingSceneIDs } }
public enum SceneStateError: Error, Equatable, Sendable { case invalidVersion, corrupt, editConflict(SceneEditConflict) }

public actor SceneStateStore {
    private struct Envelope: Codable { let nonce: Data; let ciphertext: Data; let tag: Data }
    private let key: Data
    private var states: [String: Data] = [:]
    private var editors: [String: Set<String>] = [:]
    public init(key: Data) throws { guard key.count == 32 else { throw SceneStateError.corrupt }; self.key = key }
    public func save(_ snapshot: SceneStateSnapshot, draft: Data? = nil) throws { guard snapshot.version == SceneStateSnapshot.version else { throw SceneStateError.invalidVersion }; let plaintext = try JSONEncoder().encode(Persisted(snapshot: snapshot, draft: draft)); let nonce = randomNonce(); let sealed = try NaasehCrypto.aesGCMSeal(plaintext: plaintext, key: key, nonce: nonce, authenticatedData: Data("scene-state|\(snapshot.sceneID)|\(snapshot.version)".utf8)); states[snapshot.sceneID] = try JSONEncoder().encode(Envelope(nonce: nonce, ciphertext: sealed.ciphertext, tag: sealed.tag)) }
    public func load(sceneID: String) throws -> (snapshot: SceneStateSnapshot, draft: Data?)? { guard let data = states[sceneID] else { return nil }; do { let envelope = try JSONDecoder().decode(Envelope.self, from: data); let plaintext = try NaasehCrypto.aesGCMOpen(.init(nonce: envelope.nonce, ciphertext: envelope.ciphertext, tag: envelope.tag), key: key, authenticatedData: Data("scene-state|\(sceneID)|\(SceneStateSnapshot.version)".utf8)); let value = try JSONDecoder().decode(Persisted.self, from: plaintext); guard value.snapshot.version == SceneStateSnapshot.version else { throw SceneStateError.invalidVersion }; return (value.snapshot, value.draft) } catch let error as SceneStateError { throw error } catch { throw SceneStateError.corrupt } }
    public func beginEditing(recordID: String, sceneID: String) throws { var active = editors[recordID, default: []]; if !active.isEmpty && !active.contains(sceneID) { throw SceneStateError.editConflict(.init(recordID: recordID, editingSceneIDs: active.sorted())) }; active.insert(sceneID); editors[recordID] = active }
    public func endEditing(recordID: String, sceneID: String) { editors[recordID]?.remove(sceneID); if editors[recordID]?.isEmpty == true { editors.removeValue(forKey: recordID) } }
    public func purge() { states.removeAll(); editors.removeAll() }
    private struct Persisted: Codable { let snapshot: SceneStateSnapshot; let draft: Data? }
    private func randomNonce() -> Data { var generator = SystemRandomNumberGenerator(); return Data((0..<12).map { _ in UInt8.random(in: .min ... .max, using: &generator) }) }
}
