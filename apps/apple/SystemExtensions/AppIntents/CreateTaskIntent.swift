import AppIntents
import NaasehFeatures

struct ExistingProjectEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Na’aseh Project")
    static let defaultQuery = ExistingProjectEntityQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { .init(title: "\(name)") }
}

struct ExistingProjectEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [ExistingProjectEntity] {
        await IntentDependencies.shared.projects(identifiers: identifiers)
    }

    func entities(matching string: String) async throws -> [ExistingProjectEntity] {
        await IntentDependencies.shared.projects(matching: string)
    }

    func suggestedEntities() async throws -> [ExistingProjectEntity] {
        await IntentDependencies.shared.projects(matching: "")
    }
}

struct CreateTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add a Task"
    static let description = IntentDescription("Adds one task to your existing Na’aseh account, including while offline.")
    static let openAppWhenRun = false
    static let safeSuccessDialog = "Task added to Na’aseh."

    @Parameter(title: "Task") var taskTitle: String
    @Parameter(title: "Project") var project: ExistingProjectEntity?
    @Parameter(title: "Due date and time") var dueAt: Date?
    var invocationID = UUID().uuidString

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$taskTitle) to \(\.$project) due \(\.$dueAt)")
    }

    init() { invocationID = UUID().uuidString }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let calendar = Calendar.current
        let request = VoiceTaskRequest(
            invocationID: invocationID,
            title: taskTitle,
            projectTerm: project?.id,
            dueDate: dueAt.map {
                String(format: "%04d-%02d-%02d", calendar.component(.year, from: $0), calendar.component(.month, from: $0), calendar.component(.day, from: $0))
            },
            dueTime: dueAt.map {
                String(format: "%02d:%02d", calendar.component(.hour, from: $0), calendar.component(.minute, from: $0))
            }
        )
        do {
            _ = try await IntentDependencies.shared.create(request)
            return .result(dialog: IntentDialog(stringLiteral: Self.safeSuccessDialog))
        } catch VoiceTaskError.ambiguousProject {
            return .result(dialog: "I found more than one authorized project with that name. Please choose one.")
        } catch VoiceTaskError.projectNotFound {
            return .result(dialog: "I couldn’t find an authorized existing project with that name.")
        } catch VoiceTaskError.locked {
            if let token = try? await IntentDependencies.shared.saveContinuation(request),
               let url = URL(string: "naaseh://voice/continue?token=\(token)") {
                return .result(
                    opensIntent: OpenURLIntent(url),
                    dialog: "Open Na’aseh to unlock and finish adding this task."
                )
            }
            return .result(dialog: "Open Na’aseh to unlock and try again.")
        } catch {
            return .result(dialog: "I couldn’t add the task. Open Na’aseh to try again.")
        }
    }
}
