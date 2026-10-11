import NaasehDesignSystem
import NaasehFeatures
import SwiftUI

@MainActor
public struct PhoneRootView: View {
    @Bindable private var core: AppCore
    private let authentication: AuthenticationViewModel?
    private let tasks: TaskWorkspaceModel

    public init(
        core: AppCore,
        authentication: AuthenticationViewModel? = nil,
        tasks: TaskWorkspaceModel
    ) {
        self.core = core
        self.authentication = authentication
        self.tasks = tasks
    }

    public var body: some View {
        Group {
            switch core.state {
            case .launching, .openingStore:
                NaasehLoadingState("Opening Na’aseh…")
            case let .migrating(progress):
                migrationView(progress: progress)
            case .signedOut:
                if let authentication { AuthenticationRootView(model: authentication) }
                else {
                    launchState(
                        title: "Sign In to Na’aseh",
                        detail: "Use your existing account to securely access your work.",
                        symbol: "person.crop.circle.badge.checkmark"
                    )
                }
            case .locked:
                launchState(
                    title: "Na’aseh Is Locked",
                    detail: "Unlock with Face ID, Touch ID, or your device passcode.",
                    symbol: "lock.shield"
                )
            case let .blocked(reason):
                blockedView(reason)
            case let .ready(connectivity):
                navigation(connectivity: connectivity)
            }
        }
        .phoneExperience(connectivity: {
            if case let .ready(value) = core.state { return value }
            return nil
        }())
        .task {
            if core.state == .launching { await core.start() }
        }
    }

    private func navigation(connectivity: ConnectivityState) -> some View {
        NavigationStack(path: $core.router.path) {
            ScrollView {
                VStack(alignment: .leading, spacing: NaasehSpacing.standard) {
                    NaasehBrandHeader()
                        .padding(.bottom, NaasehSpacing.compact)
                    NaasehSectionHeader(
                        "Welcome back",
                        eyebrow: "Workspace",
                        detail: "Choose where you want to pick up."
                    )
                    if connectivity != .online {
                        StatusBanner(
                            kind: .warning,
                            title: connectivity == .offline ? "Working Offline" : "Reconnecting",
                            detail: "Changes stay encrypted on this device until sync resumes."
                        )
                    }
                    ForEach(AppSection.webNavigation) { section in
                        Button {
                            core.router.path.append(.section(section))
                        } label: {
                            HStack(spacing: NaasehSpacing.small) {
                                Image(systemName: section.symbol)
                                    .font(.title3.weight(.semibold))
                                    .frame(width: 30)
                                    .foregroundStyle(NaasehPalette.green)
                                Text(section.title)
                                    .font(.headline)
                                    .foregroundStyle(NaasehPalette.navy)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                            }
                            .naasehCard()
                        }
                        .buttonStyle(.plain)
                        .naasehAccessibleTarget()
                    }
                }
                .padding()
            }
            .naasehWorkspaceBackground()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case let .section(section):
                    if section == .tasks {
                        PhoneTaskScene(model: tasks)
                    } else if section == .journal {
                        JournalScene()
                    } else if [.lists, .directory, .reports].contains(section) {
                        PhoneProductParityScene(section: section)
                    } else if section == .settings {
                        ProfileScene()
                    } else {
                        NaasehEmptyState(
                            section.title,
                            symbol: section.symbol,
                            detail: "This secure workspace is ready for its feature module."
                        )
                        .navigationTitle(section.title)
                    }
                case .transientDetail:
                    NaasehLoadingState()
                }
            }
        }
    }

    private func migrationView(progress: Double?) -> some View {
        VStack(spacing: NaasehSpacing.standard) {
            ProgressView(value: progress)
            Text("Securing Your Local Data").font(.headline)
            Text("Keep Na’aseh open. Your encrypted data remains protected during this update.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
        .accessibilityElement(children: .combine)
    }

    private func launchState(title: LocalizedStringKey, detail: LocalizedStringKey, symbol: String) -> some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(detail))
    }

    private func blockedView(_ reason: BlockedApplicationReason) -> some View {
        let detail: LocalizedStringKey = switch reason {
        case .upgradeRequired: "Install the latest TestFlight build before making more changes."
        case .betaExpired: "This TestFlight build has expired. Install a current build to continue."
        case .temporarilyUnavailable: "Na’aseh is temporarily unavailable. Your local data is unchanged."
        case .storeUnavailable: "The encrypted local store could not be opened safely."
        }
        return NaasehErrorState(detail: detail)
    }
}

private extension AppSection {
    static let webNavigation: [AppSection] = [.tasks, .journal, .lists, .directory, .reports, .settings]

    var title: LocalizedStringKey {
        switch self {
        case .tasks: "Tasks"
        case .lists: "Lists"
        case .directory: "Directory"
        case .timer: "Timer"
        case .journal: "Journal"
        case .reports: "Reports"
        case .settings: "Your Profile"
        }
    }

    var symbol: String {
        switch self {
        case .tasks: "checklist"
        case .lists: "list.bullet.rectangle"
        case .directory: "person.2"
        case .timer: "timer"
        case .journal: "book.closed"
        case .reports: "chart.bar"
        case .settings: "gearshape"
        }
    }
}
