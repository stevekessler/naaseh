import AppIntents

struct NaasehShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CreateTaskIntent(),
            phrases: [
                "Add a task with \(.applicationName)",
                "Use \(.applicationName) to add a task",
                "Use GSD with \(.applicationName) to add a task",
                "Create a task in GSD with \(.applicationName)",
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
