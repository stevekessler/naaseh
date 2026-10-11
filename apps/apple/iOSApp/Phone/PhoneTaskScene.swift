import NaasehFeatures
import SwiftUI

@MainActor
struct PhoneTaskScene: View {
    @Bindable var model: TaskWorkspaceModel
    @State private var feedback = CompletionFeedbackController()

    var body: some View {
        TaskBrowserView(model: model)
            .navigationTitle("Tasks")
            .navigationDestination(item: $model.selectedTaskID) { taskID in
                if let task = model.tasks.first(where: { $0.id == taskID }) {
                    TaskDetailView(model: model, task: task)
                } else {
                    ContentUnavailableView("Task Unavailable", systemImage: "questionmark.folder")
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    NavigationLink("Archive", destination: TaskArchiveView(model: model))
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
