import SwiftUI

public struct NativeTaskFiltersView: View {
    @AppStorage("naaseh.timer-live-activity") private var liveActivity = false
    @AppStorage("naaseh.siri-task-creation") private var siriEnabled = false
    @AppStorage("completion-sound") private var completionSound = true
    @Bindable var model: TaskWorkspaceModel
    public var body: some View {
        Form {
            Section("Scope") {
                Toggle("All readable content", isOn: $model.filters.allReadable)
                Toggle("Match any filter", isOn: $model.filters.matchAny)
                Picker("Lifecycle", selection: $model.filters.lifecycle) {
                    Text("Active").tag("active"); Text("Archive").tag("archive"); Text("All").tag("all")
                }
                Picker("Progress", selection: $model.filters.progress) {
                    Text("Any progress").tag("all"); Text("Not started").tag("not-started")
                    Text("In progress").tag("in-progress"); Text("Complete").tag("complete")
                }
            }
            Section("Due date") {
                TextField("From (YYYY-MM-DD)", text: $model.filters.from)
                TextField("Through (YYYY-MM-DD)", text: $model.filters.to)
                ForEach(NativeTaskDatePreset.allCases, id: \.self) { preset in
                    Toggle(title(preset), isOn: Binding(get: { model.filters.dates.contains(preset) }, set: {
                        if $0 { model.filters.dates.insert(preset) } else { model.filters.dates.remove(preset) }
                    }))
                }
            }
            Section("Assignees") {
                ForEach(model.references.assignees) { person in
                    Toggle(person.name, isOn: Binding(get: { model.filters.assigneeIDs.contains(person.id) }, set: {
                        if $0 { model.filters.assigneeIDs.insert(person.id) } else { model.filters.assigneeIDs.remove(person.id) }
                    }))
                }
            }
            Section("Groups") {
                ForEach(model.references.groups) { group in
                    Toggle(group.name, isOn: Binding(get: { model.filters.groupIDs.contains(group.id) }, set: {
                        if $0 { model.filters.groupIDs.insert(group.id) } else { model.filters.groupIDs.remove(group.id) }
                    }))
                }
            }
            Section("Feedback") {
                Toggle("Create tasks with Siri and Shortcuts", isOn: $siriEnabled)
                Text("Enabling Siri makes authorized project names available to system task-creation suggestions. Hidden memos and task contents are never donated.").font(.caption)
                Toggle("Completion sound", isOn: $completionSound)
                #if os(iOS)
                Toggle("Timer Live Activity", isOn: $liveActivity).onChange(of: liveActivity) { _, _ in Task { await model.reload() } }
                #endif
            }
            if let notifications = model.notifications {
                Section("This device") {
                    Toggle("Task reminders", isOn: Binding(get: { notifications.enabled }, set: { enabled in
                        Task { if enabled { await notifications.enable(); await model.reload() } else { await notifications.disable() } }
                    }))
                    if let error = notifications.error { Text(error).foregroundStyle(.secondary) }
                }
            }
            Button("Clear filters") { model.clearFilters() }
        }.navigationTitle("Task Filters")
    }
    private func title(_ preset: NativeTaskDatePreset) -> String {
        switch preset {
        case .today: "Today"; case .tomorrow: "Tomorrow"; case .week: "This week"; case .nextWeek: "Next week"
        case .nextNextWeek: "Week after next"; case .month: "This month"; case .quarter: "This quarter"
        }
    }
}

public struct NativeReferencePicker: View {
    let title: String
    @Binding var value: String?
    let options: [TaskReferenceOption]
    @State private var choosing = false
    @State private var query = ""
    public var body: some View {
        Button { query = ""; choosing = true } label: {
            LabeledContent(title, value: options.first { $0.id == value }?.name ?? (value == nil ? "None" : "Unavailable selection"))
        }
        .sheet(isPresented: $choosing) {
            NavigationStack {
                List {
                    Button("None") { value = nil; choosing = false }
                    ForEach(options.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { option in
                        Button(option.name) { value = option.id; choosing = false }
                    }
                }
                .searchable(text: $query, prompt: "Search \(title.lowercased())")
                .navigationTitle(title)
                .toolbar { Button("Cancel") { choosing = false } }
            }.frame(idealWidth: 480, minHeight: 320)
        }
    }
}
