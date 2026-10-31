import NaasehFeatures
import SwiftUI

@MainActor
struct MacTaskScene: View {
    @Bindable var model: TaskWorkspaceModel

    var body: some View {
        NavigationSplitView {
            List(selection: $model.selectedTaskID) {
                Section("Tasks") {
                    ForEach(model.visibleTasks) { task in
                        Text(task.label).tag(task.id)
                    }
                }
                Section { NavigationLink("Archive") { TaskArchiveView(model: model) } }
            }
            .navigationTitle("Tasks")
        } content: {
            TaskBrowserView(model: model, showsDetailInline: true)
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
