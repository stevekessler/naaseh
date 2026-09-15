# App updates and pending offline changes

The service worker installs and activates the newest precached application shell without waiting
for synchronization. Activation replaces the shell cache, not IndexedDB. Saved tasks, encrypted
mutations, and local encryption keys remain in the same database; this release changes no database
schema. An offline or rejected mutation must not prevent loading a newer client that can repair sync.

Current clients announce an activated replacement and reload only when the user chooses Update.
Before reloading, the app waits for preceding local database writes to finish. Users should save
any unsubmitted form edits first. The Update action does not sign out, clear site data, or delete
pending mutations. Normal account revocation protections still apply independently.

Legacy clients with a waiting worker can receive the new worker without their broken Update
handler. A normal browser refresh after deployment loads the activated shell. Legacy update
listeners may also reload when the replacement takes control. Do not use sign-out or clearing
website data to repair an update: these can remove pending changes.

Release verification includes a real generated worker replacing a cached legacy shell with a
blocked Update button and an unavailable API. The test checks that the queued mutation, encrypted
task, and existing key record survive the upgrade in Chromium, WebKit, iPhone, and iPad projects.

## Task cache recovery and rejected edits

The browser reads the persisted device key for every encryption operation. First-time key
creation elects a single key in an IndexedDB write transaction, including across tabs. A tab must
not keep using a cached key after another tab resets account storage.

An AES-GCM `OperationError` on a task record no longer aborts the whole task screen. Readable tasks
remain available and unreadable records are counted in the sync warning. Online recovery fetches
the authorized task bootstrap. Before replacing an unreadable record, it preserves the exact
original encrypted record in `settings` under `task-recovery:<taskId>:<iv>`, atomically with the
replacement. A task with a pending local mutation is not replaced. Recovery does not recreate a
lost key or promise to decrypt unsynced ciphertext; unresolved records remain stored with a warning.

Rejected mutations remain in the outbox. They stop later mutations for the same entity, while
independent queues and task downloads continue. Incoming upserts cannot overwrite an entity with
pending edits. A durable `pending-sync-replay-cursor` allows normal feed pagination to proceed and
replays skipped changes once the outbox drains. Authorization revocations and server tombstones
retain their existing behavior. Server-provided safe rejection details and a correlation reference
are shown when available.

These settings use the existing database schema. Account revocation still clears all protected
stores, including the recovery copies. Do not sign out or reset storage as a recovery shortcut.
The full browser suite exercises empty and unreadable caches with a rejected outbox, exact backup
preservation, independent mutation progress, cursor replay, and device-key replacement.
