import NaasehDesignSystem
import NaasehFeatures
import SwiftUI

@MainActor
public struct MacRootView: View {
    @Bindable private var core: AppCore
    private let authentication: AuthenticationViewModel?
    private let tasks: TaskWorkspaceModel

    public init(
        core: AppCore,
        authentication: AuthenticationViewModel? = nil,
        tasks: TaskWorkspaceModel
    ) {
        self.core = core; self.authentication = authentication; self.tasks = tasks
    }

    public var body: some View {
        Group {
            switch core.state {
            case let .ready(connectivity):
                desktop(connectivity: connectivity)
            case .locked:
                ContentUnavailableView(
                    "Na’aseh Is Locked",
                    systemImage: "lock.shield",
                    description: Text("Unlock with Touch ID or your Mac password.")
                )
            case .signedOut:
                if let authentication { AuthenticationRootView(model: authentication) }
                else {
                    ContentUnavailableView(
                        "Sign In to Na’aseh",
                        systemImage: "person.crop.circle",
                        description: Text("Use your existing account to access your work.")
                    )
                }
            case let .blocked(reason):
                NaasehErrorState(detail: "Na’aseh cannot open safely (\(reason.rawValue)).")
            case .migrating:
                NaasehLoadingState("Securing local data…")
            case .launching, .openingStore:
                NaasehLoadingState("Opening Na’aseh…")
            }
        }
        .frame(minWidth: 820, minHeight: 560)
        .task {
            if core.state == .launching { await core.start() }
        }
    }

    private func desktop(connectivity: ConnectivityState) -> some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                NaasehBrandHeader().padding(.horizontal, NaasehSpacing.compact)
                List(AppSection.webNavigation, selection: $core.router.selectedSection) { section in
                    Label(section.webTitle, systemImage: section.webSymbol)
                        .font(.headline)
                        .foregroundStyle(NaasehPalette.navy)
                        .tag(section)
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)
            }
            .padding(.top, NaasehSpacing.standard)
            .background(.background)
        } content: {
            VStack(spacing: 0) {
                if connectivity != .online {
                    StatusBanner(kind: .warning, title: "Offline", detail: "Changes are pending sync.")
                        .padding()
                }
                if core.router.selectedSection == .tasks {
                    TaskBrowserView(model: tasks, showsDetailInline: true)
                } else if core.router.selectedSection == .journal {
                    MacJournalScene()
                } else if [.lists, .directory, .reports].contains(core.router.selectedSection) {
                    MacProductParityScene(section: core.router.selectedSection)
                } else if core.router.selectedSection == .settings {
                    MacProfileScene()
                } else {
                    NaasehEmptyState(
                        LocalizedStringKey(core.router.selectedSection.rawValue.capitalized),
                        symbol: "rectangle.split.2x1",
                        detail: "Select or create an item to begin."
                    )
                }
            }
        } detail: {
            if core.router.selectedSection == .tasks, let task = tasks.selectedTask {
                TaskDetailView(model: tasks, task: task)
            } else {
                NaasehEmptyState(
                    "No Selection",
                    symbol: "sidebar.right",
                    detail: "Choose an item to inspect."
                )
            }
        }
        .toolbar {
            ToolbarItem {
                Button("New task", systemImage: "plus") { tasks.beginCreate() }
                    .keyboardShortcut("n", modifiers: .command)
            }
        }
        .naasehWorkspaceBackground()
    }
}

private extension AppSection {
    static let webNavigation: [AppSection] = [.tasks, .journal, .lists, .directory, .reports, .settings]

    var webTitle: String {
        switch self {
        case .tasks: "Tasks"
        case .lists: "Lists"
        case .directory: "Directory"
        case .timer: "Timer"
        case .journal: "Journal"
        case .reports: "Completed Tasks"
        case .settings: "Your Profile"
        }
    }

    var webSymbol: String {
        switch self {
        case .tasks: "checklist"
        case .lists: "list.bullet.rectangle"
        case .directory: "person.2"
        case .timer: "timer"
        case .journal: "book.closed"
        case .reports: "chart.bar"
        case .settings: "person.crop.circle"
        }
    }
}

@MainActor
public struct NaasehMacCommands: Commands {
    private let core: AppCore

    public init(core: AppCore) { self.core = core }

    public var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("New Task") {}
                .keyboardShortcut("n", modifiers: .command)
            Divider()
            Button("Lock Na’aseh") { Task { await core.lock() } }
                .keyboardShortcut("l", modifiers: [.command, .control])
        }
        CommandMenu("Navigate") {
            ForEach(AppSection.webNavigation) { section in
                Button(section.rawValue.capitalized) { core.router.selectedSection = section }
            }
        }
    }
}
