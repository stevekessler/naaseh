# Contract: Organization Counts and Completion Reporting

## Authorization Rule

Counts and reports are derived only from records the caller may currently access. The service
selects the caller's exclusive PUBLIC, active GROUP, OWNER, and—when explicitly privileged—
ADMIN audiences before aggregation. Inaccessible Categories, Projects, names, dates, counts,
zero/nonzero contributions, and drill-down pointers are omitted rather than returned as zero.

Project or Category access never widens a Task/List lock, privacy, ownership, group, or
attachment boundary. Current group membership is evaluated on every online request. Offline
views use only the fully synchronized authorized cache and purge before advancing a revocation
cursor.

## Organization Tree

`GET /organization/tree` returns:

- `asOf` consistency time;
- each visible Category and its visible Projects;
- separate active to-do and active List counts at each Project;
- Category counts equal to the authorized sum of its returned Projects;
- Project `endDate`, effective availability, and deadline state;
- canonical filter parameters for count drill-down;
- separate Unassigned counts.

Counts exclude archived/deleting/deleted work. List Items do not count independently. One
shared inclusion predicate powers projection writes, API counts, local counts, and drill-down.
The caller can use `asOf` in validation to distinguish legitimate concurrent changes from a
mismatch.

### Deadline state

- no end date → `none`;
- end date after the viewer's current local calendar date → `upcoming`;
- equal date → `today`;
- before current local date with remaining work → `overdue`;
- archived Project retains its date for history but is not an active deadline.

Date-only strings are compared as calendar components in the selected/display time zone and
are never parsed as UTC midnight.

## Workload Projections

Every active Task/List contributes one unit to:

- its exclusive ordinary audience's Project/type counter and drill pointer;
- the same audience's Category/type roll-up and drill pointer;
- an ADMIN mirror when administrator oversight applies;
- or the audience's Unassigned/type counter when no Project exists.

Archive/delete decrements, restore increments, and reassignment transfers in the same durable
operation as the authoritative entity. Projection reconciliation recomputes expected values,
records drift without content, repairs idempotently, and alarms.

## Completion Report Request

`GET /reports/completions` requires:

- inclusive local `from`/`to` calendar dates within an implementation-bounded maximum range;
- `bucket=day|week|month`;
- valid IANA `timeZone`;
- `weekStartsOn=0..6`, default Monday (`1`);
- assignment scope: all, Unassigned, one Category roll-up, or one Project;
- optional `userId`; absent means caller, another user or aggregate requires explicit
  reporting authority.

Category and Project filters are mutually exclusive except that the API may require Category
as a validation parent for Project. Unknown/inaccessible filters use non-disclosing not-found.

## Completion Semantics

- Count one unreversed Task CompletionEvent per completion transition.
- Do not count List Item completion or List finish/archive.
- Reopen/restore reverses the currently counted event.
- Re-completion creates a new counted event at its new UTC time.
- Archive alone neither adds nor removes credit.
- Work/Project reassignment or Project movement does not rewrite historical attribution.
- Hard deletion removes the Task's event contribution and updates projections.
- Archived Category/Project labels remain usable for authorized historical filters.

## Bucketing

Events store UTC instants. The service and browser convert each instant into the requested IANA
zone at view time, then group by local calendar day, week boundary, or month. Daylight-saving
gaps/overlaps therefore affect the duration of a day but never duplicate or drop an event.

Response includes `asOf`, bucket type, time zone, total, ordered zero-filled buckets, historical
scope label/ID where filtered, and `currentLocationDiffers` when applicable. The sum of bucket
counts equals `total`.

## Offline Behavior

The browser stores encrypted CompletionEvents plus safe actor/time/scope indexes. It applies
the same counted-event and scope predicate locally and formats buckets with
`Intl.DateTimeFormat(...).formatToParts`. The dashboard identifies its last synchronized time
and pending local completion mutations. It does not present pending events as server-confirmed
aggregate data without a visible pending indicator.

## Privacy and Observability

Report logs include correlation ID, actor ID, requested bucket type, bounded range length,
outcome, event count processed, result bucket count, latency, and privileged-read flag. They
exclude time zone/filter values when user-identifying, Category/Project names, event/task
content, and bucket totals.

Metrics/alarms cover p95 latency, errors, authorization denials, projection drift, event-write
or reversal failures, invalid-zone spikes, and unusually large report requests.
