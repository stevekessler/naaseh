import NaasehDesignSystem
import Observation
import SwiftUI

@MainActor
@Observable
public final class SyncStatusModel {
    public enum Connection: Equatable, Sendable { case online, offline, reconnecting }
    public struct RejectedOperation: Identifiable, Sendable {
        public let id: String
        public let safeReason: String
        public let correlationID: String?
        public init(id: String, safeReason: String, correlationID: String? = nil) {
            self.id = id; self.safeReason = safeReason; self.correlationID = correlationID
        }
    }

    public var connection: Connection = .online
    public var lastSuccessfulSync: Date?
    public var pendingCount = 0
    public var conflictCount = 0
    public var rejected: [RejectedOperation] = []
    public var retry: @MainActor () async -> Void

    public init(retry: @escaping @MainActor () async -> Void = {}) { self.retry = retry }

    public var freshness: String {
        guard let lastSuccessfulSync else { return "Not yet synced" }
        let age = Date().timeIntervalSince(lastSuccessfulSync)
        if age < 60 { return "Synced just now" }
        if age < 3_600 { return "Synced \(Int(age / 60)) minutes ago" }
        return "Last synced \(lastSuccessfulSync.formatted(date: .abbreviated, time: .shortened))"
    }
}

public struct SyncStatusBanner: View {
    @Bindable private var model: SyncStatusModel

    public init(model: SyncStatusModel) { self.model = model }

    public var body: some View {
        if model.connection != .online || model.pendingCount > 0 || model.conflictCount > 0 {
            StatusBanner(
                kind: model.conflictCount > 0 ? .error : .warning,
                title: title,
                detail: LocalizedStringKey(model.freshness)
            )
            .accessibilityIdentifier(model.connection == .offline ? "sync.offline" : "sync.pending")
        }
    }

    private var title: LocalizedStringKey {
        if model.conflictCount > 0 { return "Conflicts need review" }
        if model.connection == .offline { return "Working offline" }
        if model.connection == .reconnecting { return "Reconnecting" }
        return "\(model.pendingCount) changes pending"
    }
}

public struct SyncStatusDetailView: View {
    @Bindable private var model: SyncStatusModel

    public init(model: SyncStatusModel) { self.model = model }

    public var body: some View {
        List {
            Section("Status") {
                LabeledContent("Connection", value: connectionLabel)
                LabeledContent("Freshness", value: model.freshness)
                LabeledContent("Pending changes", value: String(model.pendingCount))
                LabeledContent("Conflicts", value: String(model.conflictCount))
                Button("Retry Sync") { Task { await model.retry() } }
                    .accessibilityIdentifier("sync.retry")
            }
            if !model.rejected.isEmpty {
                Section("Changes that need attention") {
                    ForEach(model.rejected) { operation in
                        VStack(alignment: .leading) {
                            Text(operation.safeReason)
                            if let reference = operation.correlationID {
                                Text("Reference: \(reference)").font(.caption.monospaced())
                            }
                        }
                    }
                }
            }
            if model.conflictCount > 0 {
                Section {
                    Button("Review Conflicts (\(model.conflictCount))") {}
                        .accessibilityIdentifier("sync.reviewConflicts")
                }
            }
        }
        .navigationTitle("Sync Status")
    }

    private var connectionLabel: String {
        switch model.connection {
        case .online: "Online"
        case .offline: "Offline"
        case .reconnecting: "Reconnecting"
        }
    }
}
