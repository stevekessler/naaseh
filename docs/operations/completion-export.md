# Completion export operations

Completion CSV uses the existing on-demand DynamoDB, Step Functions, private versioned S3, and KMS
export workflow. A request fixes its normalized filters, current browser IANA zone, authorization
scope, access groups, `asOf` snapshot, schema version, and request fingerprint. Reusing an
idempotency key with different normalized input fails with a conflict; a matching retry returns the
same job and Step Functions execution.

The transformer reauthorizes each current completed task against the completion event and stored
request scope, excludes revoked/private rows, applies browser-local boundaries, emits the exact
56-column v1 header, and rejects removed priority or invalid task records. It uploads only after CSV
field/row/schema validation. S3 stores a SHA-256 checksum and manifest metadata; status/download
requires matching object length, row count, and checksum metadata. Failed or interrupted jobs have no
download action. Results expire automatically within 24 hours and all object versions are deleted.

Monitor `CompletionExports`, `CompletionExportRows`, `CompletionExportDuration`,
`CompletionExportFailures`, and `CompletionExportIntegrityFailures`. The latter two alarm on the
first event. Logs contain phase, outcome, bounded latency/row buckets, correlation data, and scope;
they exclude task IDs, labels, memo content, CSV rows, object paths, and signed URLs.

Recovery validation requires export owner, request fingerprint, v1 schema metadata, and a manifest
for ready jobs. It rejects `extra_low`, row payloads, and memo fields. After an integrity failure,
allow the job to remain failed, inspect CloudWatch/S3/KMS service health without downloading the
object, and retry with a new idempotency key after the cause is corrected. Cost is per snapshot,
workflow transition, Lambda duration, KMS request, and short-lived S3 bytes; there is no always-on
compute.
