import AudioToolbox
import Observation
import SwiftUI

@MainActor
@Observable
public final class CompletionFeedbackController {
    public private(set) var presentedMutationID: String?
    private var presented: Set<String> = []

    public init() {}

    public func present(mutationID: String, soundEnabled: Bool) {
        guard presented.insert(mutationID).inserted else { return }
        presentedMutationID = mutationID
        if soundEnabled { AudioServicesPlaySystemSound(1103) }
    }

    public func dismiss() { presentedMutationID = nil }
}

public struct CompletionFeedbackOverlay: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Bindable var controller: CompletionFeedbackController

    public func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if controller.presentedMutationID != nil {
                Label("Task completed", systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .padding()
                    .background(.regularMaterial, in: .capsule)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .accessibilityAddTraits(.isStaticText)
                    .onTapGesture { controller.dismiss() }
            }
        }
        .animation(reduceMotion ? nil : .snappy, value: controller.presentedMutationID)
    }
}

public extension View {
    func taskCompletionFeedback(_ controller: CompletionFeedbackController) -> some View {
        modifier(CompletionFeedbackOverlay(controller: controller))
    }
}
