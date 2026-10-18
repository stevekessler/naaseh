import Foundation
import NaasehCrypto

public enum SecureStoreError: Error, Equatable, Sendable {
    case missingKey, corruptEnvelope, insufficientStorage
}

public actor SecureStore {
    public typealias CapacityCheck = @Sendable () throws -> Void

    private let controller: PersistenceController
    private let accountNamespace: String
    private let key: Data?
    private let capacityCheck: CapacityCheck

    public init(
        controller: PersistenceController,
        accountNamespace: String,
        rootKey: Data?,
        capacityCheck: @escaping CapacityCheck = {}
    ) {
        self.controller = controller
        self.accountNamespace = accountNamespace
        key = rootKey
        self.capacityCheck = capacityCheck
    }

    public func commit<Value: Codable & Sendable>(
        _ value: Value,
        kind: LocalRecordKind,
        recordID: String,
        mutationID: String,
        operationKind: String,
        baseVersion: Int? = nil,
        now: Date = Date()
    ) async throws {
        try await commit(
            value,
            operationPayload: value,
            kind: kind,
            recordID: recordID,
            mutationID: mutationID,
            operationKind: operationKind,
            baseVersion: baseVersion,
            now: now
        )
    }

    public func commit<Value: Codable & Sendable, Payload: Codable & Sendable>(
        _ value: Value,
        operationPayload: Payload,
        kind: LocalRecordKind,
        recordID: String,
        mutationID: String,
        operationKind: String,
        baseVersion: Int? = nil,
        now: Date = Date()
    ) async throws {
        guard let key else { throw SecureStoreError.missingKey }
        do { try capacityCheck() } catch { throw SecureStoreError.insufficientStorage }
        let recordPlaintext = try JSONEncoder().encode(value)
        let operationPlaintext = try JSONEncoder().encode(operationPayload)
        let recordNonce = randomNonce()
        let operationNonce = randomNonce()
        let aad = authenticatedData(kind: kind, recordID: recordID)
        let sealedRecord = try NaasehCrypto.aesGCMSeal(
            plaintext: recordPlaintext,
            key: try accountKey(rootKey: key),
            nonce: recordNonce,
            authenticatedData: aad
        )
        let sealedOperation = try NaasehCrypto.aesGCMSeal(
            plaintext: operationPlaintext,
            key: try accountKey(rootKey: key),
            nonce: operationNonce,
            authenticatedData: aad
        )
        let record = EncryptedRecord(
            accountNamespace: accountNamespace,
            recordKind: kind,
            recordId: recordID,
            syncState: .pending,
            updatedAt: now,
            envelopeVersion: 1,
            nonce: recordNonce,
            ciphertextAndTag: sealedRecord.ciphertext + sealedRecord.tag
        )
        let operation = PendingOperation(
            accountNamespace: accountNamespace,
            mutationId: mutationID,
            operationKind: operationKind,
            targetKind: kind.rawValue,
            targetId: recordID,
            baseVersion: baseVersion,
            createdAt: now,
            state: .queued,
            envelopeVersion: 1,
            nonce: operationNonce,
            ciphertextAndTag: sealedOperation.ciphertext + sealedOperation.tag
        )
        try await controller.commit(record: record, operation: operation)
    }

    public func read<Value: Decodable & Sendable>(
        _ type: Value.Type,
        kind: LocalRecordKind,
        recordID: String
    ) async throws -> Value? {
        guard let key else { throw SecureStoreError.missingKey }
        guard let record = try await controller.record(
            accountNamespace: accountNamespace,
            kind: kind,
            recordID: recordID
        ) else { return nil }
        guard record.ciphertextAndTag.count >= 16 else { throw SecureStoreError.corruptEnvelope }
        let ciphertext = record.ciphertextAndTag.dropLast(16)
        let tag = record.ciphertextAndTag.suffix(16)
        do {
            let plaintext = try NaasehCrypto.aesGCMOpen(
                .init(nonce: record.nonce, ciphertext: Data(ciphertext), tag: Data(tag)),
                key: try accountKey(rootKey: key),
                authenticatedData: authenticatedData(kind: kind, recordID: recordID)
            )
            return try JSONDecoder().decode(type, from: plaintext)
        } catch {
            throw SecureStoreError.corruptEnvelope
        }
    }

    public func readAll<Value: Decodable & Sendable>(
        _ type: Value.Type,
        kind: LocalRecordKind
    ) async throws -> [Value] {
        guard let key else { throw SecureStoreError.missingKey }
        let derived = try accountKey(rootKey: key)
        return try await controller.records(accountNamespace: accountNamespace, kind: kind).map {
            guard $0.ciphertextAndTag.count >= 16 else { throw SecureStoreError.corruptEnvelope }
            let plaintext = try NaasehCrypto.aesGCMOpen(
                .init(
                    nonce: $0.nonce,
                    ciphertext: Data($0.ciphertextAndTag.dropLast(16)),
                    tag: Data($0.ciphertextAndTag.suffix(16))
                ),
                key: derived,
                authenticatedData: authenticatedData(kind: kind, recordID: $0.recordID)
            )
            return try JSONDecoder().decode(type, from: plaintext)
        }
    }

    public func counts() async throws -> (records: Int, operations: Int) {
        try await controller.counts(accountNamespace: accountNamespace)
    }

    public func currentCursor(audience: String = "account") async throws -> String? {
        try await controller.cursor(accountNamespace: accountNamespace, audience: audience)
    }

    public func pendingOperations(readyAt: Date, limit: Int) async throws -> [DecryptedPendingOperation] {
        guard let key else { throw SecureStoreError.missingKey }
        let derived = try accountKey(rootKey: key)
        return try await controller.pendingOperations(
            accountNamespace: accountNamespace,
            readyAt: readyAt,
            limit: limit
        ).map { operation in
            guard operation.ciphertextAndTag.count >= 16,
                  let kind = LocalRecordKind(rawValue: operation.targetKind)
            else { throw SecureStoreError.corruptEnvelope }
            let plaintext = try NaasehCrypto.aesGCMOpen(
                .init(
                    nonce: operation.nonce,
                    ciphertext: Data(operation.ciphertextAndTag.dropLast(16)),
                    tag: Data(operation.ciphertextAndTag.suffix(16))
                ),
                key: derived,
                authenticatedData: authenticatedData(kind: kind, recordID: operation.targetID)
            )
            return DecryptedPendingOperation(
                mutationID: operation.mutationID,
                targetKind: operation.targetKind,
                targetID: operation.targetID,
                operationKind: operation.operationKind,
                baseVersion: operation.baseVersion,
                payload: plaintext,
                createdAt: operation.createdAt,
                attemptCount: operation.attemptCount
            )
        }
    }

    public func markOperationsApplied(_ mutationIDs: [String]) async throws {
        try await controller.setOperationState(
            accountNamespace: accountNamespace,
            mutationIDs: mutationIDs,
            state: .applied,
            delete: true
        )
    }

    public func markOperationsConflicted(_ mutationIDs: [String]) async throws {
        try await controller.setOperationState(
            accountNamespace: accountNamespace,
            mutationIDs: mutationIDs,
            state: .conflicted
        )
    }

    public func markOperationsRejected(_ mutationIDs: [String]) async throws {
        try await controller.setOperationState(
            accountNamespace: accountNamespace,
            mutationIDs: mutationIDs,
            state: .rejected
        )
    }

    public func scheduleOperationRetry(_ mutationIDs: [String], at date: Date) async throws {
        try await controller.setOperationState(
            accountNamespace: accountNamespace,
            mutationIDs: mutationIDs,
            state: .retryScheduled,
            nextAttemptAt: date
        )
    }

    public func resolveOperationConflict(mutationID: String, keepLocal: Bool) async throws {
        try await controller.setOperationState(
            accountNamespace: accountNamespace,
            mutationIDs: [mutationID],
            state: keepLocal ? .queued : .applied,
            delete: !keepLocal
        )
    }

    public func applyServerValues<Value: Codable & Sendable>(
        _ values: [(kind: LocalRecordKind, id: String, version: Int, value: Value)],
        deleting: [(kind: LocalRecordKind, id: String)] = [],
        audience: String,
        cursor: String,
        now: Date = Date()
    ) async throws {
        guard let key else { throw SecureStoreError.missingKey }
        let derived = try accountKey(rootKey: key)
        let records = try values.map { item in
            let nonce = randomNonce()
            let sealed = try NaasehCrypto.aesGCMSeal(
                plaintext: JSONEncoder().encode(item.value),
                key: derived,
                nonce: nonce,
                authenticatedData: authenticatedData(kind: item.kind, recordID: item.id)
            )
            return EncryptedRecordWrite(
                accountNamespace: accountNamespace,
                kind: item.kind,
                recordID: item.id,
                serverVersion: item.version,
                updatedAt: now,
                envelopeVersion: 1,
                nonce: nonce,
                ciphertextAndTag: sealed.ciphertext + sealed.tag
            )
        }
        try await controller.apply(
            records: records,
            deletions: deleting.map {
                EncryptedRecordDeletion(
                    accountNamespace: accountNamespace,
                    kind: $0.kind,
                    recordID: $0.id
                )
            },
            cursor: SyncCursorWrite(
                accountNamespace: accountNamespace,
                audience: audience,
                cursor: cursor,
                lastAppliedAt: now
            )
        )
    }

    public func persistConflict<Value: Codable & Sendable>(
        conflictID: String,
        targetKind: LocalRecordKind,
        targetID: String,
        localMutationID: String,
        comparison: Value,
        now: Date = Date()
    ) async throws {
        guard let key else { throw SecureStoreError.missingKey }
        let nonce = randomNonce()
        let sealed = try NaasehCrypto.aesGCMSeal(
            plaintext: JSONEncoder().encode(comparison),
            key: try accountKey(rootKey: key),
            nonce: nonce,
            authenticatedData: Data("\(accountNamespace)|conflict|\(conflictID)|1".utf8)
        )
        try await controller.persist(
            conflict: SyncConflictWrite(
                accountNamespace: accountNamespace,
                conflictID: conflictID,
                targetKind: targetKind.rawValue,
                targetID: targetID,
                localMutationID: localMutationID,
                detectedAt: now,
                envelopeVersion: 1,
                nonce: nonce,
                ciphertextAndTag: sealed.ciphertext + sealed.tag
            )
        )
    }

    public func health() async -> SecureStoreHealth { await controller.health }

    private func accountKey(rootKey: Data) throws -> Data {
        try NaasehCrypto.hkdfSHA256(
            inputKeyMaterial: rootKey,
            salt: NaasehCrypto.sha256(Data(accountNamespace.utf8)),
            info: Data("naaseh-secure-store-v1".utf8),
            outputByteCount: 32
        )
    }

    private func authenticatedData(kind: LocalRecordKind, recordID: String) -> Data {
        Data("\(accountNamespace)|\(kind.rawValue)|\(recordID)|1".utf8)
    }

    private func randomNonce() -> Data {
        var generator = SystemRandomNumberGenerator()
        return Data((0 ..< 12).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
    }
}

public struct DecryptedPendingOperation: Sendable {
    public let mutationID: String
    public let targetKind: String
    public let targetID: String
    public let operationKind: String
    public let baseVersion: Int?
    public let payload: Data
    public let createdAt: Date
    public let attemptCount: Int
}
