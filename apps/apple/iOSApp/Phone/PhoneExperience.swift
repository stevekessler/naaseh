import NaasehDesignSystem
import NaasehFeatures
import SwiftUI

private struct PhoneExperienceModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var editorFocused: Bool
    let connectivity: ConnectivityState?
    func body(content: Content) -> some View {
        content
            .safeAreaPadding(.horizontal, 8)
            .scrollDismissesKeyboard(.interactively)
            .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: connectivity)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if editorFocused { HStack { Button("Bold") {}; Button("Italic") {}; Spacer(); Button("Done") { editorFocused = false } }.buttonStyle(.borderless).padding().background(.bar) }
            }
            .accessibilityAction(named: "Dismiss keyboard") { editorFocused = false }
    }
}

extension View {
    func phoneExperience(connectivity: ConnectivityState? = nil) -> some View { modifier(PhoneExperienceModifier(connectivity: connectivity)) }
}
