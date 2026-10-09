import Foundation

public struct JournalDocument: Codable, Equatable, Sendable {
    public struct Block: Codable, Equatable, Identifiable, Sendable {
        public let id: String
        public var style: String
        public var text: String
        public var marks: [String]
        public var link: URL?
        public init(id: String = UUID().uuidString, style: String = "paragraph", text: String, marks: [String] = [], link: URL? = nil) {
            self.id = id; self.style = style; self.text = text; self.marks = marks; self.link = link
        }
    }
    public var version = 1
    public var blocks: [Block]
    public init(blocks: [Block] = []) { self.blocks = blocks }
}

public struct JournalProfile: Codable, Equatable, Sendable {
    public let ownerID: String
    public var suicidalSelfHarmEnabled: Bool
    public var dbtSkillsEnabled: Bool
    public init(ownerID: String, suicidalSelfHarmEnabled: Bool = true, dbtSkillsEnabled: Bool = true) {
        self.ownerID = ownerID; self.suicidalSelfHarmEnabled = suicidalSelfHarmEnabled; self.dbtSkillsEnabled = dbtSkillsEnabled
    }
}

public struct JournalProjection: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let ownerID: String
    public var date: String
    public var values: [String: Double]
    public var flags: [String: Bool]
    public var emotions: [String: Int]
    public var dbtSkills: [String]
    public let createdAt: Date
    public var updatedAt: Date
    public init(id: String, ownerID: String, date: String, values: [String: Double] = [:], flags: [String: Bool] = [:], emotions: [String: Int] = [:], dbtSkills: [String] = [], createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.ownerID = ownerID; self.date = date; self.values = values
        self.flags = flags; self.emotions = emotions; self.dbtSkills = dbtSkills
        self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}

public struct JournalBody: Codable, Equatable, Sendable {
    public let entryID: String
    public var generalNotes: JournalDocument?
    public var reflectedTaskID: String?
    public var taskReflection: JournalDocument?
    public init(entryID: String, generalNotes: JournalDocument? = nil, reflectedTaskID: String? = nil, taskReflection: JournalDocument? = nil) {
        self.entryID = entryID; self.generalNotes = generalNotes; self.reflectedTaskID = reflectedTaskID; self.taskReflection = taskReflection
    }
}

public struct JournalEntry: Equatable, Identifiable, Sendable {
    public let id: String
    public let version: Int
    public let projection: JournalProjection
    public let body: JournalBody
    public let pendingSync: Bool
    public init(id: String, version: Int, projection: JournalProjection, body: JournalBody, pendingSync: Bool) {
        self.id = id; self.version = version; self.projection = projection; self.body = body; self.pendingSync = pendingSync
    }
}

public struct JournalFilter: Sendable {
    public var start: String?
    public var end: String?
    public var skill: String?
    public init(start: String? = nil, end: String? = nil, skill: String? = nil) {
        self.start = start; self.end = end; self.skill = skill
    }
}

public enum JournalServiceError: Error, Equatable, Sendable {
    case crisisPlanRequired, notFound, unauthorized, conflict(currentVersion: Int), deleteProhibited, invalidValue
}

public actor JournalService {
    private struct Stored: Sendable { var version: Int; var encrypted: JournalEncryptedEntry; var pending: Bool }
    private let ownerID: String
    private let crypto: JournalCryptoService
    private let hasCrisisPlan: @Sendable () async -> Bool
    private var profile: JournalProfile
    private var entries: [String: Stored] = [:]
    private var mutationReceipts: [String: String] = [:]

    public init(ownerID: String, crypto: JournalCryptoService, hasCrisisPlan: @escaping @Sendable () async -> Bool) {
        self.ownerID = ownerID; self.crypto = crypto; self.hasCrisisPlan = hasCrisisPlan
        profile = JournalProfile(ownerID: ownerID)
    }

    public func updateProfile(_ value: JournalProfile) throws {
        guard value.ownerID == ownerID else { throw JournalServiceError.unauthorized }
        profile = value
    }

    public func currentProfile() -> JournalProfile { profile }

    public func save(
        mutationID: String,
        projection: JournalProjection,
        body: JournalBody,
        baseVersion: Int
    ) async throws -> JournalEntry {
        if let entryID = mutationReceipts[mutationID] { return try await read(entryID) }
        guard projection.ownerID == ownerID, body.entryID == projection.id else { throw JournalServiceError.unauthorized }
        guard await hasCrisisPlan() else { throw JournalServiceError.crisisPlanRequired }
        try validate(projection)
        let current = entries[projection.id]
        guard (current?.version ?? 0) == baseVersion else {
            throw JournalServiceError.conflict(currentVersion: current?.version ?? 0)
        }
        let duplicateDate = try await list(filter: .init(start: projection.date, end: projection.date))
            .first { $0.id != projection.id }
        guard duplicateDate == nil else { throw JournalServiceError.conflict(currentVersion: 0) }
        let encrypted = try await crypto.sealEntry(
            ownerID: ownerID, entryID: projection.id, localDate: projection.date,
            projection: projection, body: body
        )
        let version = baseVersion + 1
        entries[projection.id] = .init(version: version, encrypted: encrypted, pending: true)
        mutationReceipts[mutationID] = projection.id
        return .init(id: projection.id, version: version, projection: projection, body: body, pendingSync: true)
    }

    public func read(_ entryID: String) async throws -> JournalEntry {
        guard let stored = entries[entryID] else { throw JournalServiceError.notFound }
        let projection = try await crypto.open(
            JournalProjection.self, envelope: stored.encrypted.projection,
            ownerID: ownerID, recordID: entryID, dateToken: stored.encrypted.dateToken
        )
        let body = try await crypto.open(
            JournalBody.self, envelope: stored.encrypted.body,
            ownerID: ownerID, recordID: entryID, dateToken: stored.encrypted.dateToken
        )
        return .init(id: entryID, version: stored.version, projection: projection, body: body, pendingSync: stored.pending)
    }

    public func list(filter: JournalFilter = .init()) async throws -> [JournalEntry] {
        var result: [JournalEntry] = []
        for id in entries.keys { result.append(try await read(id)) }
        return result.filter {
            (filter.start == nil || $0.projection.date >= filter.start!) &&
            (filter.end == nil || $0.projection.date <= filter.end!) &&
            (filter.skill == nil || $0.projection.dbtSkills.contains(filter.skill!))
        }.sorted { $0.projection.date > $1.projection.date }
    }

    public func delete(_: String) throws -> Never { throw JournalServiceError.deleteProhibited }
    public func markSynced(_ entryID: String) { entries[entryID]?.pending = false }

    private func validate(_ value: JournalProjection) throws {
        guard value.date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              value.emotions.values.allSatisfy({ 0 ... 100 ~= $0 }),
              value.values["hoursOfSleep"].map({ 0 ... 24 ~= $0 && ($0 * 2).rounded() == $0 * 2 }) ?? true
        else { throw JournalServiceError.invalidValue }
    }
}
