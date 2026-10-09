import Foundation

public enum RankingScope: Hashable, Sendable {
    case overall(userID: String)
    case project(userID: String, projectID: String)
}

public struct RankedWorkReference: Codable, Equatable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case task, list }
    public let kind: Kind
    public let workID: String
    public let membershipEpoch: String

    public init(kind: Kind, workID: String, membershipEpoch: String) {
        self.kind = kind
        self.workID = workID
        self.membershipEpoch = membershipEpoch
    }
}

public struct RankingMove: Equatable, Sendable {
    public let mutationID: String
    public let scope: RankingScope
    public let moved: RankedWorkReference
    public let destinationIndex: Int
    public let affected: [RankedWorkReference]
}

public enum RankingError: Error, Equatable, Sendable { case unauthorized, itemMissing, invalidPosition }

public actor RankingService {
    private let userID: String
    private var stacks: [RankingScope: [RankedWorkReference]] = [:]
    public private(set) var pendingMoves: [RankingMove] = []

    public init(userID: String) { self.userID = userID }

    public func seed(_ values: [RankedWorkReference], scope: RankingScope) throws {
        try authorize(scope)
        stacks[scope] = values
    }

    public func read(scope: RankingScope) throws -> [RankedWorkReference] {
        try authorize(scope)
        return stacks[scope] ?? []
    }

    public func move(
        _ work: RankedWorkReference,
        to destinationIndex: Int,
        scope: RankingScope,
        mutationID: String = UUID().uuidString
    ) throws {
        try authorize(scope)
        var values = stacks[scope] ?? []
        guard let source = values.firstIndex(of: work) else { throw RankingError.itemMissing }
        guard destinationIndex >= 0, destinationIndex < values.count else {
            throw RankingError.invalidPosition
        }
        values.remove(at: source)
        values.insert(work, at: destinationIndex)
        stacks[scope] = values
        pendingMoves.append(.init(
            mutationID: mutationID,
            scope: scope,
            moved: work,
            destinationIndex: destinationIndex,
            affected: values
        ))
    }

    public func moveUp(_ work: RankedWorkReference, scope: RankingScope) throws {
        let values = try read(scope: scope)
        guard let index = values.firstIndex(of: work) else { throw RankingError.itemMissing }
        try move(work, to: max(0, index - 1), scope: scope)
    }

    public func moveDown(_ work: RankedWorkReference, scope: RankingScope) throws {
        let values = try read(scope: scope)
        guard let index = values.firstIndex(of: work) else { throw RankingError.itemMissing }
        try move(work, to: min(values.count - 1, index + 1), scope: scope)
    }

    private func authorize(_ scope: RankingScope) throws {
        let owner = switch scope {
        case let .overall(value): value
        case let .project(value, _): value
        }
        guard owner == userID else { throw RankingError.unauthorized }
    }
}
