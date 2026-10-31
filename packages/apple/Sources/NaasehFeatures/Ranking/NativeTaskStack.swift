import Foundation
import NaasehContracts
import NaasehServices

public struct NativeStackReference: Codable, Equatable, Sendable {
    public let workType: String
    public let workId: String
    public let membershipEpoch: String
    public init(task: TaskRecord) {
        workType = "task"; workId = task.id
        membershipEpoch = task.stackMembershipEpoch ?? NativeAccountTaskTimer.instant(task.createdAt)
    }
}

public struct NativeTaskStack: Codable, Sendable {
    public var id: String
    public var projectID: String?
    public var version: Int
    public var references: [NativeStackReference]
    public init(ownerID: String, projectID: String?, version: Int, references: [NativeStackReference]) {
        id = projectID ?? "\(ownerID):overall"; self.projectID = projectID
        self.version = version; self.references = references
    }
    public func moving(taskID: String, to index: Int, affectedTaskIDs: [String] = [],
                       filterBasis: [String: JSONValue] = [:]) throws -> (stack: Self, payload: JSONValue) {
        func json(_ ref: NativeStackReference) throws -> JSONValue {
            try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(ref))
        }
        var next = self
        var move: [String: JSONValue]
        if !affectedTaskIDs.isEmpty {
            let affectedSet = Set(affectedTaskIDs)
            let slots = references.indices.filter { references[$0].workType == "task" && affectedSet.contains(references[$0].workId) }
            let affected = slots.map { references[$0] }
            guard affected.count == affectedSet.count,
                  let source = affected.firstIndex(where: { $0.workId == taskID }), affected.indices.contains(index) else {
                throw RankingError.invalidPosition
            }
            var reordered = affected
            let moved = reordered.remove(at: source)
            reordered.insert(moved, at: index)
            for (slot, reference) in zip(slots, reordered) { next.references[slot] = reference }
            var basis: [String: JSONValue] = ["lifecycle": .string("active"), "contentType": .string("todos"), "match": .string("all")]
            for (key, value) in filterBasis { basis[key] = value }
            move = ["kind": .string("filtered_permutation"), "movedWork": try json(moved),
                    "destinationIndex": .number(Decimal(index)), "affectedWork": .array(try affected.map(json)),
                    "filterBasis": .object(basis)]
        } else {
            guard let source = references.firstIndex(where: { $0.workType == "task" && $0.workId == taskID }),
                  references.indices.contains(index) else { throw RankingError.invalidPosition }
            let moved = next.references.remove(at: source)
            next.references.insert(moved, at: index)
            move = ["kind": .string("simple_move"), "movedWork": try json(moved)]
            if index > 0 { move["beforeWork"] = try json(next.references[index - 1]) }
            if index + 1 < next.references.count { move["afterWork"] = try json(next.references[index + 1]) }
        }
        next.version += 1
        return (next, .object(["scope": .string(projectID == nil ? "overall" : "project"),
                              "baseVersion": .number(Decimal(version)), "move": .object(move)]))
    }

}

public actor NativeTaskStackClient {
    private let client: APIClient
    private let credential: @Sendable () async throws -> NativeSessionCredential
    public init(client: APIClient, credential: @escaping @Sendable () async throws -> NativeSessionCredential) {
        self.client = client; self.credential = credential
    }
    public func load(ownerID: String, projectID: String?) async throws -> NativeTaskStack {
        struct Page: Decodable {
            struct Item: Decodable { let work: NativeStackReference }
            let version: Int
            let items: [Item]
            let nextCursor: String?
        }
        let path: String
        if let projectID {
            guard projectID.count == 26, projectID.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else {
                throw APIClientError.disallowedURL
            }
            path = "/api/v1/projects/\(projectID)/stack"
        } else { path = "/api/v1/stacks/overall" }
        var cursor: String?
        var version: Int?
        var references: [NativeStackReference] = []
        var visited: Set<String> = []
        repeat {
            let query = cursor.map { "&cursor=\($0.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")" } ?? ""
            let response = try await client.request(path: "\(path)?limit=200\(query)", session: try await credential())
            try response.requireValidSession()
            guard response.statusCode == 200 else { throw APIClientError.invalidResponse }
            let page = try JSONDecoder().decode(Page.self, from: response.body)
            guard version == nil || version == page.version else { throw TaskCommandError.conflict(currentVersion: page.version) }
            version = page.version
            references += page.items.map(\.work)
            cursor = page.nextCursor
            if let cursor, !visited.insert(cursor).inserted { throw APIClientError.invalidResponse }
        } while cursor != nil
        return NativeTaskStack(ownerID: ownerID, projectID: projectID, version: version ?? 0, references: references)
    }
}
