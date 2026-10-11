import Foundation
import NaasehSync
import Testing

@Suite("Native sync engine")
struct SyncEngineTests {
    @Test("bootstrap and pull apply records with the cursor atomically")
    func bootstrapAndCursor() async throws {
        let store = InMemoryNativeSyncStore()
        let transport = SyncTransportStub(
            bootstrap: .init(records: [.init(kind: "task", id: "t1", version: 1, payload: Data("one".utf8))], cursor: "c1"),
            pulls: [.init(records: [.init(kind: "task", id: "t2", version: 1, payload: Data("two".utf8))], cursor: "c2")]
        )
        let engine = SyncEngine(store: store, transport: transport)
        try await engine.bootstrap()
        try await engine.pull()
        #expect(await store.cursor == "c2")
        #expect(await store.records.keys.sorted() == ["task:t1", "task:t2"])
        #expect(await store.atomicApplications == 2)
    }

    @Test("outbox ordering, duplicate replay, conflict, rejection, and retry are deterministic")
    func outboxOutcomes() async throws {
        let store = InMemoryNativeSyncStore()
        let now = Date(timeIntervalSince1970: 100)
        for id in ["m2", "m1", "m3", "m4"] {
            await store.enqueue(.init(id: id, targetKind: "task", targetID: id, baseVersion: 1, payload: Data(), createdAt: now))
        }
        let transport = SyncTransportStub(pushResults: [[
            .init(mutationID: "m1", disposition: .duplicate),
            .init(mutationID: "m2", disposition: .applied),
            .init(mutationID: "m3", disposition: .conflict),
            .init(mutationID: "m4", disposition: .rejected),
        ]])
        let engine = SyncEngine(store: store, transport: transport)
        try await engine.push(now: now)
        #expect(await transport.pushedMutationIDs == [["m1", "m2", "m3", "m4"]])
        #expect(await store.applied == ["m1", "m2"])
        #expect(await store.conflicts == ["m3"])
        #expect(await store.rejected == ["m4"])

        await store.enqueue(.init(id: "m5", targetKind: "task", targetID: "t5", baseVersion: nil, payload: Data(), createdAt: now))
        await transport.failNextPush()
        await #expect(throws: SyncEngineError.transport) { try await engine.push(now: now) }
        #expect(await store.retryDates["m5"] == now.addingTimeInterval(2))
    }

    @Test("revoked access removes local records and pending mutations for that audience")
    func revokedAccess() async throws {
        let store = InMemoryNativeSyncStore()
        await store.seed(audience: "group:g1", record: .init(kind: "task", id: "t1", version: 1, payload: Data()))
        let transport = SyncTransportStub(pulls: [.init(records: [], cursor: "c", revokedAudiences: ["group:g1"])])
        try await SyncEngine(store: store, transport: transport).pull()
        #expect(await store.records.isEmpty)
        #expect(await store.revoked == ["group:g1"])
    }

    @Test("four clients converge after duplicate delivery")
    func fourClientConvergence() async throws {
        let canonical = NativeSyncRecord(kind: "task", id: "shared", version: 4, payload: Data("latest".utf8))
        for _ in 0 ..< 4 {
            let store = InMemoryNativeSyncStore()
            let transport = SyncTransportStub(pulls: [.init(records: [canonical, canonical], cursor: "final")])
            try await SyncEngine(store: store, transport: transport).pull()
            #expect(await store.records["task:shared"] == canonical)
            #expect(await store.records.count == 1)
        }
    }
}

private actor SyncTransportStub: NativeSyncTransport {
    private let bootstrapValue: NativeSyncPage
    private var pullValues: [NativeSyncPage]
    private var resultValues: [[NativePushResult]]
    private var shouldFail = false
    private(set) var pushedMutationIDs: [[String]] = []

    init(
        bootstrap: NativeSyncPage = .init(records: [], cursor: "bootstrap"),
        pulls: [NativeSyncPage] = [],
        pushResults: [[NativePushResult]] = []
    ) {
        bootstrapValue = bootstrap
        pullValues = pulls
        resultValues = pushResults
    }

    func bootstrap() -> NativeSyncPage { bootstrapValue }
    func pull(cursor _: String?) throws -> NativeSyncPage {
        guard !pullValues.isEmpty else { throw SyncEngineError.transport }
        return pullValues.removeFirst()
    }
    func push(_ operations: [NativeSyncOperation]) throws -> [NativePushResult] {
        pushedMutationIDs.append(operations.map(\.id))
        if shouldFail { shouldFail = false; throw SyncEngineError.transport }
        guard !resultValues.isEmpty else { return operations.map { .init(mutationID: $0.id, disposition: .applied) } }
        return resultValues.removeFirst()
    }
    func failNextPush() { shouldFail = true }
}
