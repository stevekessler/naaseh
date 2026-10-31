# Finance 015 + 016 cost gate

**2026-10-31, us-west-2: PASS with explicit approval.** Forecast **$6.05/month** above the pre-Finance
baseline, including the plan's 30% contingency. Steve approved a **$6.50/month combined Finance ceiling** on 2026-10-31 in this implementation conversation.
This is a forecast, not measured billing. No resources were deployed or resized.
T004's forecast and approval gate are complete; Foundation implementation may continue.

## Workload and accounting

Use the research workload: five household users, 50 accounts, 100,000 retained
transactions, 20 budgets, 1,000 upcoming expenses and 5,000 receipt metadata rows.
Retain 2,000 original files averaging 0.5 MB: 1 GB originals, another 1 GB versions,
and 1 GB backups. Scan 200 new files / 0.1 GB monthly. Serve 1,000 receipt views
averaging 0.5 MB through authenticated ranges of at most 1 MiB.

Retain the existing 015 request workload rather than multiplying every request
by the user-count change: 100,000 HTTP calls, 120,000 Lambda invocations, 30,000
GB-seconds, 500,000 billed write units, 1,000,000 read units, 10,000 KMS requests
and 0.5 GB logs. The earlier $3.98 estimate included $0.60 contingency; do not
add its subtotal and contingency twice. Reprice quantities below instead.

016 adds 20,000 HTTP/Lambda requests, 3,000 GB-seconds, 250,000 write units,
2,000,000 read units, 5,000 KMS requests and 0.1 GB logs. These allowances cover
10,000 page/query actions, range authorization, security management, receipt
checks and projection maintenance. Reads assume selective indexes/common
summaries; they do **not** authorize 100k-record hydration on every query.
Write quantities are billed units including transaction multiplication and
index/summary/capacity records, not a count of logical transactions.

Storage assumes 0.4 GB existing metadata plus 0.3 GB incremental facts, postings,
security, query jobs and receipt metadata. Actual serialized bytes and write/read
amplification must be measured at T018 and release. The 0.3 GB estimate is not a
proved bound. Backups and PITR are priced in addition to table storage.

## Quantity × rate

Paid rates; no permanent free-tier, trial, credit or reserved-capacity deductions.
USD, before tax. Small differences below reflect displayed rounding.

| Service / billing quantity                            | Monthly quantity | USD per unit |  Monthly USD |
| ----------------------------------------------------- | ---------------: | -----------: | -----------: |
| HTTP API requests                                     |          120,000 |     0.000001 |     0.120000 |
| Lambda requests                                       |          140,000 |    0.0000002 |     0.028000 |
| Lambda x86 GB-seconds                                 |           33,000 | 0.0000166667 |     0.550001 |
| DynamoDB write request units                          |          750,000 |  0.000000625 |     0.468750 |
| DynamoDB read request units                           |        3,000,000 |  0.000000125 |     0.375000 |
| DynamoDB table GB-month                               |              0.7 |         0.25 |     0.175000 |
| DynamoDB PITR GB-month                                |              0.7 |         0.20 |     0.140000 |
| DynamoDB backup GB-month                              |              0.7 |         0.10 |     0.070000 |
| S3 original/version GB-month                          |                2 |        0.023 |     0.046000 |
| S3 backup GB-month                                    |                1 |         0.05 |     0.050000 |
| S3 PUT-like calls, including tagging/retries          |            2,000 |     0.000005 |     0.010000 |
| S3 GET-like calls, including check/range/backup reads |            5,000 |    0.0000004 |     0.002000 |
| S3 tag-months                                         |            2,000 |     0.000001 |     0.002000 |
| GuardDuty scanned GB                                  |              0.1 |         0.09 |     0.009000 |
| GuardDuty evaluated objects                           |              200 |     0.000215 |     0.043000 |
| KMS symmetric requests                                |           15,000 |     0.000003 |     0.045000 |
| CloudWatch ingested GB                                |              0.6 |         0.50 |     0.300000 |
| CloudWatch retained GB-month                          |              0.6 |         0.03 |     0.018000 |
| Logs Insights scanned GB                              |                2 |        0.005 |     0.010000 |
| Configured Finance custom metric-months               |                6 |         0.30 |     1.800000 |
| Finance alarm metric-months                           |                3 |         0.10 |     0.300000 |
| Internet egress GB, existing + receipts               |                1 |         0.09 |     0.090000 |
| EventBridge custom events                             |            1,000 |     0.000001 |     0.001000 |
| **Direct subtotal**                                   |                  |              | **4.652751** |
| **30% contingency, retained from the 016 plan**       |                  |              | **1.395825** |
| **Combined forecast**                                 |                  |              | **6.048576** |
| **Headroom against approved $6.50**                   |                  |              | **0.451424** |

The six series are the Finance dashboard's ImportDispatches, ImportDuration,
CsvCommittedRows, ImportFailures, DataIntegrityFailures and AuthorizationDenials
(each prefixed `Finance`) in `infra/lib/observability-stack.ts`. Declaration alone
does not incur custom-metric billing: this forecast conservatively allows all six
to become active throughout the month; current emission is incomplete. The one
Finance failure alarm uses three input metrics. AWS bills metric-math alarms per
input metric, not simply per alarm resource. Reuse these signals and existing
security/attachment alarms for new failures; diagnostic breakdowns use structured
logs, with no user/account dimensions or new paid dashboard assumed.

## Sources and reproducibility

Read the official Oregon on-demand offer files on 2026-10-31. Source format:
`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/SERVICE/current/us-west-2/index.json`.
Services reviewed: `AmazonS3`, `AmazonDynamoDB`, `AmazonGuardDuty`, `AWSBackup`,
`AWSLambda`, `awskms`, `AmazonCloudWatch`. Select paid standard tiers and the
correct operation; exclude global free-tier rows, S3 Tables, provisioned/edge
Lambda, asymmetric KMS and high-resolution/composite alarms.

- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/) and
  [AWS Backup pricing](https://aws.amazon.com/backup/pricing/): requests, storage,
  PITR and backup storage. Backup object minimums/requests need remeasurement if
  average retained objects become smaller than 128 KB.
- [S3 pricing](https://aws.amazon.com/s3/pricing/): standard storage, requests,
  tagging and paid internet transfer. Transfer is conservatively charged without
  deducting the shared outbound allowance.
- [GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/): both bytes and
  object evaluations, without deducting its free allowance.
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/),
  [HTTP API pricing](https://aws.amazon.com/api-gateway/pricing/) and
  [KMS pricing](https://aws.amazon.com/kms/pricing/): existing services/key reused.
- [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/): ingestion,
  retention, queries, custom series and alarm input metrics.

No new KMS key, secret subscription, bucket, database, NAT gateway, provisioned
concurrency, Office renderer or scanning platform is assumed. Existing shared
fixed charges belong to the pre-Finance baseline; incremental usage remains in
this table. Migration/backfill, development and quarterly restore exercises are
separate one-time costs requiring measured evidence before release.

## Lower-cost alternatives and next gate

Managed serverless reuse and bounded reads remain the least complex design.
Using the earlier four-series/four-alarm allowance instead would reduce this
forecast to **$5.40**, still above $5 with the planned contingency. Arm Lambda
would save about $0.11 direct monthly at this workload, insufficient on its own;
it also needs native dependency compatibility evidence. Do not remove malware
checks, backup, original receipts, authorization or necessary failure signals.

The direct subtotal is below $5; the 30% contingency covers unmeasured production
hydration replacement, index amplification, retention growth and retries. A lower
reserve would change the planning assumption rather than demonstrate a saving.
Recommend a **$6.50/month combined Finance ceiling**, with another stop/reforecast
if the measured design exceeds it. Steve explicitly approved this ceiling on 2026-10-31.

At T018 measure actual cold/sparse/empty paths, capacity units, fact/posting bytes,
range/KMS counts and checker compute. Before release reprice the synthesized
design and retained backup versions. Growth triggers reforecast, never deletion
of referenced receipts. Approval permits Foundation implementation; repeat the gate against $6.50 at T018 and before release.
