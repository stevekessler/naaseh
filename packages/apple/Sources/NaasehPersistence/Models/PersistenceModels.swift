import Foundation
import SwiftData

public enum LocalRecordKind: String, Codable, CaseIterable, Sendable {
    case task, taskRevision, completion, list, listItem, directoryItem, group, category, project
    case stack, timer, reminder, report, journalProfile, journalEntry, crisisPlan, attachment, setting
}

public enum LocalSyncState: String, Codable, Sendable {
    case synced, pending, conflicted, rejected, revoked, tombstone
}

@Model
public final class EncryptedRecord {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var recordKind: String
    public var recordId: String
    public var serverVersion: Int?
    public var syncState: String
    public var updatedAt: Date
    public var envelopeVersion: Int
    public var nonce: Data
    public var ciphertextAndTag: Data

    public init(
        accountNamespace: String,
        recordKind: LocalRecordKind,
        recordId: String,
        serverVersion: Int? = nil,
        syncState: LocalSyncState,
        updatedAt: Date,
        envelopeVersion: Int,
        nonce: Data,
        ciphertextAndTag: Data
    ) {
        storageKey = "\(accountNamespace):\(recordKind.rawValue):\(recordId)"
        self.accountNamespace = accountNamespace
        self.recordKind = recordKind.rawValue
        self.recordId = recordId
        self.serverVersion = serverVersion
        self.syncState = syncState.rawValue
        self.updatedAt = updatedAt
        self.envelopeVersion = envelopeVersion
        self.nonce = nonce
        self.ciphertextAndTag = ciphertextAndTag
    }
}

public enum PendingOperationState: String, Codable, Sendable {
    case queued, pushing, retryScheduled, conflicted, rejected, applied
}

@Model
public final class PendingOperation {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var mutationId: String
    public var operationKind: String
    public var targetKind: String
    public var targetId: String
    public var baseVersion: Int?
    public var createdAt: Date
    public var nextAttemptAt: Date?
    public var attemptCount: Int
    public var state: String
    public var envelopeVersion: Int
    public var nonce: Data
    public var ciphertextAndTag: Data
    public var lastProblemClass: String?

    public init(
        accountNamespace: String,
        mutationId: String,
        operationKind: String,
        targetKind: String,
        targetId: String,
        baseVersion: Int?,
        createdAt: Date,
        state: PendingOperationState,
        envelopeVersion: Int,
        nonce: Data,
        ciphertextAndTag: Data
    ) {
        storageKey = "\(accountNamespace):\(mutationId)"
        self.accountNamespace = accountNamespace
        self.mutationId = mutationId
        self.operationKind = operationKind
        self.targetKind = targetKind
        self.targetId = targetId
        self.baseVersion = baseVersion
        self.createdAt = createdAt
        nextAttemptAt = nil
        attemptCount = 0
        self.state = state.rawValue
        self.envelopeVersion = envelopeVersion
        self.nonce = nonce
        self.ciphertextAndTag = ciphertextAndTag
        lastProblemClass = nil
    }
}

@Model
public final class SyncCursor {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var audience: String
    public var cursor: String
    public var lastAppliedAt: Date

    public init(accountNamespace: String, audience: String, cursor: String, lastAppliedAt: Date) {
        storageKey = "\(accountNamespace):\(audience)"
        self.accountNamespace = accountNamespace
        self.audience = audience
        self.cursor = cursor
        self.lastAppliedAt = lastAppliedAt
    }
}

@Model
public final class SyncConflict {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var conflictId: String
    public var targetKind: String
    public var targetId: String
    public var localMutationId: String
    public var detectedAt: Date
    public var envelopeVersion: Int
    public var nonce: Data
    public var ciphertextAndTag: Data

    public init(
        accountNamespace: String,
        conflictId: String,
        targetKind: String,
        targetId: String,
        localMutationId: String,
        detectedAt: Date,
        envelopeVersion: Int,
        nonce: Data,
        ciphertextAndTag: Data
    ) {
        storageKey = "\(accountNamespace):\(conflictId)"
        self.accountNamespace = accountNamespace
        self.conflictId = conflictId
        self.targetKind = targetKind
        self.targetId = targetId
        self.localMutationId = localMutationId
        self.detectedAt = detectedAt
        self.envelopeVersion = envelopeVersion
        self.nonce = nonce
        self.ciphertextAndTag = ciphertextAndTag
    }
}

public enum MigrationState: String, Codable, Sendable {
    case preparing, copying, validating, committing, rolledBack, complete, quarantined
}

@Model
public final class MigrationJournal {
    @Attribute(.unique) public var accountNamespace: String
    public var sourceVersion: Int
    public var targetVersion: Int
    public var state: String
    public var checkpoint: String?
    public var startedAt: Date
    public var updatedAt: Date
    public var safeErrorClass: String?

    public init(
        accountNamespace: String,
        sourceVersion: Int,
        targetVersion: Int,
        state: MigrationState,
        startedAt: Date
    ) {
        self.accountNamespace = accountNamespace
        self.sourceVersion = sourceVersion
        self.targetVersion = targetVersion
        self.state = state.rawValue
        checkpoint = nil
        self.startedAt = startedAt
        updatedAt = startedAt
        safeErrorClass = nil
    }
}

@Model
public final class NativeSceneState {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var sceneId: String
    public var stateVersion: Int
    public var sensitivity: String
    public var envelopeVersion: Int
    public var nonce: Data
    public var ciphertextAndTag: Data
    public var updatedAt: Date

    public init(
        accountNamespace: String,
        sceneId: String,
        stateVersion: Int,
        sensitivity: String,
        envelopeVersion: Int,
        nonce: Data,
        ciphertextAndTag: Data,
        updatedAt: Date
    ) {
        storageKey = "\(accountNamespace):\(sceneId)"
        self.accountNamespace = accountNamespace
        self.sceneId = sceneId
        self.stateVersion = stateVersion
        self.sensitivity = sensitivity
        self.envelopeVersion = envelopeVersion
        self.nonce = nonce
        self.ciphertextAndTag = ciphertextAndTag
        self.updatedAt = updatedAt
    }
}

@Model
public final class AlertOccurrence {
    @Attribute(.unique) public var storageKey: String
    public var accountNamespace: String
    public var occurrenceId: String
    public var taskId: String?
    public var scheduledAt: Date
    public var state: String
    public var isGeneric: Bool

    public init(
        accountNamespace: String,
        occurrenceId: String,
        taskId: String?,
        scheduledAt: Date,
        state: String,
        isGeneric: Bool = true
    ) {
        storageKey = "\(accountNamespace):\(occurrenceId)"
        self.accountNamespace = accountNamespace
        self.occurrenceId = occurrenceId
        self.taskId = taskId
        self.scheduledAt = scheduledAt
        self.state = state
        self.isGeneric = isGeneric
    }
}

@Model
public final class ClientCompatibilityState {
    @Attribute(.unique) public var platform: String
    public var minimumBuild: Int
    public var latestBuild: Int?
    public var supportedContractVersions: [Int]
    public var mode: String
    public var messageCode: String
    public var checkedAt: Date

    public init(
        platform: String,
        minimumBuild: Int,
        latestBuild: Int?,
        supportedContractVersions: [Int],
        mode: String,
        messageCode: String,
        checkedAt: Date
    ) {
        self.platform = platform
        self.minimumBuild = minimumBuild
        self.latestBuild = latestBuild
        self.supportedContractVersions = supportedContractVersions
        self.mode = mode
        self.messageCode = messageCode
        self.checkedAt = checkedAt
    }
}

public enum NaasehPersistenceSchema {
    public static let version = 1
    public static let models: [any PersistentModel.Type] = [
        EncryptedRecord.self,
        PendingOperation.self,
        SyncCursor.self,
        SyncConflict.self,
        MigrationJournal.self,
        NativeSceneState.self,
        AlertOccurrence.self,
        ClientCompatibilityState.self,
    ]
}
