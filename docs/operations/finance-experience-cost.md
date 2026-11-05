# Finance 015 + 016 cost gate

**2026-10-31, us-west-2: T004 approved; T018 acceptance remains pending.**
The original forecast was **$6.05/month** above the pre-Finance baseline, including
the plan's 30% contingency. The current conservative planning scenario below is
**$6.47/month**, with only **$0.03/month** headroom and unmeasured live usage. Steve approved a **$6.50/month combined Finance ceiling** on 2026-10-31 in this implementation conversation.
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

## Quantity × rate — original T004 forecast

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

## T018 continuation: measured representation and revised scenario — 2026-10-31

**No production cost/performance PASS is claimed.** The new offline sizing tool
`tools/measure-finance-projections.ts` runs no AWS requests. Its 50-account / 100k
synthetic-source representation estimate initially found **1,639,393,043 bytes**
and **4,467,900 references**, invalidating the unproved 0.3 GB projection allowance.
All one/two/three-character text grams now use shared monthly 500-position bitmaps;
completed checkpoints release their old fact after committing its reversal.
The resulting estimate is **513,383,799 bytes**, with **590,000 references**,
33,740 bitmap rows and 49,175 cardinality rows: **68.68% fewer estimated bytes**.
Full current facts and ordinal copies remain included. Exact synthetic output is
in [the sizing record](../testing/finance-experience-projection-sizing.json).

Method: UTF-8 JSON bytes plus 100 bytes per item, with base64 binary representation.
This is a representation estimate, not actual DynamoDB storage billing. The
single-month dataset shares text and includes one allocation per eligible expense;
longer/less repeated text, more splits/months/currencies and additional calendar
bases can increase storage. No assertion claims it bounds arbitrary allowed data.
TTL receipts/query jobs, other 016 metadata and GSI overhead are excluded from the
probe and need an additional allowance and live verification.

A command-level sample of 100 actual generated publications and 100 metadata
corrections estimates **403.44 transactional WRUs/new source** and **113.60/correction**,
using 2 × ceil(max(old,new) estimated item bytes/1,024). It recorded 25,192 strong
Get calls across both batches. These are injected-persistence command observations,
not AWS ConsumedCapacity measurements; read/condition-check capacity, canonical
writes, retries and GSI writes remain excluded. A scenario of 1,000 new sources and
500 corrections/month consumes an estimated **460,240 projection WRUs**, so the
original incremental 250,000-WRU allowance is insufficient for that scenario.

Reforecast conservatively reserves **0.6 GB incremental metadata** (0.4 GB existing
015 + 0.6 GB = 1.0 GB combined table/PITR/backup), and **500,000 incremental WRUs**
(1,000,000 combined). This leaves about 87 MB beyond the estimated projections for
other metadata and transients; it is a planning allowance to verify, not a measured
upper bound. All other original usage quantities/rates stay unchanged.

| Changed combined quantity           |  Original |       Revised | Direct monthly delta |
| ----------------------------------- | --------: | ------------: | -------------------: |
| DynamoDB WRUs                       |   750,000 |     1,000,000 |            $0.156250 |
| Table + PITR + backup GB-month each |       0.7 |           1.0 |            $0.165000 |
| Direct subtotal                     | $4.652751 |     $4.974001 |            $0.321250 |
| 30% contingency                     | $1.395825 |     $1.492200 |            $0.096375 |
| Combined forecast                   | $6.048576 | **$6.466201** |            $0.417625 |
| Headroom under approved $6.50       | $0.451424 | **$0.033799** |                      |

The changed paid us-west-2 DynamoDB rates were rechecked against the public regional
[offer file](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/us-west-2/index.json)
(publication `2026-09-11T12:44:22Z`): WRU $0.000000625, RRU $0.000000125, table
$0.25/GB-month, PITR $0.20, on-demand backup $0.10. No free tier is deducted.
The follow-up durable projection-age metadata is included in the 513,383,799-byte
probe; the 0.6 GB allowance and write sample remain unchanged. No new paid metric
series was introduced. Other service rates retain the T004 same-day review; no fresh billing data exists.

This conditional forecast is within approval but has very little margin. T018
remains unchecked until actual DynamoDB capacity/bytes and 20-run cold/warm/sparse/
empty 2s-row / 10s-exact acceptance are available and the modeled write/read mix,
TTL retention, receipt bytes/KMS/logs and metadata allowances are validated. Reforecast
before exceeding any allowance; a higher forecast requires renewed approval.
No deployment, live write, backfill or production change was performed.

Reproduce the offline estimate with the committed dependencies:

```sh
npx esbuild tools/measure-finance-projections.ts --bundle --platform=node --format=cjs --outfile=/tmp/naaseh-finance-sizing.cjs
node /tmp/naaseh-finance-sizing.cjs > /tmp/naaseh-finance-sizing.json
```

Operational diagnostics go to stderr; stdout is the synthetic JSON report. The
lower-storage alternative preserves text parity, original bytes, backups and
security checks, adds no paid metric series/service, and still requires live
read/write performance evidence before acceptance.

### Canonical PIN guard read allowance — November 1

The 2,000,000 incremental read-unit allowance already includes security management
and range/page authorization. Do not add the same allowance twice or infer unused
headroom from the local tests. A protected HTTP GET currently performs two guard
checks, each using an atomic profile/session/preference/grant transactional
snapshot (up to sixteen read units across both checks when each item is <=4 KiB).
A mutation performs three snapshots (up to twenty-four read units). The 10,000
modeled page/query actions therefore need up to 240,000 guard read units
($0.030 at the previously verified Oregon rate), within the existing read allowance if its
other assumptions hold. Larger items, retries, independent sync checks, auth leases
and receipts require actual ConsumedCapacity accounting. This is an allocation
within the conditional $6.466201 forecast, not evidence of real billed usage or an
accepted performance result. T018 stays deferred; no increased ceiling is assumed.


### Initial migration is outside the ongoing allowance — November 1

The revised retained-row estimate is **435,595,579 bytes** for the same synthetic
100,000-source/50-account, one-month distribution (previously 513,383,799).
Completed checkpoints drop duplicate fact payloads; interrupted checkpoints retain
their recovery input. Keep the conservative 0.6 GB metadata allowance and ongoing
**$6.466201/month** scenario unchanged. Storage estimates exclude temporary jobs,
canonical rows and scope/coverage-driver metadata and do not establish billed bytes.

The initial publication sample remains **403.44 estimated transactional write
units per source**. Extending that sample to 100,000 sources yields **40,344,000
write units**, or **$25.215 in writes alone** at the previously verified Oregon
rate, before 30% contingency, reads, canonical writes, index backfill and retries.
That is a conditional extrapolation from generated local operations, not AWS
ConsumedCapacity. It exceeds the **$6.50 combined monthly ceiling** and is not
covered by the ongoing 500,000 incremental write-unit allowance. No 100,000-source
live migration is accepted or authorized by this forecast. A cheaper migration
path or separately approved accounting/budget is required before execution; no
approval is assumed and no live migration was run. T018 remains unchecked.


The guard now reads three canonical records, or four when a syntactically valid
grant is supplied, in one `TransactGetItems` snapshot. Separate strong reads can
observe different sides of a concurrent reset; the transactional snapshot avoids
that mixed state. Projection expressions still omit password/PIN hashes and pepper
metadata. Missing responses/conflicting storage operations fail closed with a safe
unavailable response. The accounting above includes two reads per transactional
item, following [AWS transaction capacity documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html).
No live capacity or latency was measured; the existing read allowance is conditional.
