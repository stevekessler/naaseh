# Finance operations and recovery

This guide supplements the detailed [operations index](operations/README.md) for the Finance and
Budget Management feature. Treat account names, balances, transaction data, CSV contents, SimpleFIN
setup tokens, and SimpleFIN Access URLs as protected financial data. Do not put them in logs,
metrics, alarms, screenshots, tickets, or test fixtures.

## Normal operation

- Finance reuses the existing HTTP API, on-demand DynamoDB table, KMS runtime-secrets key, backup
  plan, deletion workflow, alert topic, and CloudWatch infrastructure. It must not introduce RDS,
  Aurora, OpenSearch, NAT Gateway, provisioned concurrency, or another always-on service.
- Only the Finance connection boundary may encrypt a claimed SimpleFIN Bridge Access URL. Only the
  Finance import function may decrypt it, and both permissions require the expected KMS encryption
  context.
- Imports are bounded by reserved concurrency, a per-connection lease, and the one-hour provider
  cooldown. A refresh overlaps the last successful import by five days and remains idempotent.
- CloudWatch emits only low-cardinality status and duration signals. Correlation IDs, entity types,
  safe state names, and counts are acceptable; provider URLs, account identifiers, names, amounts,
  descriptions, search text, and CSV rows are not.

## Alert response

1. Confirm whether the alarm concerns Finance API errors, import failures, import age, or duration.
2. Use correlation IDs and safe status fields to locate the request. Never request or paste an
   Access URL or real transaction payload into diagnostics.
3. For throttling or partial provider responses, preserve accepted data and retry only after the
   lease/cooldown permits it. Do not bypass the cooldown.
4. For authentication or suspected compromise, leave the connection in `attention`, stop automatic
   retries, and require the user to reconnect through SimpleFIN Bridge.
5. For reconciliation conflicts, retain both records and require an authorized user decision. Never
   force a merge or silently discard allocations, merchant links, transfers, matches, or budget links.

## Backup and restore

Finance rows are protected by the existing DynamoDB point-in-time recovery and backup plan. Follow
the [backup/recovery guide](operations/backup-recovery.md) and
[restore runbook](operations/restore-runbook.md).

After a restore, run the Finance restore validator before serving restored data. It checks account,
snapshot, source/entry identity, CSV receipt, allocation, budget, task-link, match, and reconciliation
invariants without contacting SimpleFIN. The validator must not decrypt or log Access URLs. A restored
credential is usable only by the production Finance import role under the expected KMS context.

Targets remain an RPO of at most five minutes and an RTO of at most four hours. If validation fails,
keep the restored environment isolated, retain the validator's content-free correlation evidence,
and correct the restore before reopening Finance.

## Deletion and audit preservation

Always generate an authorized impact preview before a destructive action. The preview may show safe
counts and blockers but must not reveal inaccessible account, transaction, budget, or link details.
Referenced records are archived or reduced to durable audit tombstones. Permanent deletion is only
available for an unreferenced draft or mistake after explicit confirmation. Large cascades use the
existing checkpointed deletion workflow so retries cannot duplicate work or erase required history.
Deleting transactions never deletes categories.

## Cost guardrail

At the two-user reference scale, the implemented incremental Finance design is estimated at
**$3.98 per normal month**, below the approved **$5 per month** ceiling. Review the estimate when
traffic, retained data, refresh frequency, alarms, or architecture changes. If the forecast exceeds
$5, pause the change and flag the amount, cost drivers, and cheaper alternatives for Steve before
deployment. One-time development, migration, and restore-test costs are tracked separately.

## Release evidence

Before release, complete the Finance quickstart, the required quick browser suite, focused Finance
tests, CDK synthesis, exhaustive browser/device coverage, and the two-user acceptance script. Confirm
the hosted required pull-request validation remains at or below ten minutes.
