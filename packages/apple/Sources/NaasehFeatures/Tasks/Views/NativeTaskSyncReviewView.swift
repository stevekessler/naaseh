import SwiftUI
import NaasehContracts
import NaasehPersistence

public struct NativeTaskSyncReviewView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @Bindable var model: TaskWorkspaceModel
    @State private var operations: [DecryptedPendingOperation] = []
    @State private var selected: String?
    @State private var remote: JSONValue?
    @State private var version = 0
    @State private var unavailable = false
    @State private var busy = false
    @State private var error: String?
    @State private var discard = false
    private var groups: [String] { Array(Set(operations.map { "\($0.targetKind):\($0.targetID)" })).sorted() }
    private var chosen: [DecryptedPendingOperation] { operations.filter { "\($0.targetKind):\($0.targetID)" == selected } }
    public var body: some View {
        List {
            Section("Saved changes") {
                ForEach(groups, id: \.self) { key in
                    Button {
                        selected = key; remote = nil; unavailable = false
                        Task { await loadCurrent() }
                    } label: {
                        let entries = operations.filter { "\($0.targetKind):\($0.targetID)" == key }
                        VStack(alignment: .leading) {
                            Text(title(entries.first)).font(.headline)
                            Text("\(entries.count) saved change(s) · \(entries.first?.state.capitalized ?? "")").font(.caption)
                        }
                    }
                }
            }
            if !chosen.isEmpty {
                Section("Changes on this device") {
                    ForEach(Array(chosen.enumerated()), id: \.offset) { _, operation in
                        Text(operation.operationKind == "timerCommand" ? "Timer change" : operation.operationKind.capitalized)
                        if let payload = try? JSONDecoder().decode(JSONValue.self, from: operation.payload),
                           case let .object(fields) = payload, case let .object(patch) = fields["patch"] {
                            ForEach(patch.keys.sorted(), id: \.self) { key in
                                VStack(alignment: .leading) {
                                    Text(label(key)).font(.subheadline.bold())
                                    Text("On device: \(display(patch[key], key: key))")
                                    if case let .object(current) = remote { Text("Current: \(display(current[key], key: key))").foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                }
                if remote != nil || unavailable {
                    Section("Resolve") {
                        Text("Retry preserves the fields changed on this device and applies them against the current version. All saved changes for this item are retried in order.")
                        Button("Retry my saved changes") { resolve(retry: true) }.disabled(unavailable || busy)
                        Button("Use current version", role: .destructive) { discard = true }.disabled(busy)
                    }
                }
            }
            if busy { ProgressView("Refreshing…") }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Review Sync Changes")
        .toolbar { Button("Done") { dismiss() } }
        .task { await load() }
        .confirmationDialog("Discard all saved changes for this item?", isPresented: $discard) {
            Button("Discard saved changes", role: .destructive) { resolve(retry: false) }
            Button("Cancel", role: .cancel) {}
        }
        .onChange(of: phase) { _, value in if value != .active { operations = []; remote = nil; selected = nil; dismiss() } }
    }
    private func load() async {
        do { operations = try await model.reviewOperations() } catch { self.error = error.localizedDescription }
    }
    private func loadCurrent() async {
        guard let operation = chosen.first, let client = model.featureClient else { return }
        busy = true; error = nil; let identity = selected
        defer { busy = false }
        do {
            let current = try await client.currentValue(kind: operation.targetKind, id: operation.targetID,
                projectID: operation.targetKind == "stack" && !operation.targetID.hasSuffix(":overall") ? operation.targetID : nil)
            guard identity == selected, phase == .active else { return }
            remote = current.value; version = current.version
        } catch NativeTaskFeatureError.permission { unavailable = true }
        catch { self.error = error.localizedDescription }
    }
    private func resolve(retry: Bool) {
        guard let operation = chosen.first, let kind = LocalRecordKind(rawValue: operation.targetKind), !busy else { return }
        busy = true; error = nil
        let value = remote ?? .null
        Task { @MainActor in
            defer { busy = false }
            do {
                try await model.resolveSyncChanges(kind: kind, id: operation.targetID, remote: value, version: version, retry: retry)
                selected = nil; remote = nil; await load()
            } catch { self.error = error.localizedDescription }
        }
    }
    private func title(_ operation: DecryptedPendingOperation?) -> String {
        guard let operation else { return "Saved change" }
        if operation.targetKind == "task" { return model.tasks.first { $0.id == operation.targetID }?.label ?? "Task" }
        return operation.targetKind == "timer" ? "Account timer" : "Personal stack"
    }
    private func label(_ key: String) -> String {
        ["label": "Title", "memo": "Memo", "memoDocument": "Memo formatting", "encryptedMemo": "Protected memo", "memoHidden": "Memo protection",
         "assigneeId": "Assignee", "categoryId": "Category", "projectId": "Project", "groupId": "Group", "parentId": "Parent task", "postItColor": "Post-it color" ][key]
            ?? key.replacingOccurrences(of: "ID", with: "").capitalized
    }
    private func display(_ value: JSONValue?, key: String) -> String {
        if ["encryptedMemo", "memoDocument"].contains(key) { return value == nil || value == .null ? "None" : "Protected or formatted content" }
        switch value {
        case let .string(text): return text.isEmpty ? "None" : text
        case let .number(number): return "\(number)"
        case let .bool(flag): return flag ? "Yes" : "No"
        default: return "None"
        }
    }
}
