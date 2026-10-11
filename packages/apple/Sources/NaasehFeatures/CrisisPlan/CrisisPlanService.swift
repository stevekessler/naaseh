import Foundation
import NaasehCrypto
import Security

public struct CrisisPlanBody: Codable, Equatable, Sendable {
    public var warningSigns: [String]
    public var copingStrategies: [String]
    public var peopleAndPlaces: [String]
    public var professionalContacts: [String]
    public var environmentSafety: [String]
    public init(warningSigns: [String] = [], copingStrategies: [String] = [], peopleAndPlaces: [String] = [], professionalContacts: [String] = [], environmentSafety: [String] = []) {
        self.warningSigns = warningSigns; self.copingStrategies = copingStrategies
        self.peopleAndPlaces = peopleAndPlaces; self.professionalContacts = professionalContacts
        self.environmentSafety = environmentSafety
    }
}

public struct CrisisPlanShare: Equatable, Sendable {
    public enum State: String, Sendable { case active, revoked, recipientRemoved }
    public let recipientID: String
    public var state: State
    public var version: Int
    public var encryptedGrant: Data?
}

public struct CrisisPlanRecord: Equatable, Sendable {
    public let planID: String
    public let ownerID: String
    public var version: Int
    public var keyGeneration: Int
    public var ciphertext: Data
    public var nonce: Data
}

public enum CrisisPlanError: Error, Equatable, Sendable {
    case notFound, unauthorized, offlineRecipient, conflict(currentVersion: Int), recipientLimit, rotationRequired
}

public actor CrisisPlanService {
    private let ownerID: String
    private let crypto: JournalCryptoService
    private var record: CrisisPlanRecord?
    private var shares: [String: CrisisPlanShare] = [:]
    private var receipts: [String: Int] = [:]
    private var shareReceipts: [String: CrisisPlanShare] = [:]

    public init(ownerID: String, crypto: JournalCryptoService) { self.ownerID = ownerID; self.crypto = crypto }
    public func exists() -> Bool { record != nil }

    public func save(mutationID: String, planID: String, body: CrisisPlanBody, baseVersion: Int) async throws -> CrisisPlanRecord {
        if receipts[mutationID] != nil, let record { return record }
        guard (record?.version ?? 0) == baseVersion else { throw CrisisPlanError.conflict(currentVersion: record?.version ?? 0) }
        let generation = record?.keyGeneration ?? 1
        let key = try await crypto.crisisPlanKey(ownerID: ownerID, planID: planID, generation: generation)
        let nonce = try randomData(12)
        let plaintext = try JSONEncoder().encode(body)
        let aad = Data("crisis-plan|\(ownerID)|\(planID)|body|1|\(generation)".utf8)
        let sealed = try NaasehCrypto.aesGCMSeal(plaintext: plaintext, key: key, nonce: nonce, authenticatedData: aad)
        let next = CrisisPlanRecord(planID: planID, ownerID: ownerID, version: baseVersion + 1, keyGeneration: generation, ciphertext: sealed.ciphertext + sealed.tag, nonce: nonce)
        record = next; receipts[mutationID] = next.version
        return next
    }

    public func trigger(draft: JournalBody?) async throws -> (plan: CrisisPlanBody, preservedDraft: JournalBody?) {
        guard let record else { throw CrisisPlanError.notFound }
        return (try await decrypt(record), draft)
    }

    public func share(
        recipientID: String,
        publicKey: JournalRecoveryKey,
        mutationID: String = UUID().uuidString
    ) async throws -> CrisisPlanShare {
        if let duplicate = shareReceipts[mutationID] { return duplicate }
        guard let record else { throw CrisisPlanError.notFound }
        guard recipientID != ownerID else { throw CrisisPlanError.unauthorized }
        guard shares.values.filter({ $0.state == .active }).count < 90 else { throw CrisisPlanError.recipientLimit }
        let key = try await crypto.crisisPlanKey(ownerID: ownerID, planID: record.planID, generation: record.keyGeneration)
        let grant = try NaasehCrypto.rsaOAEPWrap(key, publicKey: publicKey.value)
        let share = CrisisPlanShare(recipientID: recipientID, state: .active, version: (shares[recipientID]?.version ?? 0) + 1, encryptedGrant: grant)
        shares[recipientID] = share
        shareReceipts[mutationID] = share
        return share
    }

    @discardableResult
    public func revoke(recipientID: String, mutationID: String = UUID().uuidString) throws -> CrisisPlanShare {
        if let duplicate = shareReceipts[mutationID] { return duplicate }
        guard var share = shares[recipientID], share.state == .active else { throw CrisisPlanError.unauthorized }
        share.state = .revoked; share.version += 1; share.encryptedGrant = nil; shares[recipientID] = share
        shareReceipts[mutationID] = share
        return share
    }

    public func rotateAccess(
        mutationID: String,
        remainingRecipientKeys: [String: JournalRecoveryKey]
    ) async throws -> CrisisPlanRecord {
        guard let current = record else { throw CrisisPlanError.notFound }
        let active = shares.values.filter { $0.state == .active }
        guard Set(active.map(\.recipientID)) == Set(remainingRecipientKeys.keys) else {
            throw CrisisPlanError.rotationRequired
        }
        let body = try await decrypt(current)
        let generation = current.keyGeneration + 1
        let key = try await crypto.crisisPlanKey(ownerID: ownerID, planID: current.planID, generation: generation)
        let nonce = try randomData(12)
        let aad = Data("crisis-plan|\(ownerID)|\(current.planID)|body|1|\(generation)".utf8)
        let sealed = try NaasehCrypto.aesGCMSeal(plaintext: JSONEncoder().encode(body), key: key, nonce: nonce, authenticatedData: aad)
        for share in active {
            guard let publicKey = remainingRecipientKeys[share.recipientID] else { throw CrisisPlanError.rotationRequired }
            shares[share.recipientID] = .init(
                recipientID: share.recipientID, state: .active, version: share.version + 1,
                encryptedGrant: try NaasehCrypto.rsaOAEPWrap(key, publicKey: publicKey.value)
            )
        }
        let replacement = CrisisPlanRecord(
            planID: current.planID, ownerID: ownerID, version: current.version + 1,
            keyGeneration: generation, ciphertext: sealed.ciphertext + sealed.tag, nonce: nonce
        )
        record = replacement; receipts[mutationID] = replacement.version
        return replacement
    }

    public func openAsRecipient(recipientID: String, privateKey: JournalRecoveryKey, online: Bool) async throws -> CrisisPlanBody {
        guard online else { throw CrisisPlanError.offlineRecipient }
        guard let record, let share = shares[recipientID], share.state == .active, let grant = share.encryptedGrant else { throw CrisisPlanError.unauthorized }
        let key = try NaasehCrypto.rsaOAEPUnwrap(grant, privateKey: privateKey.value)
        defer { var copy = key; copy.resetBytes(in: copy.startIndex ..< copy.endIndex) }
        return try decrypt(record, key: key)
    }

    public func allShares() -> [CrisisPlanShare] { Array(shares.values) }
    public func currentRecord() -> CrisisPlanRecord? { record }

    private func decrypt(_ record: CrisisPlanRecord) async throws -> CrisisPlanBody {
        try decrypt(record, key: await crypto.crisisPlanKey(ownerID: ownerID, planID: record.planID, generation: record.keyGeneration))
    }
    private func decrypt(_ record: CrisisPlanRecord, key: Data) throws -> CrisisPlanBody {
        guard record.ciphertext.count > 16 else { throw CrisisPlanError.notFound }
        let aad = Data("crisis-plan|\(ownerID)|\(record.planID)|body|1|\(record.keyGeneration)".utf8)
        let plaintext = try NaasehCrypto.aesGCMOpen(.init(nonce: record.nonce, ciphertext: record.ciphertext.dropLast(16), tag: record.ciphertext.suffix(16)), key: key, authenticatedData: aad)
        return try JSONDecoder().decode(CrisisPlanBody.self, from: plaintext)
    }
    private func randomData(_ count: Int) throws -> Data {
        var data = Data(repeating: 0, count: count)
        guard data.withUnsafeMutableBytes({ SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }) == errSecSuccess else { throw NaasehCryptoError.securityFailure(nil) }
        return data
    }
}
