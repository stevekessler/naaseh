# Task data modernization

## Storage contract

- `memoDocument` is a validated version-1 document containing paragraphs or flat ordered/unordered lists and marked text runs. `memo` remains the deterministic plain-text projection used by search and compatible exports.
- Hidden memo ciphertext version 2 contains `{version: 2, text, document}`. Version-1 plaintext ciphertext remains readable and is upgraded only when edited.
- `dueDate` represents a calendar date. `dueAt` represents an instant. New writes identify the meaning with `dueKind` and do not persist a browser time zone. Legacy `dueAt` plus `dueTimeZone` remains readable and is never rounded during editing.

Task, revision, encrypted local record, and outbox changes are written atomically. Unknown document versions or invalid date combinations fail closed. Parent changes are authorized and checked for self-parenting, inactive parents, and cycles at the API boundary.

## Rollout and recovery

Deploy readers before writers. Keep version-1 hidden memo and legacy due-time fixtures in restore validation until all supported clients can read version 2. There is no bulk rewrite: documents and due fields are normalized on edit, preserving existing instants and off-grid minutes.

After restore, validate task schemas, ciphertext package versions, derived memo projection consistency, due-kind exclusivity, revision/outbox ordering, and unresolved conflict records before reopening writes. Never log memo documents, plaintext projections for hidden memos, combobox queries, ciphertext packages, task labels, or reference labels.

Google Tasks setup only moved to the profile surface. Existing import, merge, publish, date-boundary, DST, and legacy-zone behavior is protected by focused regression tests; no Google synchronization behavior changes unless those tests demonstrate a compatibility defect.
