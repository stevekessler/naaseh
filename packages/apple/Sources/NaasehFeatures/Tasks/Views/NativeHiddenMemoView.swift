import SwiftUI
import NaasehContracts

public struct NativeHiddenMemoView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @Bindable var model: TaskWorkspaceModel
    let task: TaskRecord
    @State private var service = HiddenMemoService()
    @State private var package: HiddenMemoPackage?
    @State private var document: TaskMemoDocument?
    @State private var pin = ""
    @State private var confirmation = ""
    @State private var password = ""
    @State private var reason = ""
    @State private var recovering = false
    @State private var busy = false
    @State private var error: String?
    @State private var operation: Task<Void, Never>?
    @State private var discard = false

    public var body: some View {
        NavigationStack {
            Group {
                if phase != .active { ContentUnavailableView("Memo locked", systemImage: "lock.fill") }
                else {
                    Form {
                        if let document {
                            Section("Hidden memo") {
                                TaskMemoEditorView(document: Binding(get: { document }, set: { self.document = $0 }))
                            }
                        }
                        if document == nil || !task.memoHidden {
                            Section(task.memoHidden ? "Unlock memo" : "Protect memo") {
                                SecureField("Memo PIN", text: $pin)
                                if !task.memoHidden { SecureField("Confirm PIN", text: $confirmation) }
                                if task.memoHidden {
                                    Button("Unlock") { unlock() }.disabled(pin.isEmpty || busy)
                                    Toggle("Recover with account password", isOn: $recovering)
                                    if recovering {
                                        SecureField("Account password", text: $password)
                                        TextField("Reason for recovery", text: $reason)
                                        Button("Recover memo") { recover() }.disabled(password.isEmpty || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                                    }
                                } else {
                                    Text("Choose a 6–12 digit PIN. Encrypted recovery keys allow the audited account recovery flow.").font(.caption)
                                }
                            }
                        }
                        if busy { ProgressView("Securing memo…") }
                        if let error { Text(error).foregroundStyle(.red) }
                    }
                }
            }
            .privacySensitive()
            .navigationTitle(task.memoHidden ? "Hidden Memo" : "Protect Memo")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Relock and close") { if document != nil { discard = true } else { close() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Encrypt and save") { save() }.disabled(!model.canEdit(task) || document == nil || busy || (!task.memoHidden && (pin != confirmation || pin.count < 6)))
                }
            }
            .confirmationDialog("Relock without saving changes?", isPresented: $discard) {
                Button("Discard and relock", role: .destructive) { close() }
                Button("Keep editing", role: .cancel) {}
            }
        }
        .frame(idealWidth: 620, minHeight: 400)
        .interactiveDismissDisabled(busy || document != nil)
        .task(id: task.id) {
            if task.memoHidden {
                guard let encoded = task.encryptedMemo, let pkg = try? JSONDecoder().decode(HiddenMemoPackage.self, from: Data(encoded.utf8)), pkg.taskId == task.id else {
                    error = "The encrypted memo could not be opened."; return
                }
                package = pkg
            } else { document = task.memoDocument ?? TaskMemoDocument(text: task.memo) }
        }
        .onChange(of: phase) { _, value in if value != .active { clear() } }
        .onDisappear { clear() }
    }
    private func run(_ action: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }; busy = true; error = nil
        operation = Task { @MainActor in
            defer { busy = false; operation = nil }
            do { try await action() } catch is CancellationError {} catch { self.error = error.localizedDescription }
        }
    }
    private func unlock() {
        guard let package else { return }
        run {
            let value = try await service.unlockDocument(package, pin: pin)
            try Task.checkCancellation()
            document = value; pin = ""
        }
    }
    private func recover() {
        guard let package else { return }
        run {
            guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
            var key = try await client.recoverHiddenMemo(package, password: password, reason: reason)
            defer { key.resetBytes(in: 0..<key.count); password = ""; reason = "" }
            let value = try await service.recoverDocument(package, rawKey: key)
            try Task.checkCancellation()
            document = value; pin = ""
        }
    }
    private func save() {
        guard let document else { return }
        run {
            let next: HiddenMemoPackage
            if let package { next = try await service.editDocument(package, document: document) }
            else {
                guard pin == confirmation, let client = model.featureClient else { throw HiddenMemoError.invalidPIN }
                var registry = JSONValue.null
                do {
                    registry = try await client.bootstrapRegistry()
                    try Task.checkCancellation()
                    try await model.cache(registry, kind: .setting, id: "memo-recovery-registry")
                } catch {
                    guard let saved = try await model.cachedValues(.setting).first(where: {
                        if case let .object(fields) = $0 { return fields["schema"] == .string("naaseh-recovery-key-registry/v1") }; return false
                    }) else { throw error }
                    registry = saved
                }
                let recipients = try NativeRecoveryRegistry.recipients(registry)
                next = try await service.createDocument(taskID: task.id, document: document, pin: pin, recipients: recipients)
            }
            try Task.checkCancellation()
            try await model.saveProtectedMemo(next, task: task)
            close()
        }
    }
    private func clear() {
        operation?.cancel(); document = nil; pin = ""; confirmation = ""; password = ""; reason = ""
        Task { await service.applicationDidEnterBackground() }
    }
    private func close() { clear(); dismiss() }
}

extension HiddenMemoError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .invalidPIN: "The memo PIN is invalid. Try again."
        case .locked: "Unlock the memo before editing."
        case .malformedPackage: "The encrypted memo could not be verified."
        case .recoveryUnavailable: "Connect to refresh the recovery keys and try again."
        }
    }
}
