import Foundation
import NaasehSync
import Testing

private actor WorkloadTransport: NativeSyncTransport {
    func bootstrap() -> NativeSyncPage { .init(records: [], cursor: "bootstrap") }
    func pull(cursor: String?) -> NativeSyncPage { .init(records: [], cursor: cursor ?? "pull") }
    func push(_ operations: [NativeSyncOperation]) -> [NativePushResult] {
        operations.map { .init(mutationID: $0.id, disposition: .applied) }
    }
}

@Suite("SC-005 200 sync operation workload") struct ExactlyOnceSyncWorkloadTests {
    @Test("200 unique sync IDs replayed two to five times apply once")
    func workload() async throws {
        let store = InMemoryNativeSyncStore()
        let now = Date(timeIntervalSince1970: 1)
        for index in 0 ..< 200 {
            let operation = NativeSyncOperation(
                id: "sync-\(index)", targetKind: "task", targetID: "task-\(index)",
                baseVersion: index, payload: Data("synthetic".utf8), createdAt: now
            )
            for _ in 0 ..< (2 + index % 4) { await store.enqueue(operation) }
        }
        let engine = SyncEngine(store: store, transport: WorkloadTransport())
        for _ in 0 ..< 4 { try await engine.push(now: now) }
        #expect(await store.applied.count == 200)
        #expect(await Set(store.applied).count == 200)
    }
}
