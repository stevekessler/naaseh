import Foundation
import NaasehFeatures

actor IntentDependencies {
    static let shared = IntentDependencies()

    private var voiceService: VoiceTaskService?
    private var continuationStore: VoiceContinuationStore?
    private var projectQuery = AuthorizedProjectQuery(projects: [])
    private var pendingContinuationToken: String?

    func configure(
        voiceService: VoiceTaskService,
        continuationStore: VoiceContinuationStore,
        projectQuery: AuthorizedProjectQuery
    ) {
        self.voiceService = voiceService
        self.continuationStore = continuationStore
        self.projectQuery = projectQuery
    }

    func create(_ request: VoiceTaskRequest) async throws -> VoiceTaskResult {
        guard let voiceService else { throw VoiceTaskError.signedOut }
        return try await voiceService.create(request)
    }

    func saveContinuation(_ request: VoiceTaskRequest) async throws -> String {
        guard let continuationStore else { throw VoiceContinuationError.missing }
        return try await continuationStore.save(request)
    }

    func consumeContinuation(_ token: String) async throws -> VoiceTaskRequest {
        guard let continuationStore else { throw VoiceContinuationError.missing }
        return try await continuationStore.take(token)
    }

    func routeContinuation(_ url: URL) -> Bool {
        guard url.scheme == "naaseh", url.host == "voice", url.path == "/continue",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              UUID(uuidString: token) != nil
        else { return false }
        pendingContinuationToken = token
        return true
    }

    @discardableResult
    func resumePendingContinuation() async throws -> VoiceTaskResult? {
        guard let token = pendingContinuationToken else { return nil }
        guard let continuationStore, let voiceService else { throw VoiceContinuationError.missing }
        switch await voiceService.currentAccess() {
        case .unlocked: break
        case .locked: throw VoiceTaskError.locked
        case .signedOut: throw VoiceTaskError.signedOut
        }
        do {
            let request = try await continuationStore.take(token)
            let result = try await voiceService.create(request)
            pendingContinuationToken = nil
            return result
        } catch VoiceTaskError.locked {
            throw VoiceTaskError.locked
        } catch {
            pendingContinuationToken = nil
            throw error
        }
    }

    func purge() async {
        pendingContinuationToken = nil
        await continuationStore?.purge()
    }

    func projects(identifiers: [String]) -> [ExistingProjectEntity] {
        identifiers.compactMap { identifier in
            guard case let .resolved(project) = projectQuery.resolve(identifier) else { return nil }
            return ExistingProjectEntity(id: project.id, name: project.name)
        }
    }

    func projects(matching term: String) -> [ExistingProjectEntity] {
        projectQuery.suggestedProjects(matching: term).map {
            ExistingProjectEntity(id: $0.id, name: $0.name)
        }
    }
}
