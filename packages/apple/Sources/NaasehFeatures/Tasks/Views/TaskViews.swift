import NaasehDesignSystem
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
    public var selectedTaskID: String?
    public var searchText = ""
    public var selectedUrgencies: Set<TaskUrgency> = []
    public var presentation: TaskPresentationMode = .list
    public var showingEditor = false
    public var editingTask: TaskRecord?
    public var draftParentID: String?
    public var errorMessage: String?
    public var conflict: TaskConflictPresentation?
    public var completionMutationID: String?

    private let store: InMemoryTaskCommandStore
    private let commands: TaskCommandService

    public init(actorID: String, store: InMemoryTaskCommandStore = .init()) {
        self.store = store
        commands = TaskCommandService(store: store, actorID: actorID)
    }

    public func voiceService(
        projects: AuthorizedProjectQuery,
        access: @escaping @Sendable () async -> VoiceTaskAccess
    ) -> VoiceTaskService {
        VoiceTaskService(projects: projects, commands: commands, access: access)
    }

    public var visibleTasks: [TaskRecord] {
        let needle = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return tasks.filter {
            $0.lifecycle == .active
                && (needle.isEmpty || $0.label.localizedCaseInsensitiveContains(needle))
                && (selectedUrgencies.isEmpty || selectedUrgencies.contains($0.urgency))
        }.sorted { $0.updatedAt > $1.updatedAt }
    }

    public var archivedTasks: [TaskRecord] {
        tasks.filter { $0.lifecycle == .archived }.sorted { $0.updatedAt > $1.updatedAt }
    }

    public var selectedTask: TaskRecord? {
        tasks.first { $0.id == selectedTaskID }
    }

    public func reload() async { tasks = await store.allTasks() }

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

    public func save(label: String, urgency: TaskUrgency, parentID: String?) async {
        do {
            if let editingTask {
                _ = try await commands.edit(.init(
                    mutationID: UUID().uuidString,
                    taskID: editingTask.id,
                    label: label,
                    parentID: parentID,
                    baseVersion: editingTask.version
                ))
            } else {
                _ = try await commands.create(.init(
                    mutationID: UUID().uuidString,
                    label: label,
                    urgency: urgency,
                    parentID: parentID
                ))
            }
            showingEditor = false
            draftParentID = nil
            await reload()
        } catch let TaskCommandError.conflict(currentVersion) {
            conflict = .init(taskID: editingTask?.id ?? "", currentVersion: currentVersion)
        } catch { errorMessage = String(describing: error) }
    }

    public func complete(_ task: TaskRecord) async {
        let mutationID = UUID().uuidString
        do {
            _ = try await commands.complete(taskID: task.id, mutationID: mutationID)
            completionMutationID = mutationID
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func undo(_ task: TaskRecord) async {
        do {
            _ = try await commands.undoCompletion(taskID: task.id, mutationID: UUID().uuidString)
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func archive(_ task: TaskRecord) async {
        do {
            _ = try await commands.archive(taskID: task.id, mutationID: UUID().uuidString)
            await reload()
        } catch { errorMessage = String(describing: error) }
    }

    public func restore(_ task: TaskRecord) async {
        do {
            _ = try await commands.restore(taskID: task.id, mutationID: UUID().uuidString)
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
        .sheet(isPresented: $model.showingEditor) {
            TaskEditorView(model: model, task: model.editingTask)
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
        .task { await model.reload() }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItemGroup {
            Picker("Task presentation", selection: $model.presentation) {
                Label("List", systemImage: "list.bullet").tag(TaskPresentationMode.list)
                Label("Post-it", systemImage: "square.grid.2x2").tag(TaskPresentationMode.postIt)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("Task presentation")
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
                Button("Clear Filters") { model.selectedUrgencies.removeAll() }
            }
            Button("New task", systemImage: "plus") { model.beginCreate() }
                .keyboardShortcut("n", modifiers: .command)
        }
    }

    private func taskRow(_ task: TaskRecord) -> some View {
        HStack(spacing: NaasehSpacing.small) {
            Button("Complete \(task.label)", systemImage: "circle") {
                Task { await model.complete(task) }
            }
            .labelStyle(.iconOnly)
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
        }
        .padding(.horizontal, NaasehSpacing.standard)
        .padding(.vertical, NaasehSpacing.compact)
        .contentShape(.rect)
        .contextMenu {
            Button("Edit") { model.beginEdit(task) }
            Button("Add subtask") { model.beginSubtask(of: task) }
            Button("Archive") { Task { await model.archive(task) } }
        }
    }

    private func postIt(_ task: TaskRecord) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(task.label).font(.headline)
            Spacer(minLength: 24)
            HStack {
                urgencySymbol(task.urgency)
                Spacer()
                Button("Complete \(task.label)", systemImage: "checkmark.circle") {
                    Task { await model.complete(task) }
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
        .accessibilityAction(named: "Complete task") { Task { await model.complete(task) } }
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
                }
                .naasehCard()

                if task.memoHidden {
                    Label("Private memo", systemImage: "lock.fill")
                        .privacySensitive()
                        .naasehCard()
                } else if !task.memo.isEmpty {
                    VStack(alignment: .leading, spacing: NaasehSpacing.compact) {
                        Text("Memo").font(.headline).foregroundStyle(NaasehPalette.navy)
                        Text(task.memo)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .naasehCard()
                }

                HStack(spacing: NaasehSpacing.compact) {
                    Button("Edit") { model.beginEdit(task) }
                        .buttonStyle(NaasehPrimaryButtonStyle())
                    Button("Complete") { Task { await model.complete(task) } }
                        .buttonStyle(NaasehSecondaryButtonStyle())
                    Button("Archive", role: .destructive) { Task { await model.archive(task) } }
                        .buttonStyle(NaasehSecondaryButtonStyle())
                }
            }
            .padding()
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .naasehWorkspaceBackground()
        .navigationTitle(task.label)
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
    @State private var urgency: TaskUrgency
    @State private var parentID: String

    public init(model: TaskWorkspaceModel, task: TaskRecord?) {
        self.model = model
        _label = State(initialValue: task?.label ?? "")
        _urgency = State(initialValue: task?.urgency ?? .medium)
        _parentID = State(initialValue: task?.parentID ?? model.draftParentID ?? "")
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                    NaasehSectionHeader(
                        model.editingTask == nil ? "New task" : "Edit task",
                        eyebrow: "Tasks"
                    )
                    VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                        Text("Task label").font(.headline)
                        TextField("What needs doing?", text: $label)
                            .textContentType(.none)
                            .naasehField()

                        Text("Priority").font(.headline)
                        Picker("Priority", selection: $urgency) {
                            ForEach(TaskUrgency.allCases, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                        }
                        .pickerStyle(.segmented)

                        Text("Parent task").font(.headline)
                        Picker("Parent task", selection: $parentID) {
                            Text("No parent task").tag("")
                            ForEach(model.tasks.filter { $0.id != model.editingTask?.id }) { task in
                                Text(task.label).tag(task.id)
                            }
                        }
                        .naasehField()
                    }
                    .naasehCard()
                }
                .padding()
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .naasehWorkspaceBackground()
            .navigationTitle(model.editingTask == nil ? "New Task" : "Edit Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save task") {
                        Task {
                            await model.save(label: label, urgency: urgency, parentID: parentID.isEmpty ? nil : parentID)
                            if model.errorMessage == nil { dismiss() }
                        }
                    }.disabled(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 620, minHeight: 420, idealHeight: 560)
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
