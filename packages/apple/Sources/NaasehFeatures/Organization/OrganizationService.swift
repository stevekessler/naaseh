import Foundation

public struct OrganizationProject: Codable, Equatable, Identifiable, Sendable { public let id: String; public let name: String; public let active: Bool; public let authorized: Bool; public init(id: String, name: String, active: Bool = true, authorized: Bool = true) { self.id = id; self.name = name; self.active = active; self.authorized = authorized } }
public struct OrganizationCategory: Codable, Equatable, Identifiable, Sendable { public let id: String; public let name: String; public let active: Bool; public let authorized: Bool; public init(id: String, name: String, active: Bool = true, authorized: Bool = true) { self.id = id; self.name = name; self.active = active; self.authorized = authorized } }
public struct OrganizationGroup: Codable, Equatable, Identifiable, Sendable { public let id: String; public let name: String; public let memberIDs: [String]; public let authorized: Bool; public init(id: String, name: String, memberIDs: [String], authorized: Bool = true) { self.id = id; self.name = name; self.memberIDs = memberIDs; self.authorized = authorized } }
public struct UserOwnedWork: Codable, Equatable, Identifiable, Sendable { public let id: String; public let ownerID: String; public var title: String; public var archived: Bool; public var projectID: String?; public var categoryID: String?; public init(id: String, ownerID: String, title: String, archived: Bool = false, projectID: String? = nil, categoryID: String? = nil) { self.id = id; self.ownerID = ownerID; self.title = title; self.archived = archived; self.projectID = projectID; self.categoryID = categoryID } }
public struct WorkloadSummary: Equatable, Sendable { public let projectID: String; public let activeCount: Int; public let warning: String? }
public enum OrganizationError: Error, Equatable, Sendable { case notFound, unauthorized, projectLifecycleWebOnly, categoryLifecycleWebOnly }

public actor OrganizationService {
    private let actorID: String
    private var projects: [OrganizationProject]
    private var categories: [OrganizationCategory]
    private var groups: [OrganizationGroup]
    private var work: [String: UserOwnedWork]
    public init(actorID: String, projects: [OrganizationProject], categories: [OrganizationCategory], groups: [OrganizationGroup] = [], work: [UserOwnedWork] = []) { self.actorID = actorID; self.projects = projects; self.categories = categories; self.groups = groups; self.work = Dictionary(uniqueKeysWithValues: work.map { ($0.id, $0) }) }
    public func authorizedProjects() -> [OrganizationProject] { projects.filter { $0.active && $0.authorized }.sorted { $0.name < $1.name } }
    public func authorizedCategories() -> [OrganizationCategory] { categories.filter { $0.active && $0.authorized }.sorted { $0.name < $1.name } }
    public func authorizedGroups() -> [OrganizationGroup] { groups.filter { $0.authorized && $0.memberIDs.contains(actorID) }.sorted { $0.name < $1.name } }
    public func assign(workID: String, projectID: String?, categoryID: String?) throws -> UserOwnedWork { guard var item = work[workID] else { throw OrganizationError.notFound }; guard item.ownerID == actorID else { throw OrganizationError.unauthorized }; if let projectID, !authorizedProjects().contains(where: { $0.id == projectID }) { throw OrganizationError.unauthorized }; if let categoryID, !authorizedCategories().contains(where: { $0.id == categoryID }) { throw OrganizationError.unauthorized }; item.projectID = projectID; item.categoryID = categoryID; work[item.id] = item; return item }
    public func workloads(warningAt: Int = 20) -> [WorkloadSummary] { authorizedProjects().map { project in let count = work.values.filter { !$0.archived && $0.projectID == project.id }.count; return .init(projectID: project.id, activeCount: count, warning: count >= warningAt ? "High workload" : nil) } }
    public func archive(workID: String) throws -> UserOwnedWork { try mutate(workID) { $0.archived = true } }
    public func restore(workID: String) throws -> UserOwnedWork { try mutate(workID) { $0.archived = false } }
    public func delete(workID: String) throws { guard let item = work[workID] else { throw OrganizationError.notFound }; guard item.ownerID == actorID else { throw OrganizationError.unauthorized }; work.removeValue(forKey: workID) }
    public func createProject() throws -> Never { throw OrganizationError.projectLifecycleWebOnly }
    public func editCategory() throws -> Never { throw OrganizationError.categoryLifecycleWebOnly }
    private func mutate(_ id: String, _ change: (inout UserOwnedWork) -> Void) throws -> UserOwnedWork { guard var item = work[id] else { throw OrganizationError.notFound }; guard item.ownerID == actorID else { throw OrganizationError.unauthorized }; change(&item); work[id] = item; return item }
}
