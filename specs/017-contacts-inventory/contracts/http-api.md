# Contacts and Inventory HTTP API

The base path is `/api/v1/contacts-inventory/releases/{releaseId}`. This is a same-origin interface for the web feature. Standard responses use JSON and image reads return binary data. Endpoint paths below are relative to the base path. Use the existing authenticated cookie and CSRF conventions. Serve private JSON as `Cache-Control: no-store`. No feature records are transferred through the core sync API.

## Routes

| Method and path | Request | Success |
| --- | --- | --- |
| GET `/sync/checkpoint` | No body | `200` with the current workspace change cursor to capture before paging a snapshot |
| GET `/catalogs` | No body | `200` with contact types, locations, strength units and catalog revisions |
| PUT `/catalogs/{catalog}/{id}` | Admin-only. Label or location name and optional details, plus create/update concurrency headers | `201` created or `200` updated with the stable ID and new revision |
| GET `/contacts`, GET `/items` | Optional opaque pagination cursor and bounded limit | `200` with workspace records and nullable next cursor |
| GET `/contacts/{id}`, GET `/items/{id}` | No body | `200` with the shared workspace’s current record and revision |
| GET `/changes` | Workspace-scoped change cursor and bounded limit | `200` with ordered changes, including deletion tombstones, and the next cursor |
| DELETE `/contacts/{id}`, DELETE `/items/{id}` | Current revision and stable mutation ID | `200` with deletion acknowledgment. Deleted records are unavailable to both members. |
| PUT `/contacts/{id}` | Contact fields plus create/update concurrency headers | `201` created or `200` updated |
| PUT `/items/{id}` | Common item fields and any Medicine fields for the fixed item type, plus concurrency headers. Image state is read-only here. | `201` created or `200` updated |
| POST `/items/{id}/image/candidates` | Candidate UUID, filename, media type, byte length, expected image generation | `201` with candidate status and constrained presigned upload instructions |
| POST `/items/{id}/image/candidates/{candidateId}/confirm` | Acknowledge completion of the upload for server-side object verification | `202` with current pending/scan state, or `200` if already terminal |
| GET `/items/{id}/image/candidates/{candidateId}` | No body | `200` with state and safe failure reason if applicable |
| GET `/items/{id}/image` | Bounded byte range and version validator for subsequent chunks | `200` or `206` with uncached bytes from the current clean version, using bounded ranges, or `404` if absent or deleted. A changed validator returns `412` and invalid ranges return `416` |
| DELETE `/items/{id}/image` | Expected image generation | `200` with the cleared image state and new generation |

Managed `catalog` path values are `contact-types`, `locations`, and `strength-units`. Entity and media state details are defined in the [data model](../data-model.md). The web feature derives filter results and medication-list membership from its authenticated, locally loaded views. Combined Search does not need a separate server route.

## Reads, revisions, and replay

- A record returns its UUID, scalar `revision`, `lastChangeSequence`, applicable fields and timestamps, and for inventory its current image metadata and `imageGeneration`. Mutation inputs include editable fields only. Treat absent optional values in a full replacement as cleared. JSON schema validation rejects unknown fields and invalid type/field combinations.
- List responses are deterministic in UUID order, with scoped cursors and a bounded page size. The response shape is `{ items, nextCursor }`. Catalogs are returned as bounded paginated collections if growth requires it. Lookups return `404` for absent or deleted IDs. The service rejects nonmembers before lookup. The change cursor is scoped to the authenticated workspace. Capture a checkpoint before fetching the first snapshot page and replay changes after that checkpoint once the pages are loaded. A change page returns `{ changes, nextCursor, hasMore }` in sequence order. Each change identifies the record type, UUID and sequence and contains the latest live state or a tombstone. Resolve state with strongly consistent reads, including when the page spans a deletion. A deleted record never returns historical fields in a later feed request, conflict response, or mutation replay.
- Create with `If-None-Match: *`, update with the revision under `If-Match`, and send a stable `Idempotency-Key` on every mutation. Use separate image generation checks for image writes. A valid replay follows the prior outcome before stale-revision checks. If the target was later deleted, prior create/edit receipts return safe acknowledgment metadata and the current deleted state without returning deleted fields. A candidate response may refresh expired upload instructions only for the same authorized pending candidate and without creating a new side effect. Replay still requires a valid session and appropriate authorization.
- Conflict responses can contain current revision and workspace-authorized state for user resolution. Never include an inaccessible reference’s fields. Use typed validation errors for stale/invalid reference selections. The API releases kept for rollback must share a compatible persisted schema and recognize supported queued mutation shapes.

- A restored workspace increments the sync generation. An old cursor returns `409 reset_required`. Rebuild the local snapshot before applying further mutations, and retain eligible pending drafts for reconciliation. Mutations identify their workspace generation and fail before writing on mismatch. Candidate and scan state carry the generation as well.
- Image candidate operations require an active item at every stage, including replay. Image reads serve at most 4 MiB per response with a strong validator for the exact active version. The first request may fetch a small image whole. Subsequent range requests use `If-Match` with the same validator, return `Content-Range` on partial responses, and recheck membership and the live pointer on every request. Abort assembly and clear transient image URLs on deletion, version mismatch, or account change. Responses use `Cache-Control: no-store`.

## Errors and telemetry

| Status | Meaning |
| --- | --- |
| `400` | Invalid input, filter cursor, header or unsupported image metadata |
| `401` | Missing or invalid session |
| `403` | Invalid CSRF, missing workspace membership for a record operation, or insufficient catalog authority |
| `404` | Unavailable record, image or candidate |
| `409` | Stale revision/generation, changed replay payload, referenced contact type change, or invalidated managed reference |
| `410` or `503` | Withdrawn or unavailable feature release. The host refreshes the manifest and the client retains pending changes. Routes removed by rollback can also be reported as missing by the gateway. |
| `429` or other `5xx` | Retry transient failures with backoff and preserve the queue |

Return stable error codes, safe actionable messages, field identifiers when relevant, and correlation IDs. Authentication and image diagnostics must exclude tokens, credentials, presigned URLs, personal query values and raw record payloads.
