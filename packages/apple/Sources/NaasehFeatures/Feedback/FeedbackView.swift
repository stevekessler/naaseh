import Foundation
import SwiftUI

public struct SafeFeedbackDiagnostics: Codable, Equatable, Sendable {
    public let appVersion: String
    public let buildNumber: Int
    public let platform: String
    public let compatibilityState: String
    public let pendingCountBucket: String
    public let correlationIDs: [UUID]

    public init(appVersion: String, buildNumber: Int, platform: String, compatibilityState: String, pendingCountBucket: String, correlationIDs: [UUID]) {
        self.appVersion = appVersion
        self.buildNumber = buildNumber
        self.platform = platform
        self.compatibilityState = compatibilityState
        self.pendingCountBucket = pendingCountBucket
        self.correlationIDs = Array(correlationIDs.prefix(20))
    }

    public func exportData() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }

    public static func current(
        platform: String,
        compatibilityState: String,
        pendingCountBucket: String,
        correlationIDs: [UUID] = []
    ) -> Self {
        let info = Bundle.main.infoDictionary ?? [:]
        return .init(
            appVersion: info["CFBundleShortVersionString"] as? String ?? "unknown",
            buildNumber: Int(info["CFBundleVersion"] as? String ?? "") ?? 1,
            platform: platform,
            compatibilityState: compatibilityState,
            pendingCountBucket: pendingCountBucket,
            correlationIDs: correlationIDs
        )
    }
}

public struct FeedbackView: View {
    private let diagnostics: SafeFeedbackDiagnostics
    private let submit: @Sendable (String, Data) async throws -> Void
    @State private var feedback = ""
    @State private var status = ""

    public init(diagnostics: SafeFeedbackDiagnostics, submit: @escaping @Sendable (String, Data) async throws -> Void) {
        self.diagnostics = diagnostics
        self.submit = submit
    }

    public var body: some View {
        Form {
            Section("Feedback") {
                TextEditor(text: $feedback).accessibilityLabel("TestFlight feedback")
                Text("Do not include task, journal, Crisis Plan, attachment, account, or contact content.").font(.footnote)
            }
            Section("Safe diagnostics") {
                LabeledContent("Build", value: "\(diagnostics.appVersion) (\(diagnostics.buildNumber))")
                LabeledContent("Compatibility", value: diagnostics.compatibilityState)
                LabeledContent("Pending work", value: diagnostics.pendingCountBucket)
            }
            Button("Prepare Feedback") {
                Task {
                    do {
                        try await submit(feedback, diagnostics.exportData())
                        status = "Feedback prepared. Submit it from the TestFlight app."
                    } catch {
                        status = "Feedback could not be prepared. Try again."
                    }
                }
            }.disabled(feedback.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if !status.isEmpty { Text(status).accessibilityLabel(status) }
        }.navigationTitle("Beta Feedback")
    }
}
