import SwiftUI

public struct NativeTaskTimerView: View {
    @Bindable private var model: TaskWorkspaceModel
    @State private var minutes = 10
    public init(model: TaskWorkspaceModel) { self.model = model }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let timer = model.timer {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    let projection = timer.effective(at: model.timerNow())
                    HStack {
                        Label("Task timer", systemImage: "timer").font(.headline)
                        Spacer()
                        Text(String(format: "%02d:%02d", projection.remaining / 60, projection.remaining % 60))
                            .font(.title.monospacedDigit())
                        Text(projection.timer.status.capitalized).font(.caption)
                    }
                }
                if let task = model.tasks.first(where: { $0.id == timer.taskId }) {
                    Button(task.label) { model.selectedTaskID = task.id }.privacySensitive()
                }
                ViewThatFits(in: .horizontal) {
                    HStack { controls(timer) }
                    VStack(alignment: .leading) { controls(timer) }
                }
                Toggle("Repeat timer", isOn: Binding(get: { timer.repeatEnabled }, set: { value in
                    Task { await model.runTimer(.init("setRepeat", enabled: value)) }
                }))
                Stepper("Duration: \(minutes) minutes", value: $minutes, in: 1...1440)
                Button("Apply duration and restart") { Task { await model.runTimer(.init("changeDuration", durationSeconds: minutes * 60)) } }
            } else {
                ContentUnavailableView("No Task Timer", systemImage: "timer", description: Text("Open a task and choose Start timer."))
            }
        }
        .padding()
        .disabled(model.isChangingTimer)
        .onChange(of: model.timer?.durationSeconds, initial: true) { _, seconds in minutes = (seconds ?? 600) / 60 }
    }
    @ViewBuilder private func controls(_ timer: NativeAccountTaskTimer) -> some View {
        if timer.status == "paused" {
            Button("Resume") { Task { await model.runTimer(.init("resume")) } }
        } else if timer.status == "running", timer.effective(at: model.timerNow()).timer.status == "running" {
            Button("Pause") { Task { await model.runTimer(.init("pause")) } }
        }
        Button("Restart") { Task { await model.runTimer(.init("restart")) } }
        Button("Stop") { Task { await model.runTimer(.init("stop")) } }.disabled(timer.status == "stopped")
    }
}
