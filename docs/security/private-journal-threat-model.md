# Private Journal Threat Model

## Protected material

- Journal plaintext, local dates, structured answers, rich-text notes, task associations, dashboard derivatives, PINs, JMK material, wraps, recovery reasons, public keys, ciphertext, and opaque correlation artifacts are sensitive.
- Durable browser, API, DynamoDB, backup, cache, telemetry, export, report, notification, and support paths must contain ciphertext or content-free state only.

## Trust boundaries

- The unlocked owner browser is the ordinary plaintext boundary.
- The isolated recovery Lambda may hold JMK bytes transiently only for one owner-approved rewrap. Recovery administrators must never receive plaintext or JMK material.
- Other users, ordinary administrators, reports, exports, notifications, service workers, and shared caches have no Journal content access.

## Required negative checks

- Cross-user and guessed identifiers; admin/recovery-role misuse; arbitrary or replayed recovery wraps; stale sessions/TFA; altered audit chains; offline owner switch; restored stale data; conflict/replay; unsafe rich text; task-reference authorization; logs/errors/traces; service-worker and HTTP caches.

## Completion gate

- Validate key lifetime, authorization, encrypted persistence, retry/conflict recovery, backup restoration, content-free observability, browser teardown, and no-delete behavior before release.

## Owner guidance

- The Journal PIN is separate from the account password. It wraps the browser-generated Journal Master Key (JMK); it is never stored or transmitted as plaintext.
- Hiding the tab, signing out, losing the authenticated session, or leaving the Journal unlocked for five minutes clears the in-memory JMK and decrypted views.
- Pending offline entries remain encrypted on the device. A pending/conflict message means the owner should keep the device data until synchronization or deliberate conflict resolution succeeds.
- Losing the PIN requires the bounded recovery process. Support and ordinary administrators cannot read entries or issue a replacement PIN.

## Cost boundary

- Journal storage uses the existing on-demand DynamoDB data plane, backup plan, log groups, and metric-filter approach. There is no search cluster, server-side aggregate service, per-user KMS key, or new always-on compute.
- The isolated recovery function is reserved at concurrency one; KMS recovery operations occur only for approved recovery requests.
