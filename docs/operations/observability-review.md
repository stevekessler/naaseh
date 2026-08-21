# Observability review

## Feature 009 local validation — 2026-08-14

`npm run test:observability` passes 25 tests across four files in 10.30 seconds. The synthesized foundation now contains 19 API integrations, 25 Lambda permissions, and 26 critical CloudWatch alarms while remaining below the 400-resource stack budget. The additional feature alarms cover task-security migration/inventory integrity and related failure paths; all alarms retain SNS actions.

The feature review includes safe TFA/reset/recovery outcomes, timer actions/conflicts/latency/clock anomalies, Extra Low inventory guard, administration denials, completion-export lifecycle/integrity failures, and existing sync/outbox metrics. Dimensions remain bounded action/outcome/reason/version/count classes. Credentials, codes, factor material/state details, cookies/tokens, labels/memos, task/user identifiers where unnecessary, timer anchors/payloads, combobox queries, CSV rows, object paths, and signed URLs remain excluded by logger redaction and security tests.

This is local synthesis and redaction evidence. Deployed log delivery, retention, alarm state/transitions, dashboard links, CloudTrail attribution, cardinality, and actual ingestion cost remain production release checks.

## Local validation — 2026-07-23

Application logs are structured JSON and recursively redact passwords, PINs, authorization
headers, cookies, sessions/tokens, memo/label content, mutation payloads, before/after values,
ciphertext, key material, Secrets Manager values, and signed upload/read URLs. Literal
`VERBOSE_LOGGING=true` is the only value that enables extra safe context; unset, mixed-case,
numeric, and other values remain false. Verbose mode uses the same permanent redaction list.

The synthesized infrastructure retains ordinary task/sync logs for 30 days and
authentication/recovery/restore-workflow logs for 90 days. API access logs contain request ID,
route, status, and response length—not request bodies, headers, query strings, usernames, task
data, or push endpoints. Twenty-two alarms cover task/sync/admin/category/profile-processing and
provisioning errors, authentication/group throttles, authentication p95 duration, KMS and Secrets
Manager policy/deletion events, same-Region backup/restore-test failures, administrative change
spikes, and Step Functions restore failures. Content-free embedded metrics now measure sync batch size,
conflicts, retryable sync failures, Web Push deliveries, and Web Push delivery failures; alarms
cover conflict/retry spikes, durable browser outbox depth, and delivery failures. The sync client
reports the count and age of the oldest record from its persistent IndexedDB outbox; batch size
remains a separate metric and is not used as a backlog proxy. EventBridge routes destructive
KMS/Secrets, Backup, and restore workflow events to dedicated SNS alert topics. Provisioning logs
use allowlisted correlation ID, opaque user ID, role, outcome, and CloudTrail principal-source
context; password, PIN, hashes, request payloads, and private data are excluded.

Still required before this gate can close: deployed verification that every expected event and
alarm and new custom metric reaches its retained log group/topic without protected values.
Threshold calibration requires AWS traffic and is not represented as passing evidence.

Run `npm run test:observability` for the local redaction, metric, alarm, and restore-log gates, or
`npm run validate:pre-aws` for the complete local non-browser release sequence.

## Cost envelope

Assume the initial 50-user workload produces at most 1 GB of application/Lambda logs per
month and remains below ten standard alarm metrics, ten custom metrics, and three dashboards.
AWS currently includes 5 GB of CloudWatch Logs ingestion/archive/query scanning, ten custom
metrics, ten standard alarm metrics, and three dashboards in the CloudWatch free tier. The
expected initial CloudWatch charge is therefore approximately $0 while those allowances
apply. Outside the allowance, Lambda logs in US East begin at $0.50 per ingested GB; storage
is much smaller after compression. At 1 GB/month, a conservative non-free-tier allowance is
about $0.50 plus storage and occasional query charges. Region and account eligibility vary.

Sources: [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) and
[AWS Lambda CloudWatch log tiering](https://aws.amazon.com/blogs/compute/aws-lambda-introduces-tiered-pricing-for-amazon-cloudwatch-logs-and-additional-logging-destinations/).

`VERBOSE_LOGGING` remains false by default because increased event volume directly increases
ingestion/query cost and disclosure review surface. Enable it only for a bounded incident,
monitor `IncomingBytes`, and disable it after evidence is collected. Revisit intelligent
storage tiering only if retained forensic volume grows; the current 30/90-day split is simpler
for the expected small workload.
