import SwiftUI

struct PadExperienceContainer<Content: View, Inspector: View>: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.displayScale) private var displayScale
    @SceneStorage("naaseh.pad.inspector") private var inspectorVisible = false
    @ViewBuilder let content: () -> Content
    @ViewBuilder let inspector: () -> Inspector
    var body: some View {
        content()
            .inspector(isPresented: $inspectorVisible) { inspector().inspectorColumnWidth(min: 260, ideal: displayScale > 1 ? 320 : 280, max: 460) }
            .toolbar { Button("Inspector", systemImage: "sidebar.right") { inspectorVisible.toggle() }.keyboardShortcut("i", modifiers: [.command, .option]) }
            .environment(\.defaultMinListRowHeight, 44)
            .id(sizeClass)
    }
}

extension View {
    func padDropAndPointerAlternatives(onImport: @escaping () -> Void) -> some View { self.contextMenu { Button("Import from Files", action: onImport) }.accessibilityAction(named: "Import from Files", onImport) }
}
