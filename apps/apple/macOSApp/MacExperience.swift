import SwiftUI

struct MacWorkspaceChrome<Content: View>: View {
    @SceneStorage("naaseh.mac.inspector") private var inspectorVisible = false
    @FocusState private var workspaceFocused: Bool
    @ViewBuilder let content: () -> Content
    var body: some View {
        content()
            .focused($workspaceFocused)
            .frame(minWidth: 820, minHeight: 560)
            .toolbar { Button("Inspector", systemImage: "sidebar.right") { inspectorVisible.toggle() }.keyboardShortcut("i", modifiers: [.command, .option]) }
            .focusEffectDisabled(false)
            .onAppear { workspaceFocused = true }
    }
}

struct NaasehWorkspaceCommands: Commands {
    let newTask: () -> Void
    let importFile: () -> Void
    var body: some Commands {
        CommandGroup(after: .newItem) { Button("New Task", action: newTask).keyboardShortcut("n"); Button("Import File…", action: importFile).keyboardShortcut("o") }
        CommandMenu("Workspace") { Button("Focus Sidebar") {}.keyboardShortcut("1", modifiers: .command); Button("Focus Content") {}.keyboardShortcut("2", modifiers: .command); Button("Focus Inspector") {}.keyboardShortcut("3", modifiers: .command) }
    }
}
