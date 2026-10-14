# Private Journal

Journal entries are encrypted in the browser. Unlocking the Journal is required before entry
dates, answers, notes, dashboards, or recycle-bin contents can be displayed.

## Recycle bin

Open an existing entry and choose **Move to recycle bin**. Confirming the action:

- removes the entry from Entries, Dashboard, summaries, and streak calculations;
- keeps the original entry identifier, date, answers, notes, and task reflection;
- keeps the date reserved so a second entry cannot take it; and
- saves the encrypted lifecycle change locally when offline and synchronizes it later.

Open **Recycle bin** from Journal navigation to see entries ordered by the time they were moved.
Choose **Restore** to return an entry to its original date and active Journal views.

If another device changed the same encrypted entry, Sync status shows a Journal conflict. The
review screen never displays Journal content. Choose the encrypted local version to retry the
saved change against the latest version, or choose the server version to discard only the local
pending change.

Permanent deletion is intentionally not exposed until the checkpointed purge and backup-ledger
remediation path is complete. Recycled entries remain recoverable indefinitely in this release.

## Recovery

Browser sync pulls every Journal feed page and saves a durable cursor. A pull never overwrites a
pending local mutation; it creates an actionable encrypted conflict instead. One unreadable entry
does not hide other healthy entries. Operational recovery details are in
`docs/operations/journal-recovery.md`.
