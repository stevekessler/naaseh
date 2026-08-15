# Completed Task CSV Contract

**Schema identifier**: `naaseh.completed-tasks/v1`

The server generates a snapshot-consistent, authorized UTF-8 CSV after a completion-export job reaches validated `completed` state. This contract is independent of presentation labels so consumers can rely on stable machine headers.

## Encoding rules

- UTF-8, no locale-dependent number/date formatting, RFC 4180 field quoting, and CRLF row endings.
- The first row is exactly the ordered header below. Every subsequent row has the same number of fields.
- UTC instants use RFC 3339 with milliseconds and `Z`; date-only values use `YYYY-MM-DD`; booleans are `true`/`false`; safe integers are base-10; missing optionals are empty cells.
- Repeated/structured values use deterministic compact JSON with lexicographically sorted object keys and documented array ordering.
- Before CSV quoting, prefix an apostrophe when the first non-whitespace/control character of a textual cell is `=`, `+`, `-`, or `@`. The apostrophe is part of the exported safety representation.
- Newlines, commas, quotes, Unicode, and right-to-left text are preserved through correct quoting. No spreadsheet formula is executable.
- One row represents one current completed task or subtask at `asOf`; `record_kind` and relationship IDs preserve hierarchy.

## Stable v1 header order

| # | Header | Meaning |
|---:|---|---|
| 1 | `schema_version` | Always `naaseh.completed-tasks/v1` |
| 2 | `export_as_of` | Job snapshot instant |
| 3 | `record_kind` | `task` or `subtask` |
| 4 | `task_id` | Stable task ID |
| 5 | `parent_task_id` | Direct parent ID, empty at root |
| 6 | `root_task_id` | Root ID for hierarchy grouping |
| 7 | `label` | Task label/title |
| 8 | `link` | User-supplied task link, formula-neutralized |
| 9 | `memo_text` | Authorized non-hidden plain projection |
| 10 | `memo_document_json` | Authorized non-hidden versioned document JSON |
| 11 | `memo_protected` | Whether memo is hidden/protected |
| 12 | `created_at` | Creation instant |
| 13 | `updated_at` | Current update instant |
| 14 | `due_kind` | empty, `date`, or `timed` |
| 15 | `due_date` | Date-only value, if applicable |
| 16 | `due_at` | Timed absolute instant, if applicable |
| 17 | `due_time_precision` | `date`, `five_minute`, or `legacy_off_grid` |
| 18 | `completed_at` | Effective completion instant |
| 19 | `completion_event_id` | Current completion event ID |
| 20 | `completed_by_user_id` | Authorized stable actor ID |
| 21 | `completion_reversed_at` | Reversal instant if represented in scoped history |
| 22 | `archived_at` | Archive instant |
| 23 | `archive_reason` | Safe lifecycle reason |
| 24 | `status` | Current task status |
| 25 | `lifecycle` | Current lifecycle state |
| 26 | `completion_state` | Current completion state |
| 27 | `priority` | `low`, `medium`, `high`, or `critical` |
| 28 | `owner_user_id` | Stable owner ID |
| 29 | `assignee_user_id` | Stable assignee ID |
| 30 | `category_id` | Category ID |
| 31 | `category_label` | Authorized category display label |
| 32 | `project_id` | Project ID |
| 33 | `project_label` | Authorized project display label |
| 34 | `group_id` | Group ID |
| 35 | `group_label` | Authorized group display label |
| 36 | `visibility` | Existing task visibility enum |
| 37 | `shared_with_json` | Authorized stable IDs/permission summaries, sorted by ID |
| 38 | `lock_state` | Existing lock state |
| 39 | `locked_by_user_id` | Authorized stable actor ID |
| 40 | `recurrence_json` | Current recurrence rule/state, deterministic JSON |
| 41 | `reminders_json` | Authorized reminder metadata, ordered by trigger then ID |
| 42 | `list_id` | Associated list ID, if applicable |
| 43 | `list_item_id` | Associated list-item ID, if applicable |
| 44 | `list_amount_minor` | Signed minor-unit amount |
| 45 | `post_it_color` | Explicit semantic override, empty when inherited |
| 46 | `post_it_effective_color` | Resolved semantic/fallback color at export snapshot |
| 47 | `google_task_id` | Authorized external task identifier |
| 48 | `google_task_list_id` | Authorized external list identifier |
| 49 | `google_sync_state` | Safe current link/sync state |
| 50 | `google_last_synced_at` | Last successful sync instant |
| 51 | `attachments_json` | Safe metadata only, ordered by attachment ID |
| 52 | `task_version` | Current optimistic version |
| 53 | `completion_version` | Current completion projection/event version |
| 54 | `sync_state` | Safe canonical sync/conflict summary |
| 55 | `viewer_overall_rank` | Requester's personal overall rank, if present |
| 56 | `viewer_project_rank` | Requester's personal project rank, if present |

## Field authorization and exclusions

- Every task, relationship label, participant summary, reminder, Google identifier, attachment metadata item, and rank is independently authorized at export time. A missing authorization makes that field empty or rejects the row/job according to the existing no-partial-authorization policy; it never leaks an existence hint.
- `memo_text` and `memo_document_json` are empty whenever `memo_protected=true` unless a separately defined export authorization explicitly permits plaintext. This feature defines no such bypass.
- `attachments_json` may contain stable attachment ID, original display name, safe media type, byte size, created timestamp, and scan/availability state. It excludes bytes, bucket/object keys, checksums used as credentials, encryption material, and signed/private URLs.
- `shared_with_json` excludes invitation tokens, email delivery data, and credentials.
- Excluded globally: password/PIN verifiers, factor seed/ciphertext, recovery-code digests/plaintext, sessions/login transactions, device credentials, raw encryption keys/packages, hidden memo ciphertext/plaintext, revision history, deleted records, raw sync mutations, attachment bytes, private object paths, and reusable access links.

## Integrity and completion

An export job is downloadable only after validation confirms:

1. exact header order and schema identifier;
2. row count equals the authorized snapshot result count;
3. every row has 56 fields and parses under this schema;
4. formula neutralization and RFC 4180 escaping pass adversarial fixtures;
5. generated object checksum matches the recorded checksum;
6. no protected-field markers/cipher packages appear;
7. job owner/scope authorization remains valid when requesting the download action.

Interrupted or failed generation remains `failed`/retryable and never exposes the partial object as a successful result. An idempotency-key replay returns the same job only when the normalized request is identical.

## Compatibility

- Header changes require a new schema identifier/version; v1 order never changes in place.
- `extra_low` is invalid. The removal guard must prove no current or restored record contains it; export generation fails safely rather than normalizing an unexpected value.
- Existing `dueAt` values remain the same instant. `due_time_precision=legacy_off_grid` records that a timed value was not explicitly chosen on the new five-minute grid; it is not rounded.
- Repeated JSON schemas must be versioned internally if their shape changes incompatibly.
