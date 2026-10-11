import NaasehDesignSystem
import NaasehFeatures
import SwiftUI

@MainActor
public struct PadSceneEntry: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private let core: AppCore
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
        if horizontalSizeClass == .compact {
            PhoneRootView(core: core, authentication: authentication, tasks: tasks)
        } else {
            PadRootView(core: core, authentication: authentication, tasks: tasks)
        }
    }
}

@MainActor
public struct PadRootView: View {
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
            if case let .ready(connectivity) = core.state {
                NavigationSplitView {
                    VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                        NaasehBrandHeader().padding(.horizontal, NaasehSpacing.standard)
                        List {
                            ForEach(AppSection.padWebNavigation) { section in
                                Button {
                                    core.router.selectedSection = section
                                } label: {
                                    Label(section.padTitle, systemImage: section.padSymbol)
                                        .font(.headline)
                                        .foregroundStyle(NaasehPalette.navy)
                                }
                                .listRowBackground(
                                    core.router.selectedSection == section
                                        ? NaasehPalette.secondarySurface
                                        : Color.clear
                                )
                            }
                        }
                        .scrollContentBackground(.hidden)
                    }
                    .padding(.top, NaasehSpacing.standard)
                    .background(.background)
                } content: {
                    Group {
                        if core.router.selectedSection == .tasks {
                            TaskBrowserView(model: tasks, showsDetailInline: true)
                        } else if core.router.selectedSection == .journal {
                            JournalScene()
                        } else if [.lists, .directory, .reports].contains(core.router.selectedSection) {
                            PadProductParityScene(section: core.router.selectedSection)
                        } else if core.router.selectedSection == .settings {
                            ProfileScene()
                        } else {
                            ContentUnavailableView(
                                core.router.selectedSection.rawValue.capitalized,
                                systemImage: "rectangle.split.2x1",
                                description: Text("Select or create an item to begin.")
                            )
                        }
                    }
                    .safeAreaInset(edge: .top) {
                        if connectivity != .online {
                            StatusBanner(kind: .warning, title: "Offline", detail: "Changes are pending sync.")
                                .padding(.horizontal)
                        }
                    }
                } detail: {
                    if core.router.selectedSection == .tasks, let task = tasks.selectedTask {
                        TaskDetailView(model: tasks, task: task)
                    } else {
                        NaasehEmptyState(
                            "No Selection",
                            symbol: "sidebar.right",
                            detail: "Choose an item from the content column."
                        )
                    }
                }
                .navigationSplitViewStyle(.balanced)
                .naasehWorkspaceBackground()
            } else {
                PhoneRootView(core: core, authentication: authentication, tasks: tasks)
            }
        }
        .task {
            if core.state == .launching { await core.start() }
        }
    }
}

private extension AppSection {
    static let padWebNavigation: [AppSection] = [.tasks, .journal, .lists, .directory, .reports, .settings]

    var padTitle: String {
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

    var padSymbol: String {
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
