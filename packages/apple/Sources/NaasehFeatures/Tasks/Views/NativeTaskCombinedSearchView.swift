import SwiftUI
import NaasehContracts

public struct NativeTaskCombinedSearchView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @Bindable var model: TaskWorkspaceModel
    @State private var scope = "all"
    @State private var lists: [JSONValue] = []
    @State private var items: [JSONValue] = []
    @State private var error: String?
    private struct SearchList: Identifiable { let record: TaskRecord; let value: JSONValue; var id: String { record.id } }
    private var visibleLists: [SearchList] {
        lists.compactMap { value in
            guard case let .object(fields) = value, case let .string(id) = fields["id"],
                  case let .string(owner) = fields["ownerId"], case let .string(name) = fields["name"] else { return nil }
            func string(_ key: String) -> String? { if case let .string(v) = fields[key] { return v }; return nil }
            var record = try? TaskRecord.create(id: id, label: name, ownerID: owner,
                memo: string("memo") ?? "", assigneeID: string("assigneeId"), categoryID: string("categoryId"),
                projectID: string("projectId"), groupID: string("groupId"),
                visibility: TaskVisibility(rawValue: string("visibility") ?? "public") ?? .public,
                urgency: TaskUrgency(rawValue: string("urgency") ?? "medium") ?? .medium)
            if string("lifecycle") == "archived" || string("status") == "archived" { record?.lifecycle = .archived }
            if let due = string("dueDate") { record?.due = try? .date(due) }
            if let due = string("dueAt"), let date = NativeAccountTaskTimer.date(due) { record?.due = try? .timed(date, timeZoneIdentifier: TimeZone.current.identifier) }
            if case let .number(progress) = fields["percentComplete"] { record?.percentComplete = NSDecimalNumber(decimal: progress).intValue }
            guard let record, model.filters.matches(record, text: model.searchText, urgencies: model.selectedUrgencies,
                project: model.selectedProjectID, category: model.selectedCategoryID, assignee: model.selectedAssigneeID,
                group: model.selectedGroupID, actorID: model.references.actorID, memberships: model.references.memberships) else { return nil }
            return SearchList(record: record, value: value)
        }
    }
    public var body: some View {
        List {
            Picker("Content", selection: $scope) { Text("All").tag("all"); Text("Tasks").tag("tasks"); Text("Lists").tag("lists") }
            if scope != "lists" {
                Section("Tasks") {
                    ForEach(model.visibleTasks) { task in
                        Button(task.label) { model.selectedTaskID = task.id; dismiss() }
                    }
                }
            }
            if scope != "tasks" {
                Section("Lists") {
                    ForEach(visibleLists) { list in
                        NavigationLink(list.record.label) {
                            List {
                                if !list.record.memo.isEmpty { Text(list.record.memo) }
                                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                                    if case let .object(fields) = item, fields["listId"] == .string(list.id), case let .string(label) = fields["label"] {
                                        Label(label, systemImage: fields["completed"] == .bool(true) ? "checkmark.circle.fill" : "circle")
                                    }
                                }
                            }.navigationTitle(list.record.label)
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .searchable(text: $model.searchText, prompt: "Search tasks and lists")
        .navigationTitle("Search")
        .toolbar { Button("Done") { dismiss() } }
        .task {
            do {
                let cachedLists = try await model.cachedValues(.list)
                let cachedItems = try await model.cachedValues(.listItem)
                try Task.checkCancellation()
                lists = cachedLists; items = cachedItems
            } catch { self.error = error.localizedDescription }
        }
        .onDisappear { lists = []; items = [] }
        .onChange(of: phase) { _, value in if value != .active { lists = []; items = []; dismiss() } }
    }
}
