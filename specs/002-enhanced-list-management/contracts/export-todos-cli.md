# Contract: Export To-do Items CLI

## Trust Boundary

`scripts/export_todos.py` is a thin IAM-authorized client of a dedicated export coordinator.
It never queries DynamoDB, reads staging S3, or receives durable S3 credentials. The caller's
AWS principal may invoke only the coordinator. Workflow roles alone may start point-in-time
export, read isolated staging, transform task rows, and publish the short-lived result.

The DynamoDB table export temporarily includes unrelated protected records. Raw staging uses a
dedicated KMS key, Block Public Access, workflow-only IAM, CloudTrail, no human read grant,
prompt workflow deletion, and a defensive lifecycle under 24 hours.

## Invocation

```text
python3 scripts/export_todos.py \
  --output PATH \
  [--profile AWS_PROFILE] \
  [--region us-west-2] \
  [--function-name NAME] \
  [--overwrite]
```

- `--output` is required; CSV is never written to stdout.
- Existing destination is refused unless `--overwrite`.
- Region defaults to and is restricted to `us-west-2`.
- Function defaults from `NAASEH_EXPORT_TODOS_FUNCTION`.
- Credentials use the normal Boto3 chain/profile; no app password, session, or token argument.
- Progress goes to stderr without content, URLs, object keys, or field values.

## Coordinator Protocol

Start:

```json
{
  "version": "naaseh.export-todos/v1",
  "action": "start",
  "idempotencyToken": "uuid"
}
```

Status:

```json
{
  "version": "naaseh.export-todos/v1",
  "action": "status",
  "exportId": "01..."
}
```

Acknowledge:

```json
{
  "version": "naaseh.export-todos/v1",
  "action": "acknowledge",
  "exportId": "01..."
}
```

Stable statuses are `pending`, `exporting`, `transforming`, `ready`, `failed`,
`expired`, and `acknowledged`. Repeated start with the same token returns the same job.

Ready result:

```json
{
  "version": "naaseh.export-todos-result/v1",
  "status": "ready",
  "exportId": "01...",
  "capturedAt": "2026-07-23T12:00:00Z",
  "rowCount": 50000,
  "byteLength": 12345678,
  "sha256": "hex",
  "downloadUrl": "short-lived HTTPS capability",
  "expiresAt": "2026-07-23T12:05:00Z"
}
```

The URL is held only in memory and never printed or logged. Acknowledge requests best-effort
early deletion after the local file has been verified and finalized.

## CSV Format

- RFC 4180 quoting and CRLF records.
- UTF-8 without BOM.
- Fixed header order below.
- One row per current task or subtask, sorted by `id`.
- Empty string represents an absent optional scalar.
- Booleans are lowercase `true`/`false`.
- Timestamps are ISO 8601 UTC.
- `record_type` is `task` or `subtask`.
- JSON cells are compact, deterministic, and double-quote escaped by CSV rules.
- Hidden memo plaintext is never decrypted. `memo` is empty for hidden memos and the persisted
  encrypted package appears in `encrypted_memo`.
- Attachments contain IDs and safe exported metadata only—never bytes, blob IDs, S3 keys,
  object versions, checksums, scan tags, URLs, or credentials.

Header order:

```text
schema_version
record_type
id
parent_id
owner_id
label
link
memo
memo_hidden
encrypted_memo
created_at
updated_at
due_at
due_time_zone
assignee_id
category_id
group_id
status
completed_at
completed_by
visibility
locked
version
sync_metadata_json
attachments_json
```

`locked` is the CSV-facing projection of `visibility=private`. `attachments_json` is a
deterministically sorted array:

```json
[
  {
    "id": "01...",
    "originalFilename": "receipt.pdf",
    "mediaType": "application/pdf",
    "sizeBytes": 1234,
    "uploaderId": "01...",
    "status": "available",
    "createdAt": "2026-07-23T12:00:00Z"
  }
]
```

## Local Atomic Output

The command:

1. validates destination and authority;
2. starts/resumes one export and polls with bounded jitter;
3. creates a sibling temporary file with mode 0600;
4. streams the download while computing SHA-256 and byte length;
5. validates header, CSV parse, row count, and manifest values;
6. flushes and fsyncs file and parent directory;
7. atomically renames to destination;
8. acknowledges remote cleanup.

Failure never leaves the destination looking successful. A temporary file is removed or left
with an unmistakable non-final recovery suffix and mode 0600. `--overwrite` replaces only
after full verification.

## Exit Codes

| Exit | Meaning |
|---:|---|
| 0 | Verified export finalized |
| 2 | Arguments, Region, output conflict, or local filesystem validation failed |
| 3 | AWS credentials absent or coordinator invocation denied |
| 4 | Backend response, manifest, checksum, size, header, row count, or CSV contract invalid |
| 5 | Service, workflow, timeout, interrupted download, or unknown outcome |

Errors include a safe correlation/export ID when available and never expose content, capability,
staging location, raw AWS response, or stack trace by default.

## Required Tests

- Parsing, defaults, Region restriction, existing-output refusal, overwrite, and mode 0600.
- Start/status/ack idempotency, timeout/retry, expired capability, and interrupted download.
- Fixed headers and all persisted task field mappings.
- Commas, quotes, CRLF, embedded newlines, Unicode, empty fields, hidden memos, and multiple
  attachments.
- Snapshot cutoff under concurrent task mutation.
- Length/hash/row/header mismatch prevents final rename.
- Unauthorized IAM creates no export/result.
- Raw staging/result encryption, public blocking, lifecycle, deletion, and audit.
- Secrets, content, URLs, keys, and CSV values absent from argv/stdout/stderr/CloudWatch.

