import NaasehContracts
import NaasehFeatures
import NaasehPersistence
import NaasehServices
import NaasehSync
import Security
import SwiftUI
import UserNotifications

@main
@MainActor
struct NaasehIOSApp: App {
    @UIApplicationDelegateAdaptor(TaskNotificationDelegate.self) private var notificationDelegate
    @Environment(\.scenePhase) private var scenePhase
    private let isUITesting: Bool
    private let core: AppCore
    private let authentication: AuthenticationViewModel
    private let tasks: TaskWorkspaceModel

    init() {
        let isUITesting = ProcessInfo.processInfo.arguments.contains("-ui-testing")
        NativeTaskAttachmentTemporaryFiles.cleanupAfterLaunch()
        let platform: NativePlatform = UIDevice.current.userInterfaceIdiom == .pad ? .ipados : .ios
        let buildNumber = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 1
        let identity = NativeClientIdentity(
            platform: platform,
            buildNumber: buildNumber,
            contractVersion: NaasehSyncModule.contractVersion
        )
        let clientID = UserDefaults.standard.string(forKey: "naaseh.native.client-id") ?? UUID().uuidString
        UserDefaults.standard.set(clientID, forKey: "naaseh.native.client-id")
        let client = try! APIClient(baseURL: URL(string: "https://gsd.thepandas.link")!, identity: identity, clientID: clientID)
        let authenticationService = AuthenticationService(
            transport: APIAuthenticationTransport(client: client)
        )
        let credential: @Sendable () async throws -> NativeSessionCredential = {
            guard let value = await authenticationService.session?.credential else {
                throw AuthenticationError.noSession
            }
            guard await authenticationService.permitsOfflineAccess(at: Date()),
                  await !authenticationService.isLocallyLocked else {
                throw AuthenticationError.offlineValidationRequired
            }
            return value
        }
        let persistence = PersistenceController()
        let syncStore = SecureNativeSyncStore(controller: persistence)
        let sync = SyncEngine(
            store: syncStore,
            transport: APINativeSyncTransport(client: client, credential: credential)
        )
        let telemetryDirectory = FileManager.default.urls(
            for: .cachesDirectory,
            in: .userDomainMask
        )[0].appendingPathComponent("NaasehTelemetry", isDirectory: true)
        let telemetryBuffer = isUITesting ? NativeTelemetryBuffer(memoryOnlyMaximumCount: 100) : (try? NativeTelemetryBuffer(
                directory: telemetryDirectory,
                encryptionKey: try? NativeTelemetryKeyStore.loadOrCreate()
            )) ?? NativeTelemetryBuffer(memoryOnlyMaximumCount: 100)
        let telemetry = NativeTelemetryUploader(
            buffer: telemetryBuffer,
            transport: APINativeTelemetryTransport(client: client, credential: credential)
        )
        let runtime = NativeApplicationRuntime(
            compatibility: ProductionCompatibilityChecker(
                client: APICompatibilityClient(client: client)
            ),
            authentication: authenticationService,
            secureAccounts: SecureAccountStore(),
            persistence: persistence,
            syncStore: syncStore,
            sync: sync,
            telemetry: telemetry,
            appGroupIdentifier: "group.link.thepandas.naaseh",
            onSessionClosed: {
                await IntentDependencies.shared.purge()
                UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
                UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            }
        )
        self.isUITesting = isUITesting
        let core = AppCore(dependencies: AppDependencies(lifecycle: runtime))
        if isUITesting {
            core.updateState(.ready(connectivity: .online))
        }
        let authentication = AuthenticationViewModel(service: authenticationService)
        let tasks: TaskWorkspaceModel
        if isUITesting {
            tasks = TaskWorkspaceModel(actorID: "ui-testing")
        } else {
            let taskStorage = SyncedTaskWorkspaceStore(syncStore: syncStore, stackClient: NativeTaskStackClient(client: client, credential: credential), timerNow: { await client.currentServerTime() }) {
                guard let userID = await authenticationService.session?.user.id else {
                    throw AuthenticationError.noSession
                }
                return userID
            }
            tasks = TaskWorkspaceModel(
                storage: taskStorage,
                afterMutation: { [weak core] in await core?.refresh() }
            )
        }
        if !isUITesting {
            let features = NativeTaskFeatureClient(client: client, credential: credential)
            tasks.featureClient = features
            let notifications = NativeTaskNotificationCoordinator(client: features, clientID: clientID)
            notifications.openTask = { [weak core, weak tasks] id in
                guard let core, let tasks, case .ready = core.state, tasks.tasks.contains(where: { $0.id == id }) else { return }
                core.router.selectedSection = .tasks
                core.router.path = [.section(.tasks)]
                tasks.selectedTaskID = id
            }
            tasks.notifications = notifications
        }
        authentication.onAuthenticated = { [weak core, weak tasks] in
            await core?.start()
            await tasks?.reload()
            _ = try? await IntentDependencies.shared.resumePendingContinuation()
        }
        if ProcessInfo.processInfo.arguments.contains("-screenshot-tasks") {
            let fixtures: [(String, TaskUrgency)] = [
                ("Prepare the quarterly planning notes", .high),
                ("Review the website accessibility audit", .critical),
                ("Schedule the design handoff", .medium),
                ("Send the updated project brief", .medium),
                ("Organize research references", .low),
            ]
            Task {
                for fixture in fixtures.reversed() {
                    await tasks.save(label: fixture.0, urgency: fixture.1, parentID: nil)
                }
            }
            core.router.path = [.section(.tasks)]
        }
        tasks.onReferencesChanged = { references in
            guard references.actorID == (await authenticationService.session?.user.id) else { return }
            let projects = references.projects.map { AuthorizedProject(id: $0.id, name: $0.name, isActive: true, isAuthorized: true) }
            await IntentDependencies.shared.updateProjects(AuthorizedProjectQuery(projects: projects))
        }
        let projectQuery = AuthorizedProjectQuery(projects: [])
        let voiceService = tasks.voiceService(projects: projectQuery) {
            guard await authenticationService.session != nil else { return .signedOut }
            guard await authenticationService.permitsOfflineAccess(at: Date()) else { return .locked }
            return await authenticationService.isLocallyLocked ? .locked : .unlocked
        }
        var continuationKey = Data(repeating: 0, count: 32)
        _ = continuationKey.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
        }
        let continuationStore = try! VoiceContinuationStore(key: continuationKey)
        Task {
            await IntentDependencies.shared.configure(
                voiceService: voiceService,
                continuationStore: continuationStore,
                projectQuery: projectQuery
            )
        }
        self.core = core
        self.authentication = authentication
        self.tasks = tasks
    }

    var body: some Scene {
        WindowGroup {
            PadSceneEntry(core: core, authentication: authentication, tasks: tasks)
                .onOpenURL { url in
                    Task {
                        if url.host == "timer", let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                           let run = parts.queryItems?.first(where: { $0.name == "run" })?.value, tasks.timer?.runId == run,
                           parts.queryItems?.first(where: { $0.name == "action" })?.value == "toggle", case .ready = core.state {
                            await tasks.runTimer(.init(tasks.timer?.status == "paused" ? "resume" : "pause"))
                            return
                        }
                        if await IntentDependencies.shared.routeContinuation(url) {
                            _ = try? await IntentDependencies.shared.resumePendingContinuation()
                        }
                    }
                }
                .alert("Couldn’t Sign Out", isPresented: Binding(
                    get: { core.signOutError != nil },
                    set: { if !$0 { core.signOutError = nil } }
                )) {
                    Button("OK", role: .cancel) { core.signOutError = nil }
                } message: {
                    Text(core.signOutError ?? "")
                }
                .onChange(of: core.state) { _, state in
                    if case .ready = state {} else { tasks.clearProtectedContent() }
                    if state == .signedOut { authentication.resetForSignIn() }
                }
                .task(id: scenePhase) {
                    if scenePhase == .background {
                        if !isUITesting, case .ready = core.state { await core.lock(); tasks.clearProtectedContent() }
                        await NativeTaskLiveActivityController.shared.redact()
                        return
                    }
                    guard scenePhase == .active else { return }
                    try? await syncAndReload()
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(120))
                        guard !Task.isCancelled else { return }
                        try? await syncAndReload()
                    }
                }
        }
    }

    private func syncAndReload() async throws {
        if isUITesting { await tasks.reload(); return }
        await core.refresh()
        if case .ready = core.state { await tasks.reload() }
        else { tasks.clearProtectedContent() }
    }
}
