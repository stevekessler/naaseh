import Foundation

public enum ListVisibility: String, Codable, Sendable { case owner, group }
public enum ListLifecycle: String, Codable, Sendable { case active, archived }
public struct ListItemRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public var label: String
    public var globalItemID: String?
    public var value: Decimal
    public var credit: Decimal
    public var order: Int
    public var completed: Bool
    public var overrideValue: Decimal?
    public init(id: String = UUID().uuidString, label: String, globalItemID: String? = nil, value: Decimal = 0, credit: Decimal = 0, order: Int = 0, completed: Bool = false, overrideValue: Decimal? = nil) {
        self.id = id; self.label = label; self.globalItemID = globalItemID; self.value = value
        self.credit = credit; self.order = order; self.completed = completed; self.overrideValue = overrideValue
    }
}
public struct ListRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public var name: String
    public var ownerID: String
    public var visibility: ListVisibility
    public var lifecycle: ListLifecycle
    public var items: [ListItemRecord]
    public var version: Int
    public init(id: String = UUID().uuidString, name: String, ownerID: String, visibility: ListVisibility = .owner, lifecycle: ListLifecycle = .active, items: [ListItemRecord] = [], version: Int = 1) {
        self.id = id; self.name = name; self.ownerID = ownerID; self.visibility = visibility
        self.lifecycle = lifecycle; self.items = items; self.version = version
    }
}
public struct GlobalListItem: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public var label: String
    public var defaultValue: Decimal
    public init(id: String = UUID().uuidString, label: String, defaultValue: Decimal = 0) { self.id = id; self.label = label; self.defaultValue = defaultValue }
}
public enum ListServiceError: Error, Equatable, Sendable { case notFound, unauthorized, conflict, invalidOrder }

public actor ListService {
    private let actorID: String
    private var lists: [String: ListRecord] = [:]
    private var globals: [String: GlobalListItem] = [:]
    private var receipts: [String: String] = [:]
    public init(actorID: String) { self.actorID = actorID }

    public func save(_ list: ListRecord, mutationID: String, baseVersion: Int? = nil) throws -> ListRecord {
        if let id = receipts[mutationID], let duplicate = lists[id] { return duplicate }
        guard list.ownerID == actorID else { throw ListServiceError.unauthorized }
        if let current = lists[list.id], baseVersion != nil, current.version != baseVersion { throw ListServiceError.conflict }
        guard Set(list.items.map(\.order)).count == list.items.count else { throw ListServiceError.invalidOrder }
        var next = list; next.version = (lists[list.id]?.version ?? 0) + 1
        next.items.sort { $0.order < $1.order }; lists[next.id] = next; receipts[mutationID] = next.id
        return next
    }
    public func saveGlobal(_ item: GlobalListItem) { globals[item.id] = item }
    public func globalItems() -> [GlobalListItem] { globals.values.sorted { $0.label < $1.label } }
    public func all(includeArchived: Bool = false) -> [ListRecord] { lists.values.filter { includeArchived || $0.lifecycle == .active }.sorted { $0.name < $1.name } }
    public func completeItem(listID: String, itemID: String, completed: Bool) throws -> ListRecord { try mutate(listID) { list in guard let index = list.items.firstIndex(where: { $0.id == itemID }) else { throw ListServiceError.notFound }; list.items[index].completed = completed } }
    public func overrideValue(listID: String, itemID: String, value: Decimal?) throws -> ListRecord { try mutate(listID) { list in guard let index = list.items.firstIndex(where: { $0.id == itemID }) else { throw ListServiceError.notFound }; list.items[index].overrideValue = value } }
    public func resetOverrides(listID: String) throws -> ListRecord { try mutate(listID) { list in for index in list.items.indices { list.items[index].overrideValue = nil } } }
    public func reorder(listID: String, itemIDs: [String]) throws -> ListRecord { try mutate(listID) { list in guard Set(itemIDs) == Set(list.items.map(\.id)) else { throw ListServiceError.invalidOrder }; let byID = Dictionary(uniqueKeysWithValues: list.items.map { ($0.id, $0) }); list.items = try itemIDs.enumerated().map { index, id in guard var item = byID[id] else { throw ListServiceError.invalidOrder }; item.order = index; return item } } }
    public func archive(listID: String) throws -> ListRecord { try mutate(listID) { $0.lifecycle = .archived } }
    public func copy(listID: String, name: String) throws -> ListRecord { guard let source = lists[listID] else { throw ListServiceError.notFound }; let items = source.items.enumerated().map { index, item in ListItemRecord(label: item.label, globalItemID: item.globalItemID, value: item.value, credit: item.credit, order: index) }; let copy = ListRecord(name: name, ownerID: actorID, visibility: source.visibility, items: items); lists[copy.id] = copy; return copy }
    private func mutate(_ id: String, change: (inout ListRecord) throws -> Void) throws -> ListRecord { guard var value = lists[id] else { throw ListServiceError.notFound }; guard value.ownerID == actorID else { throw ListServiceError.unauthorized }; try change(&value); value.version += 1; lists[id] = value; return value }
}
