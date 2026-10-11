import NaasehFeatures
import SwiftUI

@MainActor
struct PadTaskScene: View {
    @Bindable var model: TaskWorkspaceModel
    @State private var feedback = CompletionFeedbackController()

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
        .task(id: model.completionMutationID) {
            if let mutationID = model.completionMutationID {
                feedback.present(mutationID: mutationID, soundEnabled: true)
            }
        }
        .taskCompletionFeedback(feedback)
    }
}
