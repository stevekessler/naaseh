# Contract: Encrypted Attachments

## Policy

- Parent types: Task/Subtask or ListItem.
- Maximum 10 live attachments per parent.
- Maximum 25 MiB per file; empty files are rejected.
- Initial allowlist: JPEG, PNG, WebP, PDF, UTF-8 plain text/CSV/JSON, DOCX, XLSX, PPTX.
- Executables, scripts, archives, encrypted/password-protected containers, macro-enabled Office
  documents, MIME/extension/signature mismatches, and non-allowlisted files are rejected.
- Preview is out of scope; available files download with a sanitized original filename.
- Files are private, TLS-only, SSE-KMS encrypted, versioned, backed up, and malware-gated.

## Initiate

`POST /api/v1/attachments/uploads` uses session, CSRF, mutation ID, and parent metadata.
The server loads the canonical parent and requires edit authority. A replay returns the same
pending attachment/session if input matches.

Success returns a five-minute SigV4 `PUT` capability for one opaque
`attachments/{blobId}` key. The request signs exact content type, size policy, SHA-256
checksum, and required SSE-KMS headers. It is `Cache-Control: no-store`.

The browser must not upload after expiry and must never log the URL or headers.

## Complete and Scan

After upload, completion supplies the observed S3 version ID. The server re-authorizes the
parent and verifies exact key/version, length, content type, checksum, encryption, and required
metadata before changing `pending_upload → scanning`.

GuardDuty Malware Protection scans the attachment prefix. The idempotent result handler uses
key plus version and maps:

| GuardDuty result | Domain outcome |
|---|---|
| NO_THREATS_FOUND | available |
| THREATS_FOUND | rejected and inaccessible |
| UNSUPPORTED | rejected with safe unsupported code |
| ACCESS_DENIED | scan_failed plus security alarm |
| FAILED / missing result | scan_failed plus retry/operations path |

Application download roles also require the exact clean scan-result tag. Metadata status alone
is not sufficient. Out-of-order or duplicate events cannot make a newer/unmatched version
available.

## Download

`POST /api/v1/attachments/{id}/download` loads Attachment, exact parent, actor role/group,
BlobReference, and clean blob status on every request. Unauthorized, deleted, rejected, or
unknown attachments return non-disclosing not-found; scanning returns a safe unavailable state.

An authorized result is a 60-second version-specific download capability with sanitized
`Content-Disposition: attachment` and no-store behavior. It is never synchronized, indexed,
placed in CSV, persisted, or logged. Administrator downloads set the privileged-read audit flag.

A capability may remain usable until its short expiry after later revocation; this bounded
window is accepted instead of proxying bytes through Lambda.

## Delete and Reconcile

Delete marks Attachment deleted and releases BlobReference transactionally. When the last
reference disappears, the blob enters deleting and receives an S3 delete marker. Noncurrent
versions remain through the 35-day recovery boundary and backup policy.

Scheduled reconciliation is idempotent:

- pending upload older than one hour → expire and remove object versions;
- scanning older than 24 hours → scan_failed, retry/alert;
- zero-reference clean blob → delete marker;
- metadata missing exact object version → unavailable and alarm;
- unexpected attachment object → quarantine then delete after grace period;
- threat-positive blob → inaccessible immediately, evidence event, delete after policy.

Lifecycle aborts incomplete multipart work and expires temporary/rejected objects according to
the documented recovery/security policy.

## Copy

Only a clean available attachment on an authorized source list can be copied. The CopyJob
creates a new Attachment ID and BlobReference to the exact immutable clean blob. It does not
globally deduplicate unrelated uploads or expose blob identity. Source deletion cannot remove
the bytes while copy references remain.

## Offline and Cache

Only encrypted attachment metadata is stored offline. Selection/upload is deferred while
offline and requires reselection after reconnect. Download requires connectivity. The service
worker never caches attachment responses. Logout, group revocation, or lock tombstones purge
metadata and in-memory object URLs before cursor commit.

## Required Audit and Metrics

Audit initiate, complete, scan result, download authorization, administrator download, delete,
copy reference, reconciliation, and denial using safe IDs/outcomes. Never log filename,
content type supplied by user, checksum, object key/version, capability, tags, or bytes.

Metrics/alarms cover threat findings, scan failures/latency, stale sessions, unauthorized
attempts, missing objects, orphan objects, reconciliation failure, KMS/S3 denial, upload bytes,
download bytes, and GuardDuty scanned bytes/object counts.

