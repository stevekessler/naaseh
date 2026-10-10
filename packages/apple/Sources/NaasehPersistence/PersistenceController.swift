import Foundation
import SwiftData

public enum SecureStoreHealth: Equatable, Sendable {
    case closed
    case opening
    case migrating(source: Int, target: Int)
    case ready(schemaVersion: Int)
    case quarantined(SafeStoreFailure)
}

public enum SafeStoreFailure: String, Error, Sendable {
    case appGroupUnavailable
    case directoryProtectionFailed
    case storeOpenFailed
    case migrationInterrupted
    case migrationValidationFailed
}

public actor PersistenceController {
    public static let storeFilename = "Naaseh-secure.store"

    public private(set) var health: SecureStoreHealth = .closed
    private var container: ModelContainer?

    public init() {}

    public func open(
        appGroupIdentifier: String,
        overrideDirectory: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        guard container == nil else { return }
        health = .opening

        let directory: URL
        if let overrideDirectory {
            directory = overrideDirectory
        } else if let groupURL = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) {
            directory = groupURL.appendingPathComponent("SecureStore", isDirectory: true)
        } else {
            health = .quarantined(.appGroupUnavailable)
            throw SafeStoreFailure.appGroupUnavailable
        }

        do {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
            try protect(directory: directory)
        } catch {
            health = .quarantined(.directoryProtectionFailed)
            throw SafeStoreFailure.directoryProtectionFailed
        }

        let storeURL = directory.appendingPathComponent(Self.storeFilename)
        let schema = Schema(NaasehPersistenceSchema.models)
        let configuration = ModelConfiguration(
            "NaasehSecureStore",
            schema: schema,
            url: storeURL,
            allowsSave: true,
            cloudKitDatabase: .none
        )

        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
            let context = ModelContext(container!)
            let descriptor = FetchDescriptor<MigrationJournal>()
            if try context.fetch(descriptor).contains(where: {
                $0.state != MigrationState.complete.rawValue &&
                    $0.state != MigrationState.rolledBack.rawValue
            }) {
                container = nil
                health = .quarantined(.migrationInterrupted)
                throw SafeStoreFailure.migrationInterrupted
            }
            health = .ready(schemaVersion: NaasehPersistenceSchema.version)
        } catch let failure as SafeStoreFailure {
            throw failure
        } catch {
            container = nil
            health = .quarantined(.storeOpenFailed)
            throw SafeStoreFailure.storeOpenFailed
        }
    }

    public func beginMigration(sourceVersion: Int, targetVersion: Int) throws {
        guard case .ready = health, let container else { throw SafeStoreFailure.storeOpenFailed }
        let context = ModelContext(container)
        let accountNamespace = "__store__"
        let descriptor = FetchDescriptor<MigrationJournal>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        let existing = try context.fetch(descriptor).first
        if let existing, existing.state != MigrationState.complete.rawValue,
           existing.state != MigrationState.rolledBack.rawValue
        {
            health = .quarantined(.migrationInterrupted)
            throw SafeStoreFailure.migrationInterrupted
        }

        if let existing { context.delete(existing) }
        let now = Date()
        context.insert(
            MigrationJournal(
                accountNamespace: accountNamespace,
                sourceVersion: sourceVersion,
                targetVersion: targetVersion,
                state: .preparing,
                startedAt: now
            )
        )
        try context.save()
        health = .migrating(source: sourceVersion, target: targetVersion)
    }

    public func completeMigration() throws {
        guard case .migrating = health, let container else {
            throw SafeStoreFailure.migrationValidationFailed
        }
        let context = ModelContext(container)
        let accountNamespace = "__store__"
        let descriptor = FetchDescriptor<MigrationJournal>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        guard let journal = try context.fetch(descriptor).first else {
            health = .quarantined(.migrationValidationFailed)
            throw SafeStoreFailure.migrationValidationFailed
        }
        journal.state = MigrationState.complete.rawValue
        journal.checkpoint = "validated"
        journal.updatedAt = Date()
        try context.save()
        health = .ready(schemaVersion: journal.targetVersion)
    }

    public func rollbackMigration() throws {
        guard case .migrating = health, let container else {
            throw SafeStoreFailure.migrationValidationFailed
        }
        let context = ModelContext(container)
        let accountNamespace = "__store__"
        let descriptor = FetchDescriptor<MigrationJournal>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        guard let journal = try context.fetch(descriptor).first else {
            throw SafeStoreFailure.migrationValidationFailed
        }
        journal.state = MigrationState.rolledBack.rawValue
        journal.checkpoint = "source-restored"
        journal.updatedAt = Date()
        try context.save()
        health = .ready(schemaVersion: journal.sourceVersion)
    }

    public func close() {
        container = nil
        health = .closed
    }

    public func commit(record: EncryptedRecord, operation: PendingOperation) throws {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let context = ModelContext(container)
        let recordKey = record.storageKey
        let existingRecords = try context.fetch(
            FetchDescriptor<EncryptedRecord>(predicate: #Predicate { $0.storageKey == recordKey })
        )
        for existing in existingRecords { context.delete(existing) }
        let operationKey = operation.storageKey
        let existingOperations = try context.fetch(
            FetchDescriptor<PendingOperation>(predicate: #Predicate { $0.storageKey == operationKey })
        )
        for existing in existingOperations { context.delete(existing) }
        context.insert(record)
        context.insert(operation)
        try context.save()
    }

    public func apply(records: [EncryptedRecordWrite], cursor: SyncCursorWrite) throws {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let context = ModelContext(container)
        for value in records {
            let storageKey = "\(value.accountNamespace):\(value.kind.rawValue):\(value.recordID)"
            let existing = try context.fetch(
                FetchDescriptor<EncryptedRecord>(predicate: #Predicate { $0.storageKey == storageKey })
            )
            for record in existing { context.delete(record) }
            context.insert(
                EncryptedRecord(
                    accountNamespace: value.accountNamespace,
                    recordKind: value.kind,
                    recordId: value.recordID,
                    serverVersion: value.serverVersion,
                    syncState: .synced,
                    updatedAt: value.updatedAt,
                    envelopeVersion: value.envelopeVersion,
                    nonce: value.nonce,
                    ciphertextAndTag: value.ciphertextAndTag
                )
            )
        }
        let cursorKey = "\(cursor.accountNamespace):\(cursor.audience)"
        let existingCursors = try context.fetch(
            FetchDescriptor<SyncCursor>(predicate: #Predicate { $0.storageKey == cursorKey })
        )
        for existing in existingCursors { context.delete(existing) }
        context.insert(
            SyncCursor(
                accountNamespace: cursor.accountNamespace,
                audience: cursor.audience,
                cursor: cursor.cursor,
                lastAppliedAt: cursor.lastAppliedAt
            )
        )
        try context.save()
    }

    public func cursor(accountNamespace: String, audience: String) throws -> String? {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let storageKey = "\(accountNamespace):\(audience)"
        let descriptor = FetchDescriptor<SyncCursor>(
            predicate: #Predicate { $0.storageKey == storageKey }
        )
        return try ModelContext(container).fetch(descriptor).first?.cursor
    }

    public func pendingOperations(
        accountNamespace: String,
        readyAt: Date,
        limit: Int
    ) throws -> [PendingOperationSnapshot] {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let descriptor = FetchDescriptor<PendingOperation>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace },
            sortBy: [
                SortDescriptor(\.createdAt, order: .forward),
                SortDescriptor(\.mutationId, order: .forward),
            ]
        )
        return try ModelContext(container).fetch(descriptor)
            .filter {
                ($0.state == PendingOperationState.queued.rawValue
                    || $0.state == PendingOperationState.retryScheduled.rawValue)
                    && ($0.nextAttemptAt.map { $0 <= readyAt } ?? true)
            }
            .prefix(max(0, limit))
            .map(PendingOperationSnapshot.init)
    }

    public func setOperationState(
        accountNamespace: String,
        mutationIDs: [String],
        state: PendingOperationState,
        nextAttemptAt: Date? = nil,
        delete: Bool = false
    ) throws {
        guard let container, !mutationIDs.isEmpty else {
            if container == nil { throw SafeStoreFailure.storeOpenFailed }
            return
        }
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<PendingOperation>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        for operation in try context.fetch(descriptor) where mutationIDs.contains(operation.mutationId) {
            if delete {
                context.delete(operation)
            } else {
                operation.state = state.rawValue
                operation.nextAttemptAt = nextAttemptAt
                if state == .retryScheduled { operation.attemptCount += 1 }
            }
        }
        try context.save()
    }

    public func persist(conflict: SyncConflictWrite) throws {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let context = ModelContext(container)
        context.insert(
            SyncConflict(
                accountNamespace: conflict.accountNamespace,
                conflictId: conflict.conflictID,
                targetKind: conflict.targetKind,
                targetId: conflict.targetID,
                localMutationId: conflict.localMutationID,
                detectedAt: conflict.detectedAt,
                envelopeVersion: conflict.envelopeVersion,
                nonce: conflict.nonce,
                ciphertextAndTag: conflict.ciphertextAndTag
            )
        )
        try context.save()
    }

    public func record(
        accountNamespace: String,
        kind: LocalRecordKind,
        recordID: String
    ) throws -> EncryptedRecordSnapshot? {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let storageKey = "\(accountNamespace):\(kind.rawValue):\(recordID)"
        let descriptor = FetchDescriptor<EncryptedRecord>(
            predicate: #Predicate { $0.storageKey == storageKey }
        )
        return try ModelContext(container).fetch(descriptor).first.map(EncryptedRecordSnapshot.init)
    }

    public func counts(accountNamespace: String) throws -> (records: Int, operations: Int) {
        guard let container else { throw SafeStoreFailure.storeOpenFailed }
        let records = FetchDescriptor<EncryptedRecord>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        let operations = FetchDescriptor<PendingOperation>(
            predicate: #Predicate { $0.accountNamespace == accountNamespace }
        )
        let context = ModelContext(container)
        return (try context.fetchCount(records), try context.fetchCount(operations))
    }

    private func protect(directory: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        #endif
    }
}

public struct EncryptedRecordSnapshot: Sendable {
    public let accountNamespace: String
    public let recordKind: String
    public let recordID: String
    public let envelopeVersion: Int
    public let nonce: Data
    public let ciphertextAndTag: Data

    init(_ record: EncryptedRecord) {
        accountNamespace = record.accountNamespace
        recordKind = record.recordKind
        recordID = record.recordId
        envelopeVersion = record.envelopeVersion
        nonce = record.nonce
        ciphertextAndTag = record.ciphertextAndTag
    }
}

public struct PendingOperationSnapshot: Sendable {
    public let mutationID: String
    public let operationKind: String
    public let targetKind: String
    public let targetID: String
    public let baseVersion: Int?
    public let createdAt: Date
    public let nonce: Data
    public let ciphertextAndTag: Data

    init(_ operation: PendingOperation) {
        mutationID = operation.mutationId
        operationKind = operation.operationKind
        targetKind = operation.targetKind
        targetID = operation.targetId
        baseVersion = operation.baseVersion
        createdAt = operation.createdAt
        nonce = operation.nonce
        ciphertextAndTag = operation.ciphertextAndTag
    }
}

public struct EncryptedRecordWrite: Sendable {
    public let accountNamespace: String
    public let kind: LocalRecordKind
    public let recordID: String
    public let serverVersion: Int
    public let updatedAt: Date
    public let envelopeVersion: Int
    public let nonce: Data
    public let ciphertextAndTag: Data
}

public struct SyncCursorWrite: Sendable {
    public let accountNamespace: String
    public let audience: String
    public let cursor: String
    public let lastAppliedAt: Date
}

public struct SyncConflictWrite: Sendable {
    public let accountNamespace: String
    public let conflictID: String
    public let targetKind: String
    public let targetID: String
    public let localMutationID: String
    public let detectedAt: Date
    public let envelopeVersion: Int
    public let nonce: Data
    public let ciphertextAndTag: Data
}
