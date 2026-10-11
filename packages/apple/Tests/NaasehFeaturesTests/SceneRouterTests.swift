import Foundation
import NaasehFeatures
import Testing

@MainActor @Suite("Authorized scene routing") struct SceneRouterTests {
    @Test("links, alerts, Siri, search, files, stale targets, and authorization share one gate")
    func routes() async {
        let router = SceneRouter()
        let allow: @Sendable (String, String) async -> Bool = { kind, _ in kind != "private" }
        let exists: @Sendable (String, String) async -> Bool = { _, id in id != "stale" }
        for source in ExternalRouteSource.allTestCases {
            #expect(await router.route(.init(source: source, section: .tasks, kind: "task", opaqueID: source.rawValue), authorized: allow, exists: exists) == .routed(.transientDetail(kind: "task", opaqueID: source.rawValue)))
        }
        #expect(await router.route(.init(source: .alert, section: .tasks, kind: "private", opaqueID: "x"), authorized: allow, exists: exists) == .unauthorized)
        #expect(await router.route(.init(source: .search, section: .tasks, kind: "task", opaqueID: "stale"), authorized: allow, exists: exists) == .stale)
        #expect(await router.route(url: URL(string: "naaseh://tasks/task/1")!, source: .link, authorized: allow, exists: exists) == .routed(.transientDetail(kind: "task", opaqueID: "1")))
    }

    @Test("encrypted scene state restores safe fields and detects multiwindow edits")
    func state() async throws {
        let store = try SceneStateStore(key: Data(repeating: 3, count: 32))
        let snapshot = SceneStateSnapshot(sceneID: "a", selectedSection: .journal, selectedOpaqueID: "opaque", filterTokens: ["active"], scrollAnchor: "row-2", encryptedDraftRevision: 4)
        try await store.save(snapshot, draft: Data("private draft".utf8))
        let restored = try #require(try await store.load(sceneID: "a"))
        #expect(restored.snapshot == snapshot); #expect(restored.draft == Data("private draft".utf8))
        try await store.beginEditing(recordID: "r", sceneID: "a")
        await #expect(throws: SceneStateError.editConflict(.init(recordID: "r", editingSceneIDs: ["a"]))) { try await store.beginEditing(recordID: "r", sceneID: "b") }
    }
}

private extension ExternalRouteSource {
    static let allTestCases: [Self] = [.link, .alert, .siri, .search, .file, .restoration]
}
