import SwiftUI
import UniformTypeIdentifiers
import QuickLook
import PhotosUI
import ImageIO
#if os(iOS)
import UIKit
#endif

public struct NativeTaskFile: FileDocument {
    public static var readableContentTypes: [UTType] { [.data] }
    public var data: Data
    public init(data: Data) { self.data = data }
    public init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    public func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

public struct NativeTaskAttachmentsView: View {
    @Environment(\.scenePhase) private var phase
    @Bindable var model: TaskWorkspaceModel
    let task: TaskRecord
    @State private var choosing = false
    @State private var photo: PhotosPickerItem?
    @State private var camera = false
    @State private var exporting = false
    @State private var file: NativeTaskFile?
    @State private var filename = "attachment"
    @State private var preview: URL?
    @State private var temporary: URL?
    @State private var busy = false
    @State private var progress: Double = 0
    @State private var error: String?
    @State private var removing: TaskAttachmentRecord?
    @State private var operation: Task<Void, Never>?

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Attachments").font(.headline)
            ForEach(model.attachments.filter { $0.parentType == "task" && $0.parentId == task.id }) { item in
                VStack(alignment: .leading) {
                    Text(item.originalFilename).font(.subheadline)
                    Text(item.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption)
                    HStack {
                        if item.status == "available" {
                            Button("Preview") { download(item, previewing: true) }
                            Button("Save file") { download(item, previewing: false) }
                        }
                        if ["scanning", "scan_failed", "pending_upload"].contains(item.status) {
                            Button("Refresh") { run {
                                guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
                                let fresh = try await client.attachment(item.id)
                                try await model.cache(fresh, kind: .attachment, id: fresh.id, version: fresh.version)
                                try await model.refreshAttachments()
                            } }
                        }
                        if item.status == "scan_failed" {
                            Button("Retry scan") { run {
                                guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
                                let fresh = try await client.retryAttachment(item.id)
                                try await model.cache(fresh, kind: .attachment, id: fresh.id, version: fresh.version)
                                try await model.refreshAttachments()
                            } }
                        }
                        Button("Remove", role: .destructive) { removing = item }.disabled(!model.canEdit(task))
                    }
                }
            }
            Button("Choose file", systemImage: "paperclip") { choosing = true }
                .disabled(model.featureClient == nil || busy || !model.canEdit(task))
            PhotosPicker(selection: $photo, matching: .images) { Label("Choose photo", systemImage: "photo") }
                .disabled(model.featureClient == nil || busy || !model.canEdit(task))
            #if os(iOS)
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Take photo", systemImage: "camera") { camera = true }.disabled(busy || !model.canEdit(task))
            }
            #endif
            if busy {
                ProgressView(value: progress)
                Button("Cancel") { operation?.cancel() }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .padding()
        .disabled(busy && operation == nil)
        .fileImporter(isPresented: $choosing, allowedContentTypes: [.pdf, .image, .plainText, .commaSeparatedText, .content], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let source = urls.first else { return }
                run {
                    guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
                    let item = try await client.upload(source, taskID: task.id) { value in Task { @MainActor in progress = value } }
                    try Task.checkCancellation()
                    try await model.cache(item, kind: .attachment, id: item.id, version: item.version)
                    try await model.refreshAttachments()
                }
            case .failure(let failure): error = failure.localizedDescription
            }
        }
        .fileExporter(isPresented: $exporting, document: file, contentType: .data, defaultFilename: filename) { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
            file = nil
        }
        .quickLookPreview($preview)
        .confirmationDialog("Remove this attachment?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("Remove attachment", role: .destructive) {
                guard let item = removing else { return }; removing = nil
                run {
                    guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
                    try await client.removeAttachment(item.id)
                    try Task.checkCancellation()
                    var deleted = item; deleted.status = "deleted"; deleted.version += 1
                    try await model.cache(deleted, kind: .attachment, id: item.id, version: deleted.version)
                    model.attachments.removeAll { $0.id == item.id }
                }
            }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            run {
                guard let data = try await item.loadTransferable(type: Data.self) else { throw NativeTaskFeatureError.invalidFile }
                try await uploadPhoto(data)
                photo = nil
            }
        }
        #if os(iOS)
        .sheet(isPresented: $camera) {
            NativeTaskCamera { image in
                camera = false
                if let data = image?.jpegData(compressionQuality: 0.9) { run { try await uploadPhoto(data) } }
            }
        }
        #endif
        .onChange(of: phase) { _, value in if value != .active { clear() } }
        .onChange(of: preview) { _, value in if value == nil { cleanupPreview() } }
        .onDisappear { clear() }
    }
    private func run(_ action: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true; error = nil; progress = 0
        operation = Task { @MainActor in
            defer { busy = false; operation = nil }
            do { try await action() } catch is CancellationError {} catch { self.error = error.localizedDescription }
        }
    }
    private func download(_ item: TaskAttachmentRecord, previewing: Bool) {
        run {
            guard let client = model.featureClient else { throw NativeTaskFeatureError.unavailable }
            let data = try await client.download(item)
            try Task.checkCancellation()
            if previewing {
                cleanupPreview()
                let directory = FileManager.default.temporaryDirectory.appendingPathComponent("naaseh-preview-\(UUID().uuidString)")
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var values = URLResourceValues(); values.isExcludedFromBackup = true
                var target = directory; try target.setResourceValues(values)
                let safe = item.originalFilename.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "\\", with: "_")
                let url = directory.appendingPathComponent(safe == "." || safe == ".." || safe.isEmpty ? "attachment" : safe)
                #if os(iOS)
                try data.write(to: url, options: [.atomic, .completeFileProtection])
                #else
                try data.write(to: url, options: .atomic)
                #endif
                temporary = directory; preview = url
            } else { file = NativeTaskFile(data: data); filename = item.originalFilename; exporting = true }
        }
    }
    private func uploadPhoto(_ input: Data) async throws {
        guard input.count <= 25 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(input as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096] as CFDictionary) else { throw NativeTaskFeatureError.invalidFile }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { throw NativeTaskFeatureError.invalidFile }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination), let client = model.featureClient else { throw NativeTaskFeatureError.invalidFile }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("task-photo-\(UUID().uuidString).jpg")
        defer { try? FileManager.default.removeItem(at: url) }
        #if os(iOS)
        try (data as Data).write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try (data as Data).write(to: url, options: .atomic)
        #endif
        let item = try await client.upload(url, taskID: task.id) { value in Task { @MainActor in progress = value } }
        try Task.checkCancellation()
        try await model.cache(item, kind: .attachment, id: item.id, version: item.version)
        try await model.refreshAttachments()
    }

    private func cleanupPreview() { if let temporary { try? FileManager.default.removeItem(at: temporary) }; temporary = nil }
    private func clear() { operation?.cancel(); operation = nil; file = nil; preview = nil; cleanupPreview(); busy = false }
}

#if os(iOS)
private struct NativeTaskCamera: UIViewControllerRepresentable {
    let completion: @MainActor (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController(); picker.sourceType = .camera; picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    @MainActor final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completion: @MainActor (UIImage?) -> Void
        init(completion: @escaping @MainActor (UIImage?) -> Void) { self.completion = completion }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            completion(info[.originalImage] as? UIImage)
        }
    }
}
#endif

public enum NativeTaskAttachmentTemporaryFiles {
    public static func cleanupAfterLaunch() {
        let folder = FileManager.default.temporaryDirectory
        guard let values = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return }
        for value in values where value.lastPathComponent.hasPrefix("naaseh-preview-") || value.lastPathComponent.hasPrefix("task-photo-") {
            try? FileManager.default.removeItem(at: value)
        }
    }
}
