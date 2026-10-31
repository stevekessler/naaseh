import NaasehFeatures
import SwiftUI

@MainActor
struct PadTaskScene: View {
    @Bindable var model: TaskWorkspaceModel

    var body: some View {
        NavigationSplitView {
            List {
                Section("Active") {
                    ForEach(model.visibleTasks) { task in
                        Button {
                            model.selectedTaskID = task.id
                        } label: {
                            Label(task.label, systemImage: "circle")
                        }
                    }
                }
                NavigationLink("Archive") { TaskArchiveView(model: model) }
            }
            .navigationTitle("Tasks")
        } content: {
            TaskBrowserView(model: model, showsDetailInline: true)
                .navigationTitle("Tasks")
        } detail: {
            if let task = model.selectedTask {
                TaskDetailView(model: model, task: task)
            } else {
                ContentUnavailableView("No Task Selected", systemImage: "checklist")
            }
        }
        .navigationSplitViewStyle(.balanced)
    }
}
