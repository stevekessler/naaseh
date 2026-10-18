import NaasehContracts
import NaasehFeatures
import NaasehPersistence
import NaasehServices
import NaasehSync
import Security
import SwiftUI

@main
@MainActor
struct NaasehMacApp: App {
    @Environment(\.scenePhase) private var scenePhase
    private let core: AppCore
    private let authentication: AuthenticationViewModel
    private let tasks: TaskWorkspaceModel
    private let timer: MacTimerModel

    init() {
        let buildNumber = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 1
        let identity = NativeClientIdentity(
            platform: .macos,
            buildNumber: buildNumber,
            contractVersion: NaasehSyncModule.contractVersion
        )
        let client = try! APIClient(baseURL: URL(string: "https://gsd.thepandas.link")!, identity: identity)
        let authenticationService = AuthenticationService(
            transport: APIAuthenticationTransport(client: client)
        )
        let credential: @Sendable () async throws -> NativeSessionCredential = {
            guard let value = await authenticationService.session?.credential else {
                throw AuthenticationError.noSession
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
        let telemetryBuffer = (try? NativeTelemetryBuffer(
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
            appGroupIdentifier: "group.link.thepandas.naaseh"
        )
        let isUITesting = ProcessInfo.processInfo.arguments.contains("-ui-testing")
        let core = AppCore(dependencies: AppDependencies(lifecycle: runtime))
        if isUITesting {
            core.updateState(.ready(connectivity: .online))
        }
        let authentication = AuthenticationViewModel(service: authenticationService)
        let tasks: TaskWorkspaceModel
        if isUITesting {
            tasks = TaskWorkspaceModel(actorID: "ui-testing")
        } else {
            let taskStorage = SyncedTaskWorkspaceStore(syncStore: syncStore) {
                guard let userID = await authenticationService.session?.user.id else {
                    throw AuthenticationError.noSession
                }
                return userID
            }
            tasks = TaskWorkspaceModel(
                storage: taskStorage,
                afterMutation: { try? await sync.manualRefresh() }
            )
        }
        authentication.onAuthenticated = { [weak core, weak tasks] in
            await core?.start()
            await tasks?.reload()
            _ = try? await IntentDependencies.shared.resumePendingContinuation()
        }
        let projectQuery = AuthorizedProjectQuery(projects: [])
        let voiceService = tasks.voiceService(projects: projectQuery) {
            guard await authenticationService.session != nil else { return .signedOut }
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
        timer = MacTimerModel()
    }

    var body: some Scene {
        WindowGroup {
            MacRootView(core: core, authentication: authentication, tasks: tasks)
                .onOpenURL { url in
                    Task {
                        if await IntentDependencies.shared.routeContinuation(url) {
                            _ = try? await IntentDependencies.shared.resumePendingContinuation()
                        }
                    }
                }
                .task(id: scenePhase) {
                    guard scenePhase == .active else { return }
                    try? await syncAndReload()
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(120))
                        guard !Task.isCancelled else { return }
                        try? await syncAndReload()
                    }
                }
        }
        .commands { NaasehMacCommands(core: core) }

        Window("Timer", id: "timer") {
            MacTimerScene(model: timer)
        }

        MenuBarExtra("Na’aseh Timer", systemImage: "timer") {
            Text(timer.state?.phase.rawValue.capitalized ?? "Timer ready")
            Divider()
            Button("Start") { Task { await timer.start() } }
            Button("Pause") { Task { await timer.pause() } }
            Button("Resume") { Task { await timer.resume() } }
            Button("Reset") { Task { await timer.reset() } }
            Button("Switch Work/Rest") { Task { await timer.switchPhase() } }
        }
    }

    private func syncAndReload() async throws {
        try await core.dependencies.lifecycle.refresh()
        await tasks.reload()
    }
}
