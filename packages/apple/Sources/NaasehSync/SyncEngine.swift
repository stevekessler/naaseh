import Foundation

public struct NativeSyncRecord: Equatable, Sendable {
    public let kind: String
    public let id: String
    public let version: Int
    public let payload: Data

    public init(kind: String, id: String, version: Int, payload: Data) {
        self.kind = kind; self.id = id; self.version = version; self.payload = payload
    }
}

public struct NativeSyncOperation: Equatable, Sendable {
    public let id: String
    public let targetKind: String
    public let targetID: String
    public let baseVersion: Int?
    public let payload: Data
    public let createdAt: Date

    public init(id: String, targetKind: String, targetID: String, baseVersion: Int?, payload: Data, createdAt: Date) {
        self.id = id; self.targetKind = targetKind; self.targetID = targetID
        self.baseVersion = baseVersion; self.payload = payload; self.createdAt = createdAt
    }
}

public enum NativePushDisposition: Sendable { case applied, duplicate, conflict, rejected }

public struct NativePushResult: Sendable {
    public let mutationID: String
    public let disposition: NativePushDisposition

    public init(mutationID: String, disposition: NativePushDisposition) {
        self.mutationID = mutationID; self.disposition = disposition
    }
}

public struct NativeSyncPage: Sendable {
    public let records: [NativeSyncRecord]
    public let cursor: String
    public let revokedAudiences: [String]

    public init(records: [NativeSyncRecord], cursor: String, revokedAudiences: [String] = []) {
        self.records = records; self.cursor = cursor; self.revokedAudiences = revokedAudiences
    }
}

public protocol NativeSyncTransport: Sendable {
    func bootstrap() async throws -> NativeSyncPage
    func pull(cursor: String?) async throws -> NativeSyncPage
    func push(_ operations: [NativeSyncOperation]) async throws -> [NativePushResult]
}

public protocol NativeSyncStore: Sendable {
    func currentCursor() async -> String?
    func apply(_ page: NativeSyncPage) async throws
    func queuedOperations(readyAt: Date, limit: Int) async throws -> [NativeSyncOperation]
    func markApplied(_ mutationIDs: [String]) async throws
    func markConflicted(_ mutationIDs: [String]) async throws
    func markRejected(_ mutationIDs: [String]) async throws
    func scheduleRetry(_ mutationIDs: [String], at: Date) async throws
    func resolveConflict(mutationID: String, keepLocal: Bool) async throws
}

public enum SyncEngineError: Error, Equatable, Sendable { case transport, malformedReceipt }

public actor SyncEngine {
    private let store: any NativeSyncStore
    private let transport: any NativeSyncTransport
    private let batchSize: Int
    private var retryAttempt = 0
    public private(set) var connectivity: NativeSyncConnectivity = .online

    public init(store: any NativeSyncStore, transport: any NativeSyncTransport, batchSize: Int = 50) {
        self.store = store; self.transport = transport; self.batchSize = max(1, min(50, batchSize))
    }

    public func bootstrap() async throws {
        do { try await store.apply(try await transport.bootstrap()) }
        catch let error as SyncEngineError { throw error }
        catch { throw SyncEngineError.transport }
    }

    public func pull() async throws {
        do { try await store.apply(try await transport.pull(cursor: await store.currentCursor())) }
        catch let error as SyncEngineError { throw error }
        catch { throw SyncEngineError.transport }
    }

    public func push(now: Date = Date()) async throws {
        let operations = try await store.queuedOperations(readyAt: now, limit: batchSize)
            .sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
        guard !operations.isEmpty else { return }
        let results: [NativePushResult]
        do { results = try await transport.push(operations) }
        catch {
            retryAttempt += 1
            let delay = min(300, pow(2, Double(retryAttempt)))
            try await store.scheduleRetry(operations.map(\.id), at: now.addingTimeInterval(delay))
            throw SyncEngineError.transport
        }
        retryAttempt = 0
        guard Set(results.map(\.mutationID)).isSubset(of: Set(operations.map(\.id))) else {
            throw SyncEngineError.malformedReceipt
        }
        try await store.markApplied(results.filter { $0.disposition == .applied || $0.disposition == .duplicate }.map(\.mutationID))
        try await store.markConflicted(results.filter { $0.disposition == .conflict }.map(\.mutationID))
        try await store.markRejected(results.filter { $0.disposition == .rejected }.map(\.mutationID))
    }

    public func manualRefresh(now: Date = Date()) async throws {
        try await push(now: now)
        try await pull()
    }

    public func connectivityChanged(to state: NativeSyncConnectivity, now: Date = Date()) async {
        connectivity = state
        guard state == .online else { return }
        try? await manualRefresh(now: now)
    }

    public func resolveConflict(mutationID: String, keepLocal: Bool) async throws {
        try await store.resolveConflict(mutationID: mutationID, keepLocal: keepLocal)
        if keepLocal { try await push() }
    }
}

public enum NativeSyncConnectivity: String, Sendable { case online, offline, reconnecting }

public actor InMemoryNativeSyncStore: NativeSyncStore {
    public private(set) var cursor: String?
    public private(set) var records: [String: NativeSyncRecord] = [:]
    public private(set) var atomicApplications = 0
    public private(set) var applied: [String] = []
    public private(set) var conflicts: [String] = []
    public private(set) var rejected: [String] = []
    public private(set) var retryDates: [String: Date] = [:]
    public private(set) var revoked: [String] = []
    private var operations: [NativeSyncOperation] = []
    private var audiences: [String: Set<String>] = [:]

    public init() {}
    public func currentCursor() -> String? { cursor }
    public func enqueue(_ operation: NativeSyncOperation) {
        guard !operations.contains(where: { $0.id == operation.id }) else { return }
        operations.append(operation)
    }
    public func seed(audience: String, record: NativeSyncRecord) {
        let key = "\(record.kind):\(record.id)"; records[key] = record
        audiences[audience, default: []].insert(key)
    }
    public func apply(_ page: NativeSyncPage) {
        for audience in page.revokedAudiences {
            for key in audiences.removeValue(forKey: audience) ?? [] { records.removeValue(forKey: key) }
            revoked.append(audience)
        }
        for record in page.records { records["\(record.kind):\(record.id)"] = record }
        cursor = page.cursor
        atomicApplications += 1
    }
    public func queuedOperations(readyAt: Date, limit: Int) -> [NativeSyncOperation] {
        Array(operations.filter { retryDates[$0.id].map { $0 <= readyAt } ?? true }.prefix(limit))
    }
    public func markApplied(_ ids: [String]) { applied += ids; remove(ids) }
    public func markConflicted(_ ids: [String]) { conflicts += ids; remove(ids) }
    public func markRejected(_ ids: [String]) { rejected += ids; remove(ids) }
    public func scheduleRetry(_ ids: [String], at: Date) { for id in ids { retryDates[id] = at } }
    public func resolveConflict(mutationID: String, keepLocal: Bool) {
        conflicts.removeAll { $0 == mutationID }
        if !keepLocal { operations.removeAll { $0.id == mutationID } }
    }
    private func remove(_ ids: [String]) { operations.removeAll { ids.contains($0.id) } }
}
