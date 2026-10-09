import NaasehContracts
import NaasehFeatures
import NaasehPersistence
import NaasehServices
import NaasehSync
import Security
import SwiftUI

@main
@MainActor
struct NaasehIOSApp: App {
    private let core: AppCore
    private let authentication: AuthenticationViewModel
    private let tasks: TaskWorkspaceModel

    init() {
        let platform: NativePlatform = UIDevice.current.userInterfaceIdiom == .pad ? .ipados : .ios
        let buildNumber = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 1
        let identity = NativeClientIdentity(
            platform: platform,
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
        let core = AppCore(dependencies: AppDependencies(lifecycle: runtime))
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            core.updateState(.ready(connectivity: .online))
        }
        let authentication = AuthenticationViewModel(service: authenticationService)
        authentication.onAuthenticated = { [weak core] in
            await core?.start()
            _ = try? await IntentDependencies.shared.resumePendingContinuation()
        }
        let tasks = TaskWorkspaceModel(actorID: "authenticated-user")
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
    }

    var body: some Scene {
        WindowGroup {
            PadSceneEntry(core: core, authentication: authentication, tasks: tasks)
                .onOpenURL { url in
                    Task {
                        if await IntentDependencies.shared.routeContinuation(url) {
                            _ = try? await IntentDependencies.shared.resumePendingContinuation()
                        }
                    }
                }
        }
    }
}
