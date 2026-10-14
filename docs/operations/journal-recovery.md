# Journal and List Recovery Operations

## 2026-10-14 missing-list incident

The owner reported that lists were no longer visible. Production point-in-time recovery was
performed into isolated DynamoDB tables and never over the live table.

Recovered content:

- `First Test List`, with `Test List Item`.
- `Articles to Read/Share`, with three URL items.

New visible copies were created through the application. The original `Articles to Read/Share`
record and its three items were then found intact in production but hidden from the browser.
Both the original and visible copy are deliberately retained. Do not delete either copy until
Journal/list synchronization and display behavior are verified and the owner explicitly chooses
which duplicate to remove.

The isolated recovery tables were verified and deleted after extraction to stop ongoing cost.
Production point-in-time recovery remains enabled.

## Journal synchronization finding

The Journal browser drained its encrypted outbox but did not invoke the available Journal pull
or bootstrap path. The existing pull helper also fetched only one page, overwrote pending rows,
and omitted the row-level opaque date token used by the local unique owner/date index. This can
make intact server data absent from a browser without the server data being deleted.

Before adding recycle-bin behavior, repair and test:

1. initial and reconnect Journal pull;
2. complete feed pagination;
3. durable cursor persistence;
4. pending-row conflict preservation;
5. opaque date-token persistence; and
6. actionable Journal conflict visibility.

## AWS access

Use AWS IAM Identity Center profile `naaseh-admin` for production recovery investigation. It
assumes role `NaasehBootstrapAdmin` in account `093733938983`. Prefer read-only queries and
isolated point-in-time recovery. Never restore over the production table. Delete temporary
recovery tables only after extraction and verification.
