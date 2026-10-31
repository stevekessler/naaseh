# Native Apple security and synchronization

The iPhone, iPad, and Mac applications are clients of the existing Na’aseh production API. They do
not receive AWS credentials and do not bypass API authorization. TestFlight uses the production
origin with smoke-account gating.

## Trust and local-data boundary

- The session cookie, CSRF token, pre-authentication value, trusted-device value, device root key,
  and telemetry key use non-synchronizing, this-device-only Keychain items.
- The device root key requires user presence. Account and purpose keys are derived with HKDF-SHA256;
  temporary key buffers are explicitly zeroized.
- SwiftData stores only account-partitioned AES-256-GCM envelopes and non-sensitive coordination
  metadata. The account, record kind, record ID, and envelope version are authenticated as AAD.
- Protected content is excluded from logs, URLs, notifications by default, Siri responses,
  restoration state, Spotlight, feedback, and crash diagnostics.
- A successful sign-out ends system surfaces and removes affected keys. If remote logout fails,
  the app informs the user and retains the session and local data.
- An explicit session-expired, unauthorized-session, or account-disabled response withdraws access
  and removes that account's local records, pending work, conflicts, scene state, alerts, and keys.
  Other accounts' records are preserved. Group revocation removes only the affected group data.
- Debug and TestFlight apps intentionally use the production service during the current two-user
  deployment. The Debug xcconfig origin is not an isolation boundary in the installed app.

## Authentication

A successfully validated session grants **seven days (168 hours)** of local access. The last
validation time and session are stored in this-device-only Keychain storage so a cold offline
launch can reopen the encrypted cache. Only successful online validation renews this window;
offline reads, edits, relaunches, and failed validation attempts do not renew it. Local reads and
writes check the deadline, and the ready workspace is withdrawn when it expires. The expiry screen
asks the user to connect and validate again, while retaining encrypted data and unsynced work.
An explicit server rejection instead deletes that session's local data immediately, even inside
the seven-day window. A failed explicit logout is reported without local cleanup, as described above.

The native flow uses the existing login, pre-authentication, TFA enrollment/challenge, password,
session, remembered-device, and logout routes. The transport rejects redirects, uses an ephemeral
URL session, and locks requests to `https://gsd.thepandas.link`. Mutations include the existing
Origin and CSRF controls. Local biometric unlock never creates or extends a server session; it only
releases this-device-only material, after which the server session is validated.

## Atomic local writes and sync

An ordinary local mutation encrypts the record and writes its outbox operation in one SwiftData
transaction. A server page applies records and its cursor in one transaction. Therefore a crash can
produce neither an unqueued local record nor an advanced cursor without its records. Outbox batches
are deterministic, capped at 50, and use stable mutation IDs. Applied and duplicate receipts remove
the operation; conflicts remain encrypted for explicit review; rejections remain visible with a safe
reason and correlation ID. Retry uses bounded exponential backoff.

The native sync adapter recognizes the API's `accessControl` group tombstones. It deletes the
group's cached lists and dependent records, queued mutations, and conflict comparisons in the same
transaction as the cursor update. Encrypted local revocation metadata prevents stale edits or later
pages from restoring the content. A fresh authorized bootstrap can restore access after a group
rejoin. Refresh pulls authorization changes before pushing local mutations.

Bootstrap and foreground sync are optimizations, not correctness dependencies. Cached authorized
records remain usable offline. Reconnect, manual refresh, and foregrounding all use the same push,
pull, receipt, conflict, and cursor machinery. Revoked audiences are purged before their content can
be presented again.

## Compatibility and diagnostics

The application checks platform build and sync-contract compatibility before bootstrap and after a
long suspension. Upgrade-required and expired builds preserve encrypted pending work but block new
mutations. Native diagnostics use a closed content-free schema, a separately encrypted 100-event
ring, and authenticated best-effort uploads. Telemetry failure never changes a user operation.

The compatibility and telemetry routes reuse the existing sync Lambda and CloudWatch log group.
They add no Lambda, table, queue, topic, log group, or other managed AWS service.
