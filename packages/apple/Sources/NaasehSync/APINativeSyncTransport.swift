import Foundation
import NaasehServices

public actor APINativeSyncTransport: NativeSyncTransport {
    private let client: APIClient
    private let credential: @Sendable () async throws -> NativeSessionCredential

    public init(
        client: APIClient,
        credential: @escaping @Sendable () async throws -> NativeSessionCredential
    ) {
        self.client = client
        self.credential = credential
    }

    public func bootstrap() async throws -> NativeSyncPage {
        let response = try await client.request(
            path: "/api/v1/sync/bootstrap",
            session: try await credential()
        )
        guard (200 ..< 300).contains(response.statusCode) else { throw SyncEngineError.transport }
        return try Self.page(from: response.body, bootstrap: true)
    }

    public func pull(cursor: String?) async throws -> NativeSyncPage {
        let cursorObject = cursor.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) }
            ?? [String: Int]()
        let body = try JSONSerialization.data(withJSONObject: ["cursor": cursorObject])
        let response = try await client.request(
            path: "/api/v1/sync/pull",
            method: "POST",
            body: body,
            session: try await credential(),
            idempotencyKey: UUID().uuidString
        )
        guard (200 ..< 300).contains(response.statusCode) else { throw SyncEngineError.transport }
        return try Self.page(from: response.body, bootstrap: false)
    }

    public func push(_ operations: [NativeSyncOperation]) async throws -> [NativePushResult] {
        let mutations = try operations.map { operation -> [String: Any] in
            let payload = try JSONSerialization.jsonObject(with: operation.payload)
            let mutation: [String: Any] = [
                "id": operation.id,
                "entityType": operation.targetKind,
                "entityId": operation.targetID,
                "operation": operation.operation,
                "baseVersion": operation.baseVersion ?? 0,
                "payload": payload,
                "createdAt": ISO8601DateFormatter().string(from: operation.createdAt),
                "attempts": operation.attempts,
            ]
            return mutation
        }
        let body = try JSONSerialization.data(withJSONObject: [
            "contractVersion": 4,
            "mutations": mutations,
        ])
        let response = try await client.request(
            path: "/api/v1/sync/push",
            method: "POST",
            body: body,
            session: try await credential(),
            idempotencyKey: operations.first?.id
        )
        guard (200 ..< 300).contains(response.statusCode) else {
            throw SyncEngineError.transport
        }
        guard let object = try JSONSerialization.jsonObject(with: response.body) as? [String: Any],
              let values = object["results"] as? [[String: Any]]
        else { throw SyncEngineError.transport }
        return try values.map { value in
            guard let id = value["mutationId"] as? String,
                  let status = value["status"] as? String
            else { throw SyncEngineError.malformedReceipt }
            let disposition: NativePushDisposition = switch status {
            case "applied": .applied
            case "duplicate", "alreadyApplied": .duplicate
            case "conflict": .conflict
            case "rejected": .rejected
            default: throw SyncEngineError.malformedReceipt
            }
            return NativePushResult(mutationID: id, disposition: disposition)
        }
    }

    static func page(from data: Data, bootstrap: Bool) throws -> NativeSyncPage {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SyncEngineError.transport
        }
        var records: [NativeSyncRecord] = []
        var tombstones: [NativeSyncTombstone] = []
        if bootstrap {
            for (key, kind) in [
                ("tasks", "task"), ("categories", "category"), ("projects", "project"),
                ("lists", "list"), ("listItems", "listItem"),
            ] {
                for value in object[key] as? [[String: Any]] ?? [] {
                    guard let id = value["id"] as? String else { continue }
                    records.append(
                        .init(
                            kind: kind,
                            id: id,
                            version: value["version"] as? Int ?? 1,
                            payload: try JSONSerialization.data(withJSONObject: value)
                        )
                    )
                }
            }
        } else {
            for change in object["changes"] as? [[String: Any]] ?? [] {
                guard let kind = change["entityType"] as? String,
                      let id = change["entityId"] as? String
                else { continue }
                let version = change["version"] as? Int ?? 1
                if change["operation"] as? String == "tombstone" {
                    tombstones.append(.init(kind: kind, id: id, version: version))
                    continue
                }
                guard let payload = change["payload"] else { throw SyncEngineError.malformedReceipt }
                records.append(
                    .init(
                        kind: kind,
                        id: id,
                        version: (payload as? [String: Any])?["version"] as? Int ?? version,
                        payload: try JSONSerialization.data(withJSONObject: payload)
                    )
                )
            }
        }
        let cursorObject = object["cursor"] ?? [String: Int]()
        let cursor = String(
            decoding: try JSONSerialization.data(withJSONObject: cursorObject),
            as: UTF8.self
        )
        return NativeSyncPage(records: records, tombstones: tombstones, cursor: cursor)
    }
}
