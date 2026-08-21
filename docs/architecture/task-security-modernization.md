# Task security modernization architecture

Feature 009 extends the existing serverless application and encrypted offline model; it does not introduce a second data plane or always-on service.

## Security and sessions

Primary authentication still produces the existing opaque application session. TOTP-enabled users first receive a five-minute, single-purpose login transaction. Administrators must enroll in and pass TOTP before protected access. Factor seeds are KMS ciphertext bound to the user encryption context; recovery codes are stored as one-time digests. Password reset requires the account PIN and increments the session epoch. Lost administrator factors are cleared only by the separately authorized recovery Lambda, which revokes sessions and forces re-enrollment without decrypting the factor.

The browser validates a restored session view before exposing authorized cached data. Revoked or expired sessions trigger one atomic purge of protected IndexedDB stores and dependent outbox state. An unavailable validation service leaves data locked and offers retry; it never treats network failure as authorization.

## Task and timer data

Task edits use one modal and one versioned task patch. Memo formatting is serialized as a versioned allowlisted document plus its plain-text projection; hidden memos encrypt both. Due dates distinguish calendar-only values from timed UTC instants. Explicit post-it color is an optional semantic enum. All fields participate in the existing encrypted current-record, revision, outbox, conflict, backup, and restore paths.

Each account has at most one timer aggregate, keyed by owner. Timer commands are semantic and idempotent, and sync v5 carries current state, receipts, and visible conflicts. Displayed time is derived from persisted UTC anchors and current time, so passive ticking and repeats make no AWS requests. Completion feedback is deduplicated per device/run/interval and does not create a task completion event or complete the task. Task-access revocation purges the dependent local timer before advancing the sync cursor.

## Interaction boundaries

- Parent tasks and groups use one accessible, ID-valued combobox over authorized cached choices.
- The memo editor registers only bold, italic, strikethrough, paragraph, ordered-list, and unordered-list nodes.
- Personal stack drag translates a valid drop into the existing private rank mutation; Move up/down/to-position remain canonical fallbacks.
- Profile contains user settings. Admin contains system controls. Global Items contains reusable list-item administration.
- Task, memo, timer, rank, amount, and color changes remain offline-capable. Security, administration, Google setup, and server exports are online-only.

## Reporting and infrastructure

Completed-task export reuses the existing Step Functions/S3/KMS workflow. It snapshots authorized completion scope, emits the fixed 56-column v1 CSV, neutralizes spreadsheet formulas, validates header/row count/checksum, and exposes a private result only after success. Hidden plaintext, ciphertext packages, keys, object paths, signed URLs, and revision history are excluded.

AWS remains API Gateway, bounded Lambda, on-demand DynamoDB, KMS, S3, Step Functions, CloudFront/WAF, CloudWatch, PITR, and AWS Backup. New cost is request/KMS/export/CloudTrail/log volume; there is no scheduler, WebSocket, database server, or passive timer traffic.

## Support and validation

Use `npm run test:e2e:quick` for the required representative browser gate and `npm run test:e2e` or `npm run validate:pre-aws:browsers` for the exhaustive Chromium/WebKit desktop/iPhone/iPad matrix. Recovery and deployment remain governed by the operator runbooks in `docs/operations/`. Feature-specific evidence is under `docs/testing/`, `docs/security/`, and `docs/reviews/`.
