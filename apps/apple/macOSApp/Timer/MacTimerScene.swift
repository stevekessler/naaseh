import NaasehFeatures
import Observation
import SwiftUI

@MainActor
@Observable
final class MacTimerModel {
    var state: TaskTimerState?
    var errorMessage: String?
    private let coordinator = TimerCoordinator(store: InMemoryTimerStore())

    func start() async { await run { try await coordinator.start(taskID: "selected-task", mutationID: UUID().uuidString) } }
    func pause() async {
        guard let state else { return }
        await run { try await coordinator.pause(mutationID: UUID().uuidString, baseVersion: state.version) }
    }
    func resume() async { await run { try await coordinator.resume(mutationID: UUID().uuidString) } }
    func reset() async { await run { try await coordinator.reset(mutationID: UUID().uuidString) } }
    func switchPhase() async { await run { try await coordinator.switchPhase(mutationID: UUID().uuidString) } }

    private func run(_ action: () async throws -> TaskTimerState) async {
        do { state = try await action() } catch { errorMessage = String(describing: error) }
    }
}

@MainActor
struct MacTimerScene: View {
    @Bindable var model: MacTimerModel

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "timer").font(.largeTitle)
            Text(model.state?.phase.rawValue.capitalized ?? "Ready").font(.title2)
            Text(remaining).font(.system(.largeTitle, design: .monospaced)).privacySensitive()
            HStack {
                Button("Start") { Task { await model.start() } }.keyboardShortcut(.space, modifiers: [])
                Button("Pause") { Task { await model.pause() } }
                Button("Resume") { Task { await model.resume() } }
                Button("Reset") { Task { await model.reset() } }
                Button("Switch Work/Rest") { Task { await model.switchPhase() } }
            }
            Text("All controls are available from menus and the status item; drag gestures are never required.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(28)
        .frame(minWidth: 440, minHeight: 280)
        .alert("Timer Action Failed", isPresented: .constant(model.errorMessage != nil)) {
            Button("OK") { model.errorMessage = nil }
        } message: { Text(model.errorMessage ?? "Try again.") }
    }

    private var remaining: String {
        guard let state = model.state else { return "25:00" }
        let seconds = state.remaining(at: Date(), serverOffset: 0)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
