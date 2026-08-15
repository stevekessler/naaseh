# Authorization model

Every active user may see every non-private task. Group membership supports collaboration but does not narrow public visibility. Private tasks, their revisions, search terms, counts, reminders, feed changes, and cached copies are owner-only. APIs query the public or owner index directly and return not-found for unauthorized object IDs. A visibility change emits an atomic tombstone to the old audience and an upsert to the new audience. Offline clients purge revoked records on their next successful synchronization; until then, a previously authorized device may retain encrypted cached data.

Groups are discoverable and explicitly self-joined. An active join is idempotent, while a
revoked member cannot self-reactivate in v1. The owner role cannot be transferred or revoked;
owners may change active non-owner memberships between manager and member. Group PINs are
write-only request fields and neither PINs nor their verifiers appear in API responses or logs.

## Lists, directory items, and attachments

Named lists are global by default. Assigning a list to a group narrows reads to its owner, active
group members, and administrators. Locking a list takes precedence over its saved group and makes
it owner-only; unlocking restores the saved group selection. Only the owner may mutate or copy a
list. Directory entries are shared among all active users and may be edited by any active user.
Linked list items retain a snapshot for offline use, while an explicit override takes precedence
until the owner resets it to the current global value.

Attachment authorization always begins with the current parent task or list item. Metadata follows
the parent's feeds, but object bytes and signed capabilities never enter IndexedDB or the Cache API.
Uploads use checksum-bound, five-minute S3 grants with KMS encryption; downloads require a fresh
parent authorization and a clean GuardDuty result. Guessed attachment IDs receive the same
not-found response as missing IDs.

## Administrator rights

The application `admin` role is limited to user and category administration. Administrators may
add and list allowlisted user profiles, disable/reactivate accounts, and create, update, or
archive categories. All authenticated users may read categories so task forms remain usable.
User/category mutations require a live admin session, same-origin and CSRF checks, and immutable
content-free audit events. Self-disablement and removal of the last active administrator fail.
The `/admin` presentation route is also role-gated for clarity, but every administrator endpoint
independently enforces the role. User-list pages are capped at 100 stable username/ID rows and expose
only safe TFA state and bounded active group IDs; credentials and recovery material never appear.

Personal reminders, sounds, Google setup, password reset, and TFA controls live under `/profile` and
remain available to ordinary users. A submitted Task or List group ID must be one of the actor's
active authorized memberships; the API rejects stale, revoked, or arbitrary IDs even if a client is
modified to bypass the combobox.

Administrators may read all task, list, list-item, directory, and attachment metadata, including
locked and group-restricted content. These privileged reads are audited. Administrator access is
read-only: it never grants mutation, copy ownership, attachment upload/delete, or access to another
user's hidden-memo plaintext. It also never grants recovery DEKs, password/PIN verifiers, cookies,
or secret material. Provisioning results and administrative user views remain content-free.

## Export boundary

The to-do CSV exporter is an IAM-only operator command, not an application-admin endpoint. Its
coordinator captures one DynamoDB point-in-time snapshot, stages it in an isolated KMS-encrypted
bucket, and returns a short-lived result capability only to the initiating principal. The command
verifies row count, byte length, and SHA-256 before an atomic local rename and then acknowledges
server-side cleanup. Hidden memo plaintext is excluded; encrypted memo material and safe attachment
metadata are exported as explicit fields.
