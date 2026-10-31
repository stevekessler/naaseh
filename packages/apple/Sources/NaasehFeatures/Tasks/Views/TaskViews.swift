import NaasehDesignSystem
import NaasehContracts
import NaasehPersistence
import NaasehSync
import Observation
import SwiftUI

public enum TaskPresentationMode: String, CaseIterable, Identifiable, Sendable {
    case list, postIt
    public var id: String { rawValue }
}

@MainActor
@Observable
public final class TaskWorkspaceModel {
    public var tasks: [TaskRecord] = []
    public var notifications: NativeTaskNotificationCoordinator?
    public var onReferencesChanged: (@MainActor (TaskReferences) async -> Void)?
    public var featureClient: NativeTaskFeatureClient?
    public var attachments: [TaskAttachmentRecord] = []
    public var completionReport: NativeCompletionReport?
    public var completionDetails: [NativeCompletionDetail] = []
    public var selectedTaskID: String?
    public var searchText = ""
    public var filters = NativeTaskFilters()
    public var selectedUrgencies: Set<TaskUrgency> = []
    public var selectedProjectID = ""
    public var selectedCategoryID = ""
    public var selectedAssigneeID = ""
    public var selectedGroupID = ""
    public var sortOrder: TaskSortOrder = .stack
    public var stack: NativeTaskStack?
    public var isMovingTask = false
    public var references = TaskReferences()
    public var timer: NativeAccountTaskTimer?
    public var timerSwitchTaskID: String?
    public var isChangingTimer = false
    public var syncCounts = NativeOperationCounts()
    public var isSaving = false
    public var presentation: TaskPresentationMode = .list
    public var showingEditor = false
    public var editingTask: TaskRecord?
    public var draftParentID: String?
    public var errorMessage: String?
    public var conflict: TaskConflictPresentation?
    public var completionMutationID: String?
    public var completedTaskID: String?

    private var timerClockDate = Date()
    private var timerClockUptime = ProcessInfo.processInfo.systemUptime
    public func timerNow() -> Date { timerClockDate.addingTimeInterval(max(0, ProcessInfo.processInfo.systemUptime - timerClockUptime)) }
    private var contentGeneration = 0
    private let storage: any TaskWorkspaceStorage
    private let afterMutation: @Sendable () async -> Void

    public init(actorID: String, store: InMemoryTaskCommandStore = .init()) {
        storage = InMemoryTaskWorkspaceStorage(actorID: actorID, store: store)
        afterMutation = {}
    }

    public init(
        storage: any TaskWorkspaceStorage,
        afterMutation: @escaping @Sendable () async -> Void
    ) {
        self.storage = storage
        self.afterMutation = afterMutation
    }

    private struct TaskPeopleCache: Codable { let id: String; let people: [TaskReferenceOption] }

    public func cachedValues(_ kind: LocalRecordKind) async throws -> [JSONValue] { try await storage.cachedValues(kind) }
    public func cache<Value: Codable & Sendable>(_ value: Value, kind: LocalRecordKind, id: String, version: Int = 1) async throws {
        let json = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
        let generation = contentGeneration
        guard let account = references.actorID else { throw SecureNativeSyncStoreError.locked }
        try await storage.cache(json, kind: kind, id: id, version: version, expectedAccountID: account)
        guard generation == contentGeneration else { throw SecureNativeSyncStoreError.locked }
    }
    public func refreshAttachments() async throws {
        let generation = contentGeneration
        let values = try await storage.cachedValues(.attachment)
        let loaded = values.compactMap { try? JSONDecoder().decode(TaskAttachmentRecord.self, from: JSONEncoder().encode($0)) }
        guard generation == contentGeneration else { return }
        attachments = loaded.filter { $0.status != "deleted" }
    }
    public func refreshDirectory() async {
        guard let featureClient else { return }
        let generation = contentGeneration
        do {
            let people = try await featureClient.directory()
            let groups = try await featureClient.groups()
            guard generation == contentGeneration else { return }
            references.assignees = people
            references.groups = groups.map { .init(id: $0.id, name: $0.name) }
            references.memberships = Set(groups.filter(\.joined).map(\.id))
            try await cache(TaskPeopleCache(id: "task-people", people: people), kind: .setting, id: "task-people")
            for group in groups { try await cache(group, kind: .group, id: group.id) }
        } catch {
            if let values = try? await storage.cachedValues(.setting) {
                for value in values {
                    if let saved = try? JSONDecoder().decode(TaskPeopleCache.self, from: JSONEncoder().encode(value)), saved.id == "task-people", generation == contentGeneration {
                        references.assignees = saved.people
                    }
                }
            }
        }
    }

    public func saveProtectedMemo(_ package: HiddenMemoPackage, task: TaskRecord) async throws {
        _ = try await storage.edit(.init(mutationID: NativeULID.make(), taskID: task.id, baseVersion: task.version, protectedMemo: package))
        await afterMutation()
        await reload()
    }

    public func reviewOperations() async throws -> [DecryptedPendingOperation] { try await storage.reviewOperations() }
    public func resolveSyncChanges(kind: LocalRecordKind, id: String, remote: JSONValue, version: Int, retry: Bool) async throws {
        let operations = try await storage.reviewOperations().filter { $0.targetKind == kind.rawValue && $0.targetID == id }
        try await storage.resolveTarget(kind: kind, id: id, remote: remote, version: version, retry: retry,
                                        mutationIDs: operations.map { _ in NativeULID.make() })
        await afterMutation()
        await afterMutation()
        await reload()
    }

    public func canEdit(_ task: TaskRecord) -> Bool { references.actorID == nil || references.actorID == task.ownerID }
    public func primaryAction(_ task: TaskRecord) async {
        if task.lifecycle == .archived {
            if task.completionState == .completed { await undo(task) } else { await restore(task) }
        } else { await complete(task) }
    }

    public func voiceService(
        projects: AuthorizedProjectQuery,
        access: @escaping @Sendable () async -> VoiceTaskAccess
    ) -> VoiceTaskService {
        VoiceTaskService(
            projects: projects,
            createTask: { [storage, afterMutation] command in
                let task = try await storage.create(command)
                await afterMutation()
                return task
            },
            access: access
        )
    }

    public var visibleTasks: [TaskRecord] {
        return tasks.filter {
            filters.matches($0, text: searchText, urgencies: selectedUrgencies, project: selectedProjectID, category: selectedCategoryID,
                            assignee: selectedAssigneeID, group: selectedGroupID, actorID: references.actorID, memberships: references.memberships)
        }.sorted {
            if sortOrder == .stack, let stack {
                let leftID = $0.id, rightID = $1.id
                let left = stack.references.firstIndex { $0.workType == "task" && $0.workId == leftID } ?? Int.max
                let right = stack.references.firstIndex { $0.workType == "task" && $0.workId == rightID } ?? Int.max
                if left != right { return left < right }
            }
            return sortOrder.precedes($0, $1, references: references)
        }
    }

    public func clearFilters() {
        filters = NativeTaskFilters()
        selectedUrgencies.removeAll()
        selectedProjectID = ""
        selectedCategoryID = ""
        selectedAssigneeID = ""
        selectedGroupID = ""
    }

    public func eligibleParents(excluding task: TaskRecord?) -> [TaskRecord] {
        tasks.filter { candidate in
            guard candidate.lifecycle == .active, candidate.completionState == .open,
                  candidate.percentComplete < 100, candidate.id != task?.id else { return false }
            guard let task else { return true }
            let map = Dictionary(uniqueKeysWithValues: tasks.compactMap { record in
                record.parentID.map { (record.id, $0) }
            })
            return (try? TaskHierarchy.validateParent(taskID: task.id, proposedParentID: candidate.id,
                                                      parentByTaskID: map)) != nil
        }.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }

    public var archivedTasks: [TaskRecord] {
        tasks.filter { $0.lifecycle == .archived }.sorted { $0.updatedAt > $1.updatedAt }
    }

    public var selectedTask: TaskRecord? {
        tasks.first { $0.id == selectedTaskID }
    }

    public func reload() async {
        let generation = contentGeneration
        do {
            let loaded = try await storage.allTasks()
            let loadedReferences = try await storage.references()
            let loadedTimer = try await storage.timer()
            let loadedCounts = try await storage.syncCounts()
            let clock = await featureClient?.currentServerTime() ?? Date()
            guard generation == contentGeneration else { return }
            tasks = loaded
            references = loadedReferences
            timerClockDate = clock; timerClockUptime = ProcessInfo.processInfo.systemUptime
            timer = loadedTimer
            syncCounts = loadedCounts
            if let editingTask, !tasks.contains(where: { $0.id == editingTask.id }) {
                self.editingTask = nil
                showingEditor = false
                draftParentID = nil
            }
            if let selectedTaskID, !tasks.contains(where: { $0.id == selectedTaskID }) {
                self.selectedTaskID = nil
            }
            try await refreshAttachments()
            await reloadStack()
            let pendingIDs = Set((try? await storage.reviewOperations().filter { $0.targetKind == "task" }.map(\.targetID)) ?? [])
            await notifications?.reconcile(tasks: tasks, timer: timer, pendingTaskIDs: pendingIDs, now: timerNow())
            await NativeTaskLiveActivityController.shared.update(timer, now: timerNow())
            guard generation == contentGeneration else { return }
            notifications?.routePending(authorizedIDs: Set(tasks.map(\.id)))
            await onReferencesChanged?(references)

        } catch {
            clearProtectedContent()
            errorMessage = String(describing: error)
        }
    }

    public func clearProtectedContent() {
        contentGeneration += 1
        Task { await NativeTaskLiveActivityController.shared.redact() }
        tasks = []
        selectedTaskID = nil
        searchText = ""
        clearFilters()
        references = TaskReferences()
        isSaving = false
        timer = nil
        attachments = []
        completionReport = nil
        completionDetails = []
        syncCounts = NativeOperationCounts()
        stack = nil
        timerSwitchTaskID = nil
        editingTask = nil
        draftParentID = nil
        showingEditor = false
        conflict = nil
        completionMutationID = nil
        completedTaskID = nil
        errorMessage = nil
    }

    public func beginCreate() {
        editingTask = nil
        draftParentID = nil
        showingEditor = true
    }

    public func beginSubtask(of task: TaskRecord) {
        editingTask = nil
        draftParentID = task.id
        showingEditor = true
    }

    public func beginEdit(_ task: TaskRecord) {
        editingTask = task
        draftParentID = task.parentID
        showingEditor = true
    }

    public func save(label: String, urgency: TaskUrgency, parentID: String?, details: TaskDetails? = nil) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        let generation = contentGeneration
        errorMessage = nil
        conflict = nil
        defer { if generation == contentGeneration { isSaving = false } }
        do {
            if let editingTask {
                var editedDetails = details ?? TaskDetails(task: editingTask)
                editedDetails.urgency = urgency
                editedDetails.parentID = parentID
                _ = try await storage.edit(.init(
                    mutationID: NativeULID.make(), taskID: editingTask.id, label: label,
                    baseVersion: editingTask.version, details: editedDetails
                ))
            } else {
                _ = try await storage.create(.init(
                    mutationID: NativeULID.make(), label: label, urgency: urgency,
                    parentID: parentID, details: details
                ))
            }
            guard generation == contentGeneration else { return false }
            showingEditor = false
            draftParentID = nil
            await afterMutation()
            await reload()
            return true
        } catch let TaskCommandError.conflict(currentVersion) {
            guard generation == contentGeneration else { return false }
            conflict = .init(taskID: editingTask?.id ?? "", currentVersion: currentVersion)
        } catch {
            if generation == contentGeneration { errorMessage = String(describing: error) }
        }
        return false
    }

    public func reloadStack() async {
        guard sortOrder == .stack else { return }
        let generation = contentGeneration
        let project = filters.matchAny ? "" : selectedProjectID
        if stack?.projectID != (project.isEmpty ? nil : project) { stack = nil }
        do {
            let value = try await storage.stack(projectID: project.isEmpty ? nil : project)
            guard generation == contentGeneration, project == (filters.matchAny ? "" : selectedProjectID) else { return }
            stack = value
        } catch {
            if generation == contentGeneration { errorMessage = String(describing: error) }
        }
    }

    public func move(_ task: TaskRecord, by offset: Int) async {
        guard !isMovingTask, stack != nil, filters.lifecycle == "active",
              let index = visibleTasks.firstIndex(where: { $0.id == task.id }) else { return }
        let affectedIDs = visibleTasks.map(\.id)
        let target = max(0, min(affectedIDs.count - 1, index + offset))
        guard target != index else { return }
        var basis: [String: JSONValue] = ["match": .string(filters.matchAny ? "any" : "all")]
        if let hash = NativeTaskTextSearch.basisHash(searchText) { basis["searchBasisHash"] = .string(hash) }
        if !filters.from.isEmpty { basis["from"] = .string(filters.from) }
        if !filters.to.isEmpty { basis["to"] = .string(filters.to) }
        if !filters.assigneeIDs.isEmpty { basis["assigneeIds"] = .array(filters.assigneeIDs.sorted().map(JSONValue.string)) }
        if !filters.groupIDs.isEmpty { basis["groupIds"] = .array(filters.groupIDs.sorted().map(JSONValue.string)) }
        if filters.progress != "all" { basis["progress"] = .string(filters.progress) }
        if !selectedUrgencies.isEmpty {
            basis["urgencies"] = .array(TaskUrgency.allCases.filter { selectedUrgencies.contains($0) }.map { .string($0.rawValue) })
        }
        if !selectedProjectID.isEmpty { basis["projectId"] = .string(selectedProjectID) }
        if !selectedCategoryID.isEmpty { basis["categoryId"] = .string(selectedCategoryID) }
        if !selectedAssigneeID.isEmpty { basis["assigneeId"] = .string(selectedAssigneeID) }
        if !selectedGroupID.isEmpty { basis["groupIds"] = .array([.string(selectedGroupID)]) }
        isMovingTask = true
        let generation = contentGeneration
        defer { isMovingTask = false }
        do {
            let value = try await storage.moveTask(task.id, to: target, projectID: filters.matchAny || selectedProjectID.isEmpty ? nil : selectedProjectID, affectedTaskIDs: affectedIDs, filterBasis: basis)
            guard generation == contentGeneration else { return }
            self.stack = value
            await afterMutation()
            await reload()
        } catch {
            if generation == contentGeneration { errorMessage = String(describing: error) }
        }
    }

    public func requestTimer(for task: TaskRecord) async {
        if let timer, timer.taskId != task.id, ["running", "paused"].contains(timer.status) {
            timerSwitchTaskID = task.id
        } else {
            await runTimer(.init(timer == nil ? "start" : (timer?.taskId == task.id ? "restart" : "switch"), taskID: task.id))
        }
    }

    public func runTimer(_ command: NativeTaskTimerCommand) async {
        guard !isChangingTimer else { return }
        isChangingTimer = true
        let generation = contentGeneration
        defer { isChangingTimer = false }
        do {
            let value = try await storage.timerCommand(command)
            guard generation == contentGeneration else { return }
            timer = value
            await afterMutation()
            await reload()
        } catch {
            if generation == contentGeneration { errorMessage = String(describing: error) }
        }
    }

    public func complete(_ task: TaskRecord) async {
        let mutationID = NativeULID.make()
        do {
            _ = try await storage.complete(taskID: task.id, mutationID: mutationID)
            completionMutationID = mutationID
            completedTaskID = task.id
            await afterMutation()
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func undo(_ task: TaskRecord) async {
        do {
            _ = try await storage.undoCompletion(taskID: task.id, mutationID: NativeULID.make())
            completedTaskID = nil
            await afterMutation()
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func archive(_ task: TaskRecord) async {
        do {
            _ = try await storage.archive(taskID: task.id, mutationID: NativeULID.make())
            await afterMutation()
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func restore(_ task: TaskRecord) async {
        do {
            _ = try await storage.restore(taskID: task.id, mutationID: NativeULID.make())
            await afterMutation()
            await reload()
        } catch { errorMessage = String(describing: error) }
    }
}

public struct TaskConflictPresentation: Equatable, Sendable {
    public let taskID: String
    public let currentVersion: Int
}

public struct TaskBrowserView: View {
    @Bindable private var model: TaskWorkspaceModel
    @State private var feedback = CompletionFeedbackController()
    @AppStorage("completion-sound") private var completionSound = true
    @State private var showingArchive = false
    @State private var positionTask: TaskRecord?
    @State private var position = 1
    @State private var showingSyncReview = false
    @State private var showingFilters = false
    @State private var showingSearch = false
    private let showsDetailInline: Bool

    public init(model: TaskWorkspaceModel, showsDetailInline: Bool = false) {
        self.model = model
        self.showsDetailInline = showsDetailInline
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader(
                    "My tasks",
                    eyebrow: "Workspace",
                    detail: "Keep the next useful action easy to find."
                )
                if model.syncCounts.conflicted + model.syncCounts.rejected > 0 {
                    StatusBanner(kind: .error, title: "Changes need review",
                                 detail: "\(model.syncCounts.conflicted) conflicts and \(model.syncCounts.rejected) rejected changes are preserved on this device.")
                    Button("Review saved changes") { showingSyncReview = true }
                } else if model.syncCounts.pending > 0 {
                    StatusBanner(kind: .warning, title: "Changes pending sync",
                                 detail: "\(model.syncCounts.pending) changes are saved securely on this device.")
                }
                if model.timer != nil { NativeTaskTimerView(model: model) }
                if model.visibleTasks.isEmpty {
                    NaasehEmptyState(
                        "No Tasks",
                        symbol: "checklist",
                        detail: "Create a task or change the current search and filters."
                    )
                    .frame(maxWidth: .infinity, minHeight: 280)
                    .naasehCard()
                } else if model.presentation == .list {
                    VStack(spacing: 0) {
                        HStack {
                            Text("\(model.visibleTasks.count) task\(model.visibleTasks.count == 1 ? "" : "s")")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(NaasehPalette.mutedInk)
                            Spacer()
                            Text("Priority")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(NaasehPalette.mutedInk)
                        }
                        .padding(.horizontal, NaasehSpacing.standard)
                        .padding(.vertical, NaasehSpacing.small)
                        .background(NaasehPalette.secondarySurface)

                        ForEach(Array(model.visibleTasks.enumerated()), id: \.element.id) { index, task in
                            taskRow(task)
                            if index < model.visibleTasks.count - 1 {
                                Divider().padding(.leading, 60)
                            }
                        }
                    }
                    .background(.background, in: .rect(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).stroke(NaasehPalette.line) }
                    .clipShape(.rect(cornerRadius: 14))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 16)], spacing: 16) {
                        ForEach(model.visibleTasks) { task in postIt(task) }
                    }
                }
            }
            .padding()
            .frame(maxWidth: 1344)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .searchable(text: $model.searchText, prompt: "Search authorized tasks")
        .toolbar { toolbar }
        .sheet(isPresented: $showingSearch) { NavigationStack { NativeTaskCombinedSearchView(model: model) } }
        .sheet(isPresented: $showingFilters) { NavigationStack { NativeTaskFiltersView(model: model).toolbar { Button("Done") { showingFilters = false } } } }
        .sheet(isPresented: $showingSyncReview) { NavigationStack { NativeTaskSyncReviewView(model: model) } }
        .sheet(item: $positionTask) { task in
            NavigationStack {
                Form {
                    Stepper("Position: \(position)", value: $position, in: 1...max(1, model.visibleTasks.count))
                    Button("Move task") {
                        if let current = model.visibleTasks.firstIndex(where: { $0.id == task.id }) {
                            Task { await model.move(task, by: position - 1 - current) }
                        }
                        positionTask = nil
                    }
                }
                .navigationTitle("Move task")
                .toolbar { Button("Cancel") { positionTask = nil } }
            }
            .frame(idealWidth: 400, minHeight: 200)
        }
        .sheet(isPresented: $showingArchive) {
            NavigationStack {
                TaskArchiveView(model: model)
                    .toolbar { Button("Done") { showingArchive = false } }
            }
        }
        .sheet(isPresented: $model.showingEditor) {
            TaskEditorView(model: model, task: model.editingTask)
        }
        .safeAreaInset(edge: .bottom) {
            if let completedID = model.completedTaskID,
               let completed = model.tasks.first(where: { $0.id == completedID && $0.lifecycle == .archived && $0.completionState == .completed }) {
                HStack {
                    Label("Task completed", systemImage: "checkmark.circle.fill")
                    Spacer()
                    Button("Undo") { Task { await model.undo(completed) } }.naasehAccessibleTarget()
                    Button("Dismiss", systemImage: "xmark") { model.completedTaskID = nil }.labelStyle(.iconOnly)
                }.padding().background(.regularMaterial)
            }
        }
        .safeAreaInset(edge: .top) {
            if let conflict = model.conflict {
                StatusBanner(
                    kind: .warning,
                    title: "Task Changed Elsewhere",
                    detail: "Server version \(conflict.currentVersion) is newer. Review it before retrying your edit."
                )
                .overlay(alignment: .trailing) {
                    Button("Reload") {
                        model.conflict = nil
                        Task { await model.reload() }
                    }
                    .padding()
                }
                .padding(.horizontal)
            }
        }
        .alert("Task Could Not Be Saved", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) { Button("OK") { model.errorMessage = nil } } message: {
            Text(model.errorMessage ?? "Try again.")
        }
        .task(id: model.completionMutationID) {
            if let mutation = model.completionMutationID {
                feedback.present(mutationID: mutation, soundEnabled: completionSound)
                model.completionMutationID = nil
            }
        }
        .taskCompletionFeedback(feedback)
        .task { await model.reload(); await model.refreshDirectory() }
        .task(id: model.selectedProjectID) { await model.reloadStack() }
        .task(id: model.filters.matchAny) { await model.reloadStack() }
        .task(id: model.sortOrder) { await model.reloadStack() }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup {
            Picker("Task presentation", selection: $model.presentation) {
                Label("List", systemImage: "list.bullet").tag(TaskPresentationMode.list)
                Label("Post-it", systemImage: "square.grid.2x2").tag(TaskPresentationMode.postIt)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("Task presentation")
            Menu("Task tools", systemImage: "ellipsis.circle") {
            Button("Search tasks and lists", systemImage: "magnifyingglass") { showingSearch = true }
            Button("Advanced filters", systemImage: "line.3.horizontal.decrease") { showingFilters = true }
            Menu("Filter", systemImage: "line.3.horizontal.decrease.circle") {
                ForEach(TaskUrgency.allCases, id: \.self) { urgency in
                    Toggle(urgency.rawValue.capitalized, isOn: Binding(
                        get: { model.selectedUrgencies.contains(urgency) },
                        set: { enabled in
                            if enabled { model.selectedUrgencies.insert(urgency) }
                            else { model.selectedUrgencies.remove(urgency) }
                        }
                    ))
                }
                referenceFilter("Project", selection: $model.selectedProjectID, options: model.references.projects)
                referenceFilter("Category", selection: $model.selectedCategoryID, options: model.references.categories)
                referenceFilter("Assignee", selection: $model.selectedAssigneeID, options: model.references.assignees)
                referenceFilter("Group", selection: $model.selectedGroupID, options: model.references.groups)
                Button("Clear Filters") { model.clearFilters() }
            }
            Menu("Sort", systemImage: "arrow.up.arrow.down") {
                Picker("Sort tasks", selection: $model.sortOrder) {
                    ForEach(TaskSortOrder.allCases, id: \.self) { Text($0.title).tag($0) }
                }
            }
            Button("Archive", systemImage: "archivebox") { showingArchive = true }
            }
            Button("New task", systemImage: "plus") { model.beginCreate() }
                .keyboardShortcut("n", modifiers: .command)
        }
    }

    private func referenceFilter(_ title: String, selection: Binding<String>, options: [TaskReferenceOption]) -> some View {
        Picker(title, selection: selection) {
            Text("All").tag("")
            ForEach(options) { Text($0.name).tag($0.id) }
        }
    }

    private func taskActionsMenu(_ task: TaskRecord) -> some View {
        Menu("Task actions", systemImage: "ellipsis.circle") {
                if model.sortOrder == .stack && model.filters.lifecycle == "active" {
                    Button("Move up") { Task { await model.move(task, by: -1) } }.disabled(model.isMovingTask || model.stack == nil)
                    Button("Move down") { Task { await model.move(task, by: 1) } }.disabled(model.isMovingTask || model.stack == nil)
                    Button("Move to first") { Task { await model.move(task, by: -Int.max) } }.disabled(model.isMovingTask || model.stack == nil)
                    Button("Move to last") { Task { await model.move(task, by: Int.max / 2) } }.disabled(model.isMovingTask || model.stack == nil)
                }
                if model.sortOrder == .stack && model.filters.lifecycle == "active" {
                    Button("Move to position…") {
                        position = (model.visibleTasks.firstIndex { $0.id == task.id } ?? 0) + 1
                        positionTask = task
                    }
                }
                Button("Edit") { model.beginEdit(task) }.disabled(!model.canEdit(task))
                Button("Add subtask") { model.beginSubtask(of: task) }
                Button("Archive") { Task { await model.archive(task) } }.disabled(!model.canEdit(task))
            }.labelStyle(.iconOnly).naasehAccessibleTarget()
    }

    private func taskRow(_ task: TaskRecord) -> some View {
        HStack(spacing: NaasehSpacing.small) {
            Button("\(task.lifecycle == .archived ? "Restore" : "Complete") \(task.label)", systemImage: task.lifecycle == .archived ? "arrow.uturn.backward.circle" : "circle") {
                Task { await model.primaryAction(task) }
            }
            .labelStyle(.iconOnly)
            .disabled(!model.canEdit(task))
            .font(.title3)
            .buttonStyle(.plain)
            .foregroundStyle(NaasehPalette.navy)
            .naasehAccessibleTarget()

            Button { model.selectedTaskID = task.id } label: {
                VStack(alignment: .leading) {
                    Text(task.label).font(.headline)
                    if let due = task.due { Text(dueLabel(due)).font(.caption).foregroundStyle(.secondary) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            if task.visibility == .private {
                Image(systemName: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(NaasehPalette.mutedInk)
                    .accessibilityLabel("Private")
            }
            urgencySymbol(task.urgency)
            taskActionsMenu(task)
        }
        .padding(.horizontal, NaasehSpacing.standard)
        .padding(.vertical, NaasehSpacing.compact)
        .contentShape(.rect)
        .draggable(task.id)
        .dropDestination(for: String.self) { ids, _ in
            guard model.sortOrder == .stack, model.filters.lifecycle == "active", let id = ids.first,
                  let source = model.visibleTasks.firstIndex(where: { $0.id == id }),
                  let target = model.visibleTasks.firstIndex(where: { $0.id == task.id }) else { return false }
            let moved = model.visibleTasks[source]
            Task { await model.move(moved, by: target - source) }
            return true
        }
        .contextMenu {
            Button("Edit") { model.beginEdit(task) }.disabled(!model.canEdit(task))
            Button("Add subtask") { model.beginSubtask(of: task) }
            Button("Archive") { Task { await model.archive(task) } }.disabled(!model.canEdit(task))
        }
    }

    private func postIt(_ task: TaskRecord) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(task.label).font(.headline)
            Spacer(minLength: 24)
            HStack {
                urgencySymbol(task.urgency)
                taskActionsMenu(task)
                Spacer()
                Button("Complete \(task.label)", systemImage: "checkmark.circle") {
                    Task { await model.primaryAction(task) }
                }.labelStyle(.iconOnly)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .leading)
        .background(postItColor(task.postItColor), in: .rect(cornerRadius: 10))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(NaasehPalette.line) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(task.label)
        .accessibilityValue("\(task.urgency.rawValue.capitalized) urgency")
        .accessibilityAction(named: "Open task") { model.selectedTaskID = task.id }
        .accessibilityAction(named: "Complete task") { Task { await model.primaryAction(task) } }
        .accessibilityIdentifier("Post-it: \(task.label)")
        .onTapGesture { model.selectedTaskID = task.id }
    }

    private func urgencySymbol(_ urgency: TaskUrgency) -> some View {
        Image(systemName: urgency == .critical ? "exclamationmark.triangle.fill" : "circle.fill")
            .foregroundStyle(urgencyColor(urgency))
            .accessibilityLabel("\(urgency.rawValue.capitalized) urgency")
    }

    private func urgencyColor(_ urgency: TaskUrgency) -> Color {
        switch urgency { case .low: .blue; case .medium: .yellow; case .high: .orange; case .critical: .red }
    }

    private func postItColor(_ value: TaskPostItColor?) -> Color {
        switch value ?? .yellow {
        case .yellow: .yellow.opacity(0.22); case .pink: .pink.opacity(0.2)
        case .blue: .blue.opacity(0.18); case .green: .green.opacity(0.18)
        case .purple: .purple.opacity(0.18); case .orange: .orange.opacity(0.2)
        }
    }

    private func dueLabel(_ due: TaskDueValue) -> String {
        due.calendarDate ?? due.instant?.formatted(date: .abbreviated, time: .shortened) ?? ""
    }
}

public struct TaskDetailView: View {
    @Bindable private var model: TaskWorkspaceModel
    private let task: TaskRecord
    @State private var showingHiddenMemo = false

    public init(model: TaskWorkspaceModel, task: TaskRecord) { self.model = model; self.task = task }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader(task.label, eyebrow: "Task details")
                VStack(spacing: NaasehSpacing.small) {
                    detailRow("Title", task.label)
                    Divider()
                    detailRow("Priority", task.urgency.rawValue.capitalized)
                    Divider()
                    detailRow("Progress", "\(task.percentComplete)%")
                    detailRow("Privacy", task.visibility == .private ? "Private" : "Public")
                    detailRow("Assignee", referenceName(task.assigneeID ?? task.ownerID, options: model.references.assignees))
                    if let id = task.categoryID { detailRow("Category", referenceName(id, options: model.references.categories)) }
                    if let id = task.projectID { detailRow("Project", referenceName(id, options: model.references.projects)) }
                    if let due = task.due { detailRow("Due", due.calendarDate ?? due.instant?.formatted() ?? "") }
                    if let interval = task.repeatInterval, let unit = task.repeatUnit {
                        detailRow("Repeat", "Every \(interval) \(unit.rawValue)\(interval == 1 ? "" : "s")")
                    }
                    if let parentID = task.parentID, let parent = model.tasks.first(where: { $0.id == parentID }) {
                        Button("Parent: \(parent.label)") { model.selectedTaskID = parent.id }
                    }
                    if let link = task.link, ["http", "https"].contains(link.scheme?.lowercased() ?? "") {
                        Link("Open task link", destination: link)
                    }
                }
                .naasehCard()

                if task.memoHidden {
                    Button("Unlock hidden memo", systemImage: "lock.fill") { showingHiddenMemo = true }
                        .privacySensitive()
                        .naasehCard()
                } else if !task.memo.isEmpty {
                    VStack(alignment: .leading, spacing: NaasehSpacing.compact) {
                        Text("Memo").font(.headline).foregroundStyle(NaasehPalette.navy)
                        if let document = task.memoDocument { TaskMemoDocumentView(document: document) }
                        else { Text(task.memo) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .naasehCard()
                }

                ViewThatFits(in: .horizontal) {
                    taskActions
                    VStack(alignment: .leading) { taskActions }
                }
                if !task.memoHidden {
                    Button("Protect memo with PIN", systemImage: "lock.shield") { showingHiddenMemo = true }
                }
                NativeTaskFinanceLinkView(client: model.featureClient, taskID: task.id)
                NativeTaskAttachmentsView(model: model, task: task)
                if !subtasks.isEmpty {
                    Text("Subtasks").font(.headline)
                    ForEach(subtasks) { child in
                        Button(child.label) { model.selectedTaskID = child.id }
                    }
                }
            }
            .padding()
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle(task.label)
        .sheet(isPresented: $showingHiddenMemo) { NativeHiddenMemoView(model: model, task: task) }
    }

    private var subtasks: [TaskRecord] { model.tasks.filter { $0.parentID == task.id } }

    @ViewBuilder private var taskActions: some View {
        if task.lifecycle == .archived {
            Button(task.completionState == .completed ? "Undo completion" : "Restore") {
                Task {
                    if task.completionState == .completed { await model.undo(task) }
                    else { await model.restore(task) }
                }
            }
        } else {
            HStack {
                    Button("Edit") { model.beginEdit(task) }.disabled(!model.canEdit(task))
                        .buttonStyle(NaasehPrimaryButtonStyle())
                    Button("Complete") { Task { await model.primaryAction(task) } }.disabled(!model.canEdit(task))
                        .buttonStyle(NaasehSecondaryButtonStyle())
                    Button("Archive", role: .destructive) { Task { await model.archive(task) } }.disabled(!model.canEdit(task))
                        .buttonStyle(NaasehSecondaryButtonStyle())
            }
            Button("Add subtask") { model.beginSubtask(of: task) }
            Button("Start timer", systemImage: "timer") { Task { await model.requestTimer(for: task) } }
                .disabled(model.isChangingTimer)
                .confirmationDialog("Switch the active task timer?", isPresented: Binding(
                    get: { model.timerSwitchTaskID != nil },
                    set: { if !$0 { model.timerSwitchTaskID = nil } }
                )) {
                    Button("Switch timer") {
                        if let id = model.timerSwitchTaskID {
                            model.timerSwitchTaskID = nil
                            Task { await model.runTimer(.init("switch", taskID: id)) }
                        }
                    }
                    Button("Cancel", role: .cancel) { model.timerSwitchTaskID = nil }
                }
        }
    }

    private func referenceName(_ id: String, options: [TaskReferenceOption]) -> String {
        options.first { $0.id == id }?.name ?? id
    }

    private func detailRow(_ label: LocalizedStringKey, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.subheadline.weight(.semibold)).foregroundStyle(NaasehPalette.mutedInk)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
    }
}

public struct TaskEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable private var model: TaskWorkspaceModel
    @State private var label: String
    @State private var details: TaskDetails
    @State private var dueKind: String
    @State private var dueDate: Date
    @State private var repeatEnabled: Bool
    @State private var validationMessage: String?
    @State private var confirmDiscard = false
    @State private var assigneeTouched = false
    private let initialDetails: TaskDetails
    private let initialDate: Date
    private let initialDueKind: String
    private let initialLabel: String
    private let initialRepeat: Bool
    private let task: TaskRecord?

    public init(model: TaskWorkspaceModel, task: TaskRecord?) {
        self.model = model
        self.task = task
        _label = State(initialValue: task?.label ?? "")
        var draft = TaskDetails(task: task)
        draft.parentID = task?.parentID ?? model.draftParentID
        initialDetails = draft
        initialLabel = task?.label ?? ""
        initialDueKind = task?.due?.kind.rawValue ?? "none"
        initialRepeat = task?.repeatInterval != nil
        _details = State(initialValue: draft)
        _dueKind = State(initialValue: task?.due?.kind.rawValue ?? "none")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let date = task?.due?.instant ?? task?.due?.calendarDate.flatMap(formatter.date(from:)) ?? Date()
        initialDate = date
        _dueDate = State(initialValue: date)
        _repeatEnabled = State(initialValue: task?.repeatInterval != nil)
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("What needs doing?", text: $label).accessibilityIdentifier("task.label")
                    Picker("Priority", selection: $details.urgency) {
                        ForEach(TaskUrgency.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                    }
                    Toggle("Private task", isOn: Binding(
                        get: { details.visibility == .private },
                        set: { details.visibility = $0 ? .private : .public }
                    ))
                    Picker("Post-it color", selection: $details.postItColor) {
                        Text("Default").tag(nil as TaskPostItColor?)
                        ForEach(TaskPostItColor.allCases, id: \.self) { Text($0.rawValue.capitalized).tag(Optional($0)) }
                    }
                    Stepper("Progress: \(details.percentComplete)%", value: $details.percentComplete, in: 0...100, step: 5)
                }
                Section("Organization") {
                    referencePicker("Assignee", value: Binding(get: { details.assigneeID }, set: {
                        details.assigneeID = $0; assigneeTouched = true
                    }), options: model.references.assignees)
                    referencePicker("Category", value: $details.categoryID, options: model.references.categories)
                    referencePicker("Project", value: $details.projectID, options: model.references.projects)
                    referencePicker("Group", value: $details.groupID, options: model.references.groups.filter { model.references.memberships.contains($0.id) })
                    NativeReferencePicker(title: "Parent task", value: $details.parentID,
                        options: model.eligibleParents(excluding: task).map { TaskReferenceOption(id: $0.id, name: $0.label) })
                }
                Section("Schedule") {
                    Picker("Due", selection: $dueKind) {
                        Text("No due date").tag("none")
                        Text("Date only").tag("date")
                        Text("Date and time").tag("timed")
                    }
                    if dueKind != "none" {
                        DatePicker("Due date", selection: $dueDate,
                                   displayedComponents: [.date])
                        if dueKind == "timed" {
                            HStack {
                                Picker("Hour", selection: Binding(get: { Calendar.current.component(.hour, from: dueDate) }, set: { value in
                                    dueDate = Calendar.current.date(bySettingHour: value, minute: Calendar.current.component(.minute, from: dueDate), second: 0, of: dueDate) ?? dueDate
                                })) { ForEach(0..<24) { Text(String(format: "%02d", $0)).tag($0) } }
                                Picker("Minute", selection: Binding(get: { Calendar.current.component(.minute, from: dueDate) }, set: { value in
                                    dueDate = Calendar.current.date(bySettingHour: Calendar.current.component(.hour, from: dueDate), minute: value, second: 0, of: dueDate) ?? dueDate
                                })) { ForEach(Array(Set(stride(from: 0, to: 60, by: 5)).union([Calendar.current.component(.minute, from: dueDate)])).sorted(), id: \.self) { Text(String(format: "%02d", $0)).tag($0) } }
                            }
                        }
                        Toggle("Repeat", isOn: $repeatEnabled)
                        if repeatEnabled {
                            Stepper("Every \(details.repeatInterval ?? 1)", value: Binding(
                                get: { details.repeatInterval ?? 1 }, set: { details.repeatInterval = $0 }
                            ), in: 1...999)
                            Picker("Repeat unit", selection: Binding(
                                get: { details.repeatUnit ?? .day }, set: { details.repeatUnit = $0 }
                            )) {
                                ForEach(TaskRepeatUnit.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                            }
                        }
                    }
                }
                Section("Link and memo") {
                    TextField("https://example.com", text: $details.link)
                    if task?.memoHidden == true {
                        Label("Hidden memo stays encrypted", systemImage: "lock.fill")
                    } else {
                        TaskMemoEditorView(document: Binding(
                            get: { details.memoDocument ?? TaskMemoDocument(text: details.memo) },
                            set: { document in details.memoDocument = document; details.memo = document.text }
                        ))
                        .accessibilityLabel("Memo")
                    }
                }
                if let message = validationMessage ?? model.errorMessage {
                    Section { Text(message).foregroundStyle(.red).accessibilityIdentifier("task.save.error") }
                }
                if model.conflict != nil {
                    Section {
                        Text("This task changed elsewhere. Your draft is still open. Close and reopen it to review the latest version before saving.")
                            .foregroundStyle(.red)
                    }
                }
            }
            .formStyle(.grouped)
            .onChange(of: details.projectID) { _, id in
                if let project = model.references.projects.first(where: { $0.id == id }), let categoryID = project.categoryID {
                    details.categoryID = categoryID
                }
            }
            .onChange(of: details.categoryID) { _, id in
                if let project = model.references.projects.first(where: { $0.id == details.projectID }), project.categoryID != id {
                    details.projectID = nil
                }
                if !assigneeTouched, let category = model.references.categories.first(where: { $0.id == id }),
                   let assignee = category.defaultAssigneeID { details.assigneeID = assignee }
            }
            .navigationTitle(task == nil ? "New Task" : "Edit Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { if hasChanges { confirmDiscard = true } else { dismiss() } }.disabled(model.isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.isSaving ? "Saving…" : "Save task") { save() }
                        .keyboardShortcut("s", modifiers: .command)
                        .disabled(model.isSaving || label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .interactiveDismissDisabled(model.isSaving || hasChanges)
        .confirmationDialog("Discard task changes?", isPresented: $confirmDiscard) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        }
        .frame(idealWidth: 620, minHeight: 420, idealHeight: 640)
    }

    private var hasChanges: Bool {
        label != initialLabel || details != initialDetails || dueKind != initialDueKind
            || dueDate != initialDate || repeatEnabled != initialRepeat
    }

    private func referencePicker(_ title: String, value: Binding<String?>, options: [TaskReferenceOption]) -> some View {
        NativeReferencePicker(title: title, value: value, options: options)
    }

    private func save() {
        do {
            validationMessage = nil
            if dueKind == "date" {
                let formatter = DateFormatter()
                formatter.calendar = Calendar(identifier: .gregorian)
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.dateFormat = "yyyy-MM-dd"
                details.due = try .date(formatter.string(from: dueDate))
            } else if dueKind == "timed" {
                details.due = try .timed(dueDate, timeZoneIdentifier: TimeZone.current.identifier)
            } else { details.due = nil }
            if dueKind != "none" && repeatEnabled {
                details.repeatInterval = details.repeatInterval ?? 1
                details.repeatUnit = details.repeatUnit ?? .day
            } else { details.repeatInterval = nil; details.repeatUnit = nil }
            Task {
                if await model.save(label: label, urgency: details.urgency, parentID: details.parentID, details: details) { dismiss() }
            }
        } catch { validationMessage = String(describing: error) }
    }
}

public struct TaskArchiveView: View {
    @Bindable private var model: TaskWorkspaceModel
    public init(model: TaskWorkspaceModel) { self.model = model }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehSectionHeader("Archive", eyebrow: "Tasks")
                VStack(spacing: 0) {
                    ForEach(Array(model.archivedTasks.enumerated()), id: \.element.id) { index, task in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(task.label).font(.headline)
                                Text(task.archiveReason == .completed ? "Completed" : "Archived")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(task.archiveReason == .completed ? "Undo completion" : "Restore") {
                                Task {
                                    if task.archiveReason == .completed { await model.undo(task) }
                                    else { await model.restore(task) }
                                }
                            }
                            .buttonStyle(NaasehSecondaryButtonStyle())
                        }
                        .padding(.vertical, NaasehSpacing.compact)
                        if index < model.archivedTasks.count - 1 { Divider() }
                    }
                }
                .naasehCard()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle("Archive")
    }
}
