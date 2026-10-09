import Foundation

public struct AuthorizedProject: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let isActive: Bool
    public let isAuthorized: Bool

    public init(id: String, name: String, isActive: Bool, isAuthorized: Bool) {
        self.id = id; self.name = name; self.isActive = isActive; self.isAuthorized = isAuthorized
    }
}

public enum AuthorizedProjectResolution: Equatable, Sendable {
    case omitted
    case resolved(AuthorizedProject)
    case ambiguous([AuthorizedProject])
    case notFound
}

public struct AuthorizedProjectQuery: Sendable {
    private let projects: [AuthorizedProject]
    public init(projects: [AuthorizedProject]) { self.projects = projects }

    public func resolve(_ term: String?) -> AuthorizedProjectResolution {
        guard let term, !term.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .omitted
        }
        let normalized = normalize(term)
        let authorized = projects.filter { $0.isActive && $0.isAuthorized }
        if let exactID = authorized.first(where: { normalize($0.id) == normalized }) {
            return .resolved(exactID)
        }
        let matches = authorized.filter { normalize($0.name) == normalized }
            .sorted { ($0.name, $0.id) < ($1.name, $1.id) }
        if matches.count == 1 { return .resolved(matches[0]) }
        if matches.count > 1 { return .ambiguous(matches) }
        return .notFound
    }

    public func suggestedProjects(matching term: String) -> [AuthorizedProject] {
        let normalized = normalize(term)
        return projects.filter {
            $0.isActive && $0.isAuthorized && normalize($0.name).contains(normalized)
        }.sorted { ($0.name, $0.id) < ($1.name, $1.id) }
    }

    private func normalize(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
