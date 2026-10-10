import NaasehFeatures
import SwiftUI

@MainActor
struct MacTaskScene: View {
    @Bindable var model: TaskWorkspaceModel
    @State private var feedback = CompletionFeedbackController()

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
        .toolbar {
            ToolbarItemGroup {
                Button("Move task", systemImage: "arrow.up.arrow.down") {}
                    .help("Reorder using drag, Move Up/Down, or a direct position.")
                Menu("Move alternatives") {
                    Button("Move to first position") {}
                    Button("Move up") {}
                    Button("Move down") {}
                    Button("Move to last position") {}
                }
            }
        }
        .task(id: model.completionMutationID) {
            if let mutationID = model.completionMutationID {
                feedback.present(mutationID: mutationID, soundEnabled: true)
            }
        }
        .taskCompletionFeedback(feedback)
    }
}
