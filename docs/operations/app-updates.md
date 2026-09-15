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
