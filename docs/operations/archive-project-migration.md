# Archive and Project Migration

The rollout uses a checkpointed, idempotent Category-to-Project migration. Enable compatibility
reads first, then dual writes, run the migration Lambda, reconcile, switch reads to Project, and
disable legacy writes only after two clean reconciliations. Each legacy Category receives one
deterministic `General` Project; repeated runs reuse it. Assigned Tasks are backfilled to General,
Lists remain Unassigned, completed Tasks receive at most one synthesized counted event, and
manually archived Tasks receive none.

Track checkpoint cursor, scanned/updated counts, synthesized-event count, collisions, failures,
and reconciliation drift. Metrics and logs contain identifiers and counts, never task text or
organization names. To roll back before the final switch, stop the migration, retain dual writes,
restore legacy reads, and reconcile both representations. Do not delete Projects or completion
events during rollback. Resume from the durable checkpoint after correcting the cause. A restored
backup must run the same migration and reconciliation before serving traffic.
