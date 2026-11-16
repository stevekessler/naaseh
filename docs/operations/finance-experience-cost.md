# Finance 015 + 016 cost gate

## November 16 T018 cost preflight

The rerun used the current integration tree and the established household
inputs of eight accounts, 250 new transactions and 100 corrections per month,
five years of initial transaction history, and 50 new 2 MB Standard receipts
per month. DynamoDB public pricing still lists $0.625 per million standard
writes and $0.125 per million reads. The GuardDuty public example still lists
$0.09 per scanned GB and $0.215 per thousand evaluated objects. Other paid
Oregon rates below are carried forward from the earlier regional offer-file
checks. [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/) ·
[GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/).

| Offline probe | Result |
| --- | --- |
| Eight accounts, 15,000 transactions spread over 60 months | 127,616,386 estimated projection bytes |
| Fifty accounts, 100,000 transactions in one month | 576,937,456 estimated projection bytes |
| Same stress workload spread over 60 months | 659,914,475 estimated projection bytes, above the 0.6 GB incremental metadata allowance before other records |
| Broad compact query, 50 accounts, first 200 rows | 150 index queries, 86 metadata gets, 200 hydration reads, 21,050 estimated RRUs including hydration, and 1,068 estimated checkpoint WRUs |
| Household projection and query write subtotal plus existing journal and recovery allowances | 347,815 of the 500,000 incremental WRU reserve before remaining actions and retries |

The reruns match the committed [projection](../testing/finance-experience-projection-sizing.json),
[query](../testing/finance-query-checkpoint-sizing.json), and
[receipt](../testing/finance-receipt-storage-sizing.json) sizing results. The probes
use generated commands and simulated persistence. Coverage guard,
service retries, SDK timings, full billed storage and the remaining invocation
and request allocation still need live data. The separate 100,000-source
initial projection estimate is **$20.96 in DynamoDB writes alone**, assuming
335.3 WRUs per source at the checked write rate. Setup and fixture expenditure
are outside the quoted ongoing monthly scenario.

Using the established two-total-views assumption and retaining the modeled
extra version and warm backup copies, the receipt sensitivity is **$6.38/month
at month 12**, **$6.52 at month 24**, and **$6.94 at month 60**, with 30%
contingency. The comparison carries the earlier conditional non-receipt costs.
It exposes a **$0.44/month** gap at month 60 before any unallocated work.
Measure version churn, incremental backup storage, and measured query and
publication usage before relying on a reduction. Keep the $6.50 ceiling and
the established Standard receipt retention settings. T018 cost acceptance
remains open.

> November 9 household update: two simultaneously visible devices and mixed
> private/shared accounts are confirmed. Ten daily overall hours include two Finance
> hours. Current source/proof/group work is not accepted under a measured combined
> bill; the historical $6.47 scenario below remains conditional. Keep the approved
> $6.50 ceiling including 30% contingency and the migration unrun. Both per-budget financial forecast methods and dashboard overview are requested;
> model runtime costs remain unpriced. Non-budgeted history is explicit opt-in,
> and budget reporting remains strict.

**2026-10-31, us-west-2: T004 approved; T018 acceptance remains pending.**
The original forecast was **$6.05/month** above the pre-Finance baseline, including
the plan's 30% contingency. The current conservative planning scenario below is
**$6.47/month**, with only **$0.03/month** headroom and unmeasured live usage. Steve approved a **$6.50/month combined Finance ceiling** on 2026-10-31 in this implementation conversation.
This is a forecast, not measured billing. No resources were deployed or resized.
T004's forecast and approval gate are complete; Foundation implementation may continue.
The November 6 query sizing below exposes an unresolved workload assumption:
daily all-account/all-history queries exceeded the ceiling with the initial
query implementation even under optimistic allocation of the read allowance.
The subsequent compact-input optimization below reduces the modeled common path
within the existing quantities. The $6.466201 scenario remains conditional,
not current query-cost acceptance.

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

### Query checkpoint and continuation sizing — November 6

The offline [utility](../../tools/measure-finance-query-checkpoints.ts) uses actual
query service/repository/store code with injected indexed reads and transactional
command persistence. It has no AWS call path. Results are in the
[sizing record](../testing/finance-query-checkpoint-sizing.json). Each account has
2,000 single-currency synthetic facts, spaced a day apart, with short descriptions
and one spend slice. These are broad unfiltered queries, not selective-index or
summary-path benchmarks.

| Scenario                                        | Checkpoint WRUs (estimated) | Index queries / fact batch gets | Candidate facts | Index + fact RRUs (estimated) |
| ----------------------------------------------- | --------------------------: | ------------------------------: | --------------: | ----------------------------: |
| One account, first window                       |                         108 |                          2 / 20 |           2,000 |                         2,130 |
| One account, through second window              |                         218 |                          4 / 39 |           3,801 |                         4,048 |
| 50 accounts / 100k facts, first window          |                       1,462 |                     100 / 1,000 |         100,000 |                       106,500 |
| 50 accounts / 100k facts, through second window |                       2,924 |                     200 / 2,000 |         199,850 |                       212,850 |

Windows retain at most 200 references; ordinary pages can be smaller. The first
window computes exact aggregates automatically. Later windows still repeat many
candidate reads, despite the indexed boundary. Bounded per-step work is not a
bound on total query work, the two-second actual-row deadline, or ten-second
aggregate completion. These latency gates remain unmeasured.

Identifier-only step receipts reduce the 100k root estimate from **2,784 to 1,462
WRUs** and retained checkpoint/receipt bytes from **728,044 to 41,124**. Across
two windows, writes fall from **5,586 to 2,924** and bytes from **1,459,292 to
82,398**. Concurrent worker/lost-response recovery still reads the current
conditioned checkpoint. This avoids retaining another growing job per step;
it does not solve broad-query read amplification.

Method: UTF-8 JSON plus 100 bytes/item; transactional puts use
`2 × ceil(max(old,new) estimated bytes / 1024)`. Strong fact gets round each
estimated item to 4 KiB, indexed queries round each returned reference page to
4 KiB. Metadata gets are counted but their RRUs, transaction condition checks,
canonical/security/dependency reads, result hydration, retries, Lambda/dispatch,
logs and TTL/PITR/backup costs are excluded. Long facts and compact-text paths
can differ. These are planning estimates, not AWS ConsumedCapacity, billing,
live deadlines or a proved upper bound.

The public Oregon [DynamoDB offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/us-west-2/index.json)
was re-read for this review (publication `2026-11-05T16:40:16Z`): paid on-demand
WRU $0.000000625 and RRU $0.000000125 are unchanged. Public Python retrieval
failed local certificate verification; system `curl` succeeded with certificate
verification enabled. AWS's [request accounting](https://aws.amazon.com/dynamodb/pricing/)
documents 1-KiB transactional-write doubling and 4-KiB strong-read rounding.
No free tier, paid resource or credential was involved in retrieving prices.

At these rates, the estimated request component of a 100k root is **$0.014226**;
through its second window it is **$0.028434**. These figures exclude the costs
above and cannot be treated as a complete per-query price. As an optimistic
monthly sensitivity check, allocate the entire 2,000,000 incremental RRU
allowance to broad queries and retain 460,240 projection WRUs within the 500,000
incremental WRU allowance. Thirty such root queries/month would imply at least
**$6.663720** combined using the earlier other-service quantities and 30% reserve;
thirty queries through a second window imply **$7.217812**. Other protected reads
still need their allowance, so neither is a budget PASS or a proposed increase.

The plan's 10,000 page/query actions did not specify how many searches span all
accounts/history or how deeply results are browsed. The user subsequently chose
one broad search daily, usually the first 200 results. Prioritize compact
aggregates/selective probes and a continuation strategy
that avoids broad rescans. The approved ceiling stays **$6.50/month**. Do not
mark T018 or dependent acceptance complete, deploy this path, or run the migration
from this estimate. Real DynamoDB/hosted evidence remains user-deferred.

Reproduce offline on Node 24 with installed dependencies:

```sh
npx esbuild tools/measure-finance-query-checkpoints.ts --bundle --platform=node --format=cjs --outfile=/tmp/naaseh-finance-query-sizing.cjs
node /tmp/naaseh-finance-query-sizing.cjs > /tmp/naaseh-finance-query-sizing.json
```

#### Daily first-200 planning mix and compact aggregate inputs

The user's November 6 answer is **one broad search daily, usually the first 200
results**; use 30/month for this planning sensitivity while retaining 10,000 total
monthly page/query actions. No cost ceiling, retention or acceptance requirement
changed.

New publications attach a compact, versioned spend aggregate to the existing
account/date reference in the same final conditional transaction as the fact.
It retains active/posted state, checked currency totals and the source/budget
dependencies needed for authorization. Metadata corrections update it even when
the date key stays unchanged. Private unfiltered workers consume these inputs
without loading every full fact. Public rows and filters requiring omitted
fields continue to hydrate facts; legacy references without compact inputs
remain correct through bounded fact reads. Existing completed publications are
not silently rebuilt. The savings below require compact inputs to be populated;
missing legacy inputs do not inherit them.

Checkpoint row references now use internal tuples with account indexes rather
than repeating account IDs/field names per row. Reads support earlier plain
temporary checkpoints; malformed packed scope indexes fail closed. Pages hydrate
only their requested references, so a 50-row page no longer loads all 200 rows
in its window. Current-grant/source/expiry checks still follow hydration.

The updated query sizing record preserves the previous encoding results and
includes legacy and compact inputs under the current encoding:

| 100k-row common query                        | Initial root implementation | Compact receipts only | Current compact inputs + packed references |
| -------------------------------------------- | --------------------------: | --------------------: | -----------------------------------------: |
| Checkpoint WRUs, estimated                   |                       2,784 |                 1,462 |                                      1,022 |
| Index + fact scan RRUs, estimated            |                     106,500 |               106,500 |                                     13,900 |
| Delivered first-200 fact RRUs, estimated     |                    Excluded |              Excluded |                                        200 |
| Retained checkpoint/receipt bytes, estimated |                     728,044 |                41,124 |                                     29,711 |
| Index queries / fact batch gets during scan  |                 100 / 1,000 |           100 / 1,000 |                                    100 / 0 |

This is about **87% less estimated scan read capacity** in this synthetic common
path, not a live capacity claim. Candidate count remains 100,000; longer/filtered
queries and deep continuation need further work. Dense text candidates still
hydrate full facts. Authority/condition-check reads, compute, retries and other
excluded costs remain outside the table.

The projection sizing record's `accountAggregateReadOptimization` result estimates
**468,512,829 retained projection bytes**, up 32,917,250 from the preceding
435,595,579-byte representation. This stays within the 600 MB incremental
metadata planning allowance with about 131 MB for other metadata/transients;
that is not a proved storage bound. The generated 100-source write sample is
**405.44 WRUs/new source** and **115.60/correction**, two units more per operation
than before, and 25,392 strong point-get calls across both sample batches.
Canonical/security writes, retries and condition-check/read capacity remain
excluded.

At 1,000 new sources + 500 corrections/month the projection estimate becomes
**463,240 WRUs**. Thirty 100k common queries add **30,660 checkpoint WRUs**, totaling
**493,900** of the 500,000 incremental allowance. The query scan plus first-200
delivery estimate is **423,000 RRUs/month**, leaving 1,577,000 of the existing
2,000,000 incremental read allowance for authority, selective views and other
activity. Only 6,100 incremental WRUs remain for other mutations/retries, so the
remaining request mix still needs capacity evidence. These components fit the
unchanged conditional **$6.466201/month** quantity scenario; they do not establish
that every remaining action fits. No larger budget is assumed and no T018 PASS,
deployment or migration is authorized by this calculation.

### Text counter amplification correction — November 6

Text posting hints now count occupied 500-position bitmap chunks, not individual
matching facts. The counter is touched only when a bucket appears/disappears.
Ordinary account/dimension cardinality and canonical coverage counters stay exact.
Unknown/legacy text hints are ignored when comparing dimensions; a converted
legacy exact count is conservatively adopted as an upper bound on chunk count.
Hints never assert an exact result or bypass an indexed read. Less precise text
hints can choose more candidate work than a fresh exact hint, so actual sparse/
dense deadline evidence remains necessary.

The projection sizing record's `textCardinalityOptimization` result estimates
**468,795,458 retained bytes** under the same fresh synthetic distribution. The
100-new-source + 100-correction generated-command sample is **327.38 WRUs/new
source** and **95.60/correction**, with **20,489 strong point gets** across both
batches. Compared with compact account aggregates alone, it avoids 7,806 estimated
new-source WRUs and 2,000 correction WRUs across those 100-source samples. It
does not remove posting bits, facts, backups or any authorization check.

At the documented monthly projection mix, these components total **375,180
WRUs**; adding the user's 30 common broad first-200 queries at 1,022 WRUs/query
gives **405,840**, leaving **94,160** of the unchanged 500,000 incremental allowance
for other activity/retries. The estimated broad-query read component remains
423,000 RRUs/month; authority and remaining traffic still need measurement.
Keep the same 0.6 GB incremental metadata and conditional **$6.466201/month**
forecast against the **$6.50** ceiling. No resource or fixed fee was added.

The fresh initial 100k-source extrapolation is still **32,738,000 WRUs**, or
**$20.461250 in writes alone** at the verified Oregon rate, before reads, canonical
writes, retries, compute and contingency. This supersedes the older $25.215 write
sample only for this synthetic scenario; it remains above the approved ceiling.
The migration remains unrun and unauthorized under this ongoing allowance.
T018 remains open; none of these estimates is actual ConsumedCapacity or billing.

### Independent row readiness and durable journal allowance — November 6

The query tool now includes the verified compact first-window preview in its
current `compact=true` scenarios; `beforeIndependentRowReadiness` retains the
preceding figures. For 50 accounts / 100k facts, a root now estimates **1,068
checkpoint WRUs**, **20,850 scan RRUs + 200 delivered-fact RRUs**, and **30,082
retained metadata bytes**. It issues 150 indexed queries, scans 150,000 candidate
references (50k preview + 100k aggregate work), and makes no scan-time fact batch
gets. Root aggregate count/totals still cover 100,000 unique facts. Through the
second window, the cumulative estimate is **2,090 WRUs / 35,150 RRUs including
delivered facts**. These figures include accepted preview work but continue to
exclude authority/condition-check reads, compute and retries. They are not p95
latency or live consumed-capacity evidence.

The user's 30 common broad first-200 searches/month therefore allocate **32,040
checkpoint WRUs and 631,500 RRUs**, rather than the preceding 30,660/423,000
without independent row readiness. Combined with the fresh projection estimate
of 375,180 WRUs, that is **407,220** of the existing 500,000 incremental WRU
allowance. The additional reads enable actual stable rows before aggregate
completion; no progress-only deadline acceptance is claimed.

Canonical writes now include an outbox manifest plus one immutable journal row
per changed scope in their existing transaction. The offline projection record
has metadata-only `canonicalJournalSamples`: **4 / 10 / 26 estimated transactional
WRUs** for one-scope commits containing 1 / 10 / 40 source changes, with **1,112 /
3,578 / 11,798 estimated bytes** across two records. Multiple scopes and other
changed canonical records increase that overhead. These estimates cover only
the added journal records, not the canonical write/receipt itself. Legacy writer
capture needs no additional journal point reads; targeted UOW capture does.

Provisionally reserve **20,000** of the remaining incremental WRUs for journal
capture (planning around 2,000 ordinary canonical commits, not a proved bound).
The accounted components total **427,220 WRUs**, leaving **72,780** for remaining
mutations/retries; the read allowance leaves **1,368,500 RRUs** before authority,
journal reads and other activity. Keep the unchanged conditional $6.466201
quantity scenario and **$6.50 ceiling**. The pending journal has no TTL and no
consumer yet: backlog bounds, completed retention, recovery dispatch and actual
capacity remain unfinished T013/T017/T018 work. No ongoing budget PASS or rollout
is accepted for an undrained pipeline. No resource, worker mapping, real AWS
write or migration was enabled.

### Source dependencies and retained-history sensitivity — November 6

The private source-dependency index raises the one-month retained representation
to **545,370,458 estimated bytes**. Its 100-create/100-correction sample generates
**33,130 / 9,750 estimated transactional WRUs** (331.3/create, 97.5/correction),
with **20,684 strong-get calls** across both samples. Under the existing modeled
1,000 creates and 500 corrections, publication uses **380,050 WRUs/month**. Add
**32,040 WRUs** for the user's 30 broad searches/month (first 200 results), and
the provisional **20,000 journal WRUs**: **432,090 total**, leaving **67,910** of
the existing 500,000 incremental allowance before other work/retries. Broad-search
read estimate remains **631,500 RRUs**; authority/other reads remain extra within
the same existing allowance. The updated initial-publication extrapolation is
**33,130,000 WRUs / $20.70625 writes alone** at the previously verified Oregon
rate; migration remains unrun and unauthorized under the combined monthly ceiling.

That one-month storage distribution is insufficient to size all retained history.
The offline utility now accepts `--months=N` (1–240) and counts monthly summaries
and ordinal counters that were previously omitted. With the same 100,000 sources
and 50 accounts, revised retained estimates are **545,393,156 bytes (one month)**,
**559,285,543 (one year)**, **628,370,175 (five years)** and **723,541,786 (ten years)**.
Ongoing write calibration stays in the current month across scenarios; month
distribution changes retained bitmap occupancy. See `retainedHistoryScenarios`
in the projection-sizing artifact. These are local JSON representation estimates,
not DynamoDB billed bytes, consumed capacity or performance acceptance.

Five- and ten-year scenarios exceed the conditional forecast's **0.6 GB incremental
metadata allowance** before unfinished coverage/consumer metadata. Therefore the
prior **$6.466201/month** scenario is not evidence that those horizons fit. The
approved combined ceiling stays **$6.50/month**. The expected history span is a
pending sizing question; no retention/deletion policy or increased budget is
inferred. Further optimization and final accounting are required before accepting
the pipeline. Real DynamoDB and hosted acceptance remain deferred.

User clarification (November 6): this is for one couple with modest expected
transaction volume; transactions must remain until explicitly deleted by the
user. There is no selected age-based retention horizon. Treat the 100,000-source
multi-year scenarios as stress tests, not expected household usage. Do not apply
transaction TTLs, delete older transactions, or infer a higher budget from those
scenarios. Private query/receipt expiry remains separate from canonical transaction
retention. Future projections must account for accumulated history without
requiring user deletion; the $6.50 combined ceiling and deferred live acceptance
remain unchanged. No new household volume forecast is invented from this answer.

The next offline stress representation includes generation-bound per-source
coverage applications and 50 account baselines. Retained estimates become
**576,937,456 / 590,829,843 / 659,914,475 / 755,086,086 bytes** for 1/12/60/120
months. The 100-source publication/correction calibration now seeds an existing
account proof and retains each corrected source's prior application: **33,530 /
10,150 estimated transactional WRUs**, or **335.3 / 101.5 per source**. Strong-get
sample count remains **20,684**. These supersede the narrower estimates above;
incremental application/finalization writes, jobs, authority checks and retries
remain additional and are explicitly excluded from this sample.

At the existing 1,000-create/500-correction planning quantities, publication alone
is **386,050 WRUs**. With broad queries and provisional journal capture, the
subtotal is **438,090**, leaving **61,910** of the incremental 500,000 allowance
before unfinished consumer/application/finalizer costs and other activity. The
100,000-source initial write extrapolation becomes **33,530,000 WRUs / $20.95625**
in writes alone; it remains unrun. No deletion requirement or higher budget is
implied. The conditional ongoing estimate has not passed final cost acceptance.

### Outbox/consumer command sizing and household forecast — November 6

The offline `tools/measure-finance-publication.ts` exercises the actual outbox,
account-window, source-publication and application services using shared synthetic
persistence/query fixtures. No AWS calls occur. Results are retained in
`docs/testing/finance-publication-sizing.json`. Initial fixture publication/full
verification is excluded. Transactional puts/deletes use the same JSON-plus-100
byte estimate; conditional-check counts are separate. Read units, Lambda, retries
and real latency remain unmeasured. Canonical fixture totals include existing
canonical writes and must not be added again to the 015 baseline.

For a single small synthetic source create/correction, the added private workflow
uses **42 WRUs for the account window**, **8 for application**, and **36 for
outbox routing/archive**. Its source publication is **134 / 56 WRUs**, reflecting
a much shorter description/graph than the representative projection sample; do
not replace the representative **335.3 / 101.5** publication quantities with these
smaller numbers. Thirty metadata-only commits coalesce into **40 account-window
WRUs**; their separate outbox routing/archive uses **780 WRUs** for one account.

The 10/50-account variants mock all additional accounts as already current,
excluding their window/application work: this is a routing lower bound. Per
create/correction, routing/archive alone is **76 / 268 WRUs** respectively.
For 30 metadata commits it is **1,980 / 7,740 WRUs**. They establish neither full
many-account feasibility nor billed capacity. These results expose additional
work omitted by the earlier 438,090-WRU subtotal.

Illustratively retaining the historical 1,000-create/500-correction quantities,
the representative publication estimate plus the single-account measured workflow,
daily broad queries and provisional journal reserve subtotal **567,090 incremental
WRUs**, before other activity. Adding only the write overage above 500,000 to the
old conditional quantity scenario gives roughly **$6.52/month** with its existing
30% contingency. The 50-account routing lower bound gives **915,090 WRUs / about
$6.80/month** under the same arithmetic, before the omitted child work/other costs.
These mixed synthetic scenarios are not accepted forecasts or live billing; they
show that the previous **$6.466201** scenario no longer proves the ceiling is met.
No additional spend or higher ceiling is authorized.

The user's one-couple/modest-volume clarification does not supply account count
or monthly write counts. Approximate linked-account, new-transaction and correction
quantities are a pending household-sizing question. Keep the 50-account/100,000-row
case as a stress test, keep all transactions until user deletion, and optimize or
revise workload accounting before automatic dispatch/final cost acceptance. The
approved **$6.50 combined ceiling**, deferred hosted/real DynamoDB gates and unrun
migration remain unchanged.

### Household sizing answer — November 6

The user supplied **8 linked accounts and 250 total transactions**, interpreted
as 250 new transactions/month across all accounts in response to the monthly
question. Retain **500 corrections/month** as the earlier conservative assumption;
that correction quantity was not supplied by the user. Allow another **500
ordinary metadata commits/month** explicitly for planning, not as measured usage.
Keep daily broad searches/200 results and all transactions until user deletion.

The publication utility now also runs all eight real synthetic account windows,
without mocking away child work. Per create/correction, additional window,
application and routing/archive estimates are **182 + 8 + 68 = 258 WRUs**.
A standalone metadata commit uses **160 + 58 = 218 WRUs**; 30 coalesced metadata
commits use **320 + 1,740 = 2,060 WRUs**. These retain small fixture source bodies
and exclude live capacity/latency, initial trusted verification and billing.

Combining representative source publication with this eight-account workflow gives
**134,575 publication + 193,500 workflow + 109,000 other metadata + 32,040 broad
query + 20,000 journal-reserve = 489,115 incremental WRUs/month**. This is within
the existing 500,000 planning allowance by **10,885 WRUs**, without lowering the
other read/compute/storage/backup/security quantities or the 30% contingency.
This does not establish a billing/latency PASS or an indefinite storage bound.
Keep the existing conservative combined quantity scenario and $6.50 ceiling while
checking dispatch/recovery overhead and eventual live evidence. The 50-account/
100,000-source multi-year cases remain stress tests with unresolved acceptance.

Trusted dispatch reuses the existing default EventBridge bus and Finance function.
Allow **2,000 publication events/month** in addition to the earlier 1,000 events:
**$0.002 direct / $0.0026 with contingency**, retaining the same-account classic-bus
rate and small identifier payloads. The unchanged quantity scenario would therefore
be **$6.468801/month**, before any measured read/compute/storage overage. No new
event bus, paid metric series, key, secret or always-on compute is introduced.
[AWS EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) was checked
November 6 for classic custom-event ingress and same-account service delivery.
Five durable actions per native invocation reduce continuation request amplification;
actual Lambda/read/latency acceptance remains deferred and must still fit the
existing allowances. This is not a production-spend authorization or cost PASS.

### Recovery and invocation allocation still require acceptance — November 6

A conservative 9,000 scheduled polls/month adds at least 18,000 strong read units
when idle (one checkpoint get plus one empty query per poll), and no writes.
Reserve 2,500 additional WRUs for up to 625 cursor/receipt transactions when the
queue spans pages. The household write subtotal becomes **491,615**, leaving
**8,385** of the 500,000-unit allowance. Persistent failures, larger pending items,
more cursor cycles or retries can exceed that reserve; it is not a proved cap.

Bounded scheduling also exposes a request-allocation gap. The eight-account
create/correction harness takes 48/47 steps, or about ten five-step invocations;
metadata takes 37 steps, or eight invocations. Using those upper rounded counts
for 750 create/correction commits and 500 metadata commits gives **11,500 native
publication invocations** before retries. Add 9,000 recovery polls: **20,500**
background invocations, already above the original 20,000 incremental Lambda
allowance before query HTTP/worker and other work. Coalescing can reduce this;
these simple counts are conservative and exclude service retry amplification.
The $6.468801 quantity scenario therefore does **not** prove current compliance.
Reallocate/price complete requests and measure compute/read usage before acceptance;
do not silently increase the $6.50 ceiling or consume an assumed free tier.

Deletion witnesses add a small identifier-only record only on actual physical
removal. They have no TTL while still needed by pending work. Their eventual
consumption/retention cost must be included with completed worker metadata; no
canonical transaction retention policy is changed.

### Actual deletion-command calibration and remaining household question — November 6

The same representative 100-source projection sample now executes bounded
removal after correction: **39,718 WRUs / 397.18 per removed source**, including
its final coverage subtraction, excluding canonical removal, outbox/account-window
work and read/condition-check capacity. It performs **22,389 strong gets** during
removal; this is a call count, not consumed read units. Create/correction remain
**335.3 / 101.5 WRUs per source**, excluding their separate coverage application.
The small eight-account complete deletion harness adds **70 routing/archive +
182 account-window = 252 WRUs** outside source cleanup (including the completed
witness retention write). It takes **48 bounded outbox steps**. Small fixture
source deletion is 148 WRUs and must not replace the representative 397.18 sample.

Consequently an assumed edit that is a deletion costs **397.18 + 252 = 649.18**
WRUs here, versus **101.5 + 258 = 359.5** for the correction model. Replacing all
500 assumed corrections with permanent removals adds **144,840 WRUs**, bringing
the subtotal including recovery reserve from **491,615 to 636,455**. That exceeds
the 500,000 allowance by **136,455** units, approximately **$0.110870 including
30% contingency** at the previously verified Oregon $0.625/million write rate. See
[AWS DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/); the public
standard-table examples retain that unit rate, checked November 6.
The old conditional quantity scenario would become about **$6.579671/month**,
even before fixing its invocation-allocation gap. This is not billing evidence.

The user's account/new-transaction answer did not provide monthly corrections or
permanent removals. A focused follow-up now asks for those two rough counts.
Use their answer to distinguish correction and deletion load; do not treat the
500/month conservative assumption as user-supplied or raise the $6.50 ceiling.
Retained transactions still have no automatic expiry. No live migration was run.

### Resolved correction/deletion volume — November 6

The user answered **100 corrections and zero permanent deletions per month**.
Together with the already supplied eight accounts/250 new transactions, these
replace the 500-correction assumption. Zero deletions is a forecast quantity;
permanent deletion remains supported and does not impose a retention restriction.
Retain 500 other metadata commits/month as a separate conservative assumption.

Before the relocation sizing refresh, representative source writes are
**250 × 335.3 + 100 × 101.5 = 93,975 WRUs**, eight-account workflow is
**350 × 258 = 90,300**, metadata **109,000**, broad queries **32,040**, journal
reserve **20,000**, and recovery reserve **2,500**: **347,815 incremental WRUs**,
leaving **152,185** in the 500,000 allowance. Account-move and pending/completed
metadata overhead still need the updated utility result and live capacity evidence.

Rounded background requests become **350 × 10 + 500 × 8 + 9,000 = 16,500**
publication/recovery invocations before query HTTP/worker and retry traffic.
The original 20,000 incremental request allowance is still insufficient once
10,000 page/query actions are included. A full request allocation can be repriced
inside the existing ceiling; do not claim cost acceptance from reduced writes.
All real DynamoDB/hosted gates remain deferred, and the migration stays unrun.

### Five-year initial-history scenario — November 6

The user expects **five years** of initial history. At 250 new transactions/month,
use **15,000 transactions** as an extrapolation pending actual files/source.
The extended offline tool accepts `--accounts=8 --transactions=15000 --months=60`;
the original 50-account/100k defaults remain available as stress cases. Generated
projection rows total **127,616,386 bytes**, excluding canonical rows, GSI overhead,
private jobs/receipts, security and other metadata. This is below the existing
0.6 GB incremental storage quantity for the sampled data; it does not establish
an indefinite retention bound or actual AWS stored bytes. Transactions remain
until the user deletes them.

The corresponding current-month 100-source calibration measures **269.24 create /
85.98 correction / 316 deletion WRUs per source** with the documented exclusions.
Keep the older 335.3/101.5 source calibration conservatively in the ongoing model:
**347,815 incremental WRUs/month**, no increase after relocation support. The
complete 8-account move adds **598 workflow WRUs**, excluding canonical fixture
writes; other ordinary command estimates are unchanged. No monthly move count was
supplied, so do not silently consume the whole reserve as measured usage.

Extrapolating the new source-create calibration to 15,000 sources gives
**4,038,600 WRUs / $2.524125 writes alone**, before source reads, canonical import,
publication routing, trusted verification, retries and 30% contingency. The sample
is current-month, not an executed five-year migration. Its retention distribution
and publication sharing may change initial work. Initial bulk publication needs
optimization and complete setup accounting; this extrapolation does not authorize
a migration within the $6.50 ongoing scenario. The pending question distinguishes
CSV imports from data already in Na'aseh, because canonical import and projection
backfill incur different work. Leave all migrations unrun.

### Retirement and validated-creation overhead — November 6

The fifteen complete/offline publication scenarios converge after retirement and
birth-lineage support. Ordinary small-fixture source creation is now **142 WRUs**
(previously 134), because its checkpoint retains proven creation ID/generation
until application. Corrections remain 56, deletion 148, and ordinary eight-account
routing/window/application overhead remains 258/create-or-correction. Allocate
**250 × 8 = 2,000** for the observed new-source delta inside the existing **20,000
journal reserve**; the ongoing **347,815 WRU** subtotal remains unchanged. This
is an explicit reserve allocation, not a claim that all source shapes have that
same delta. Current-birth pointer writes are rare account-creation bookkeeping;
retirement certificates/pointers contain identifiers only and are durable for old
pending jobs. Their actual retained volume remains part of capacity acceptance.
No account or transaction retention limit, cloud write, or migration is introduced.

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

November 7 user clarification: **there is no Finance data currently in Naaseh**.
All data will be imported or come through the SimpleFIN bridge. Treat the estimated
five-year/15,000-row setup as **new ingestion**, including canonical import writes,
publication, retries and normal monthly activity, not backfill of existing rows.
This resolves the earlier source-versus-existing-history question; do not ask it
again. It does not establish actual file counts or provider historical coverage.
Keep the explicit migration unrun and the combined $6.50/month ceiling with 30%
contingency. Initial ingestion/capacity/cost evidence remains required; nothing
was imported into AWS or production by this clarification.

### New-ingestion burst calibration — November 7

`tools/measure-finance-initial-ingestion.ts` starts eight synthetic accounts with
zero sources and a trusted empty baseline, then inserts 80 entirely new sources
before running the bounded publication/outbox consumers to completion. No AWS
calls occur. Both variants finish with verified coverage/count 10 per account and
no pending outbox work. Initial account/baseline construction, actual CSV/provider
validation/receipts/feeds/authentication and canonical source resolution are
excluded; this is generated-command evidence, not a full import-service benchmark.
See `docs/testing/finance-initial-ingestion-sizing.json` for exact groups/caveats.

| Synthetic burst                                       | One row per commit | Twenty rows per commit |
| ----------------------------------------------------- | -----------------: | ---------------------: |
| New sources / accounts                                |             80 / 8 |                 80 / 8 |
| Canonical commits                                     |                 80 |                      4 |
| Estimated transactional WRUs, canonical + publication |             41,164 |                 37,252 |
| Source-publication portion                            |             32,012 |                 32,012 |
| Bounded outbox steps                                  |              2,188 |                  1,460 |
| Strong gets (not consumed units)                      |             38,859 |                 33,635 |
| Indexed queries (not consumed units)                  |              1,132 |                  1,360 |

Batching lowers estimated writes **9.50%**, but source/index publication is
unchanged and account-window work/queries increase. Do not claim that batching
improves every cost or that these ten sampled months/account model all five years.
The existing CSV path already checkpoints every 20 processed rows; no production
batch-size, import behavior or projection protocol was changed by this probe.
Linear scaling of the batched fixture to 15,000 rows yields **6,984,750 WRUs**,
**$4.365469 writes alone / $5.675109 with 30% contingency**, before its exclusions.
This is a sensitivity, not a setup forecast or an authorized import. It replaces
neither the representative ongoing calibration nor the full retained-byte sample.
It reinforces that the $6.50 combined monthly gate is unresolved for initial
new ingestion; retain the ceiling and optimize instead of silently treating setup
as approved extra spending or running a migration.

Paid DynamoDB write rate **$0.625/million** was rechecked November 7 against
[AWS DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/). Lambda request
and EventBridge custom-event sources were also reviewed without assuming free
allowances: [Lambda](https://aws.amazon.com/lambda/pricing/),
[EventBridge](https://aws.amazon.com/eventbridge/pricing/).

The importer emitted an additional `FinanceImportCompletions` paid metric outside
the six forecast series. Completion already has a structured event, so the
redundant metric is removed while keeping success/partial logs and all failure/
security metrics. The redundant `operation` field no longer overwrites the
specific `finance.import.completed` event name. No alarm, malware check, retention,
backup, projection error signal or new paid series was removed/added. This avoids
an unmodeled series; it does not establish overall cost PASS or actual savings.

The density repeat uses **480 new rows / eight accounts / two months**, or
**30 rows/account/month**, near the user's 250/8 = 31.25 planning average. It
finishes both modes with exact verified count 60/account and no pending outbox.
One-row commits use **174,866 estimated WRUs / 12,988 bounded steps**; twenty-row
commits use **151,474 WRUs / 8,640 steps**, a **13.38%** reduction. Source writes
are unchanged between modes at **120,914**, about 251.90/source; source and
account-window metadata still dominate. Indexed queries increase from 6,732 to
8,120 when batched, so no across-the-board performance saving is claimed.

Linear 15,000-row sensitivity is **4,733,562.5 WRUs / $2.958477 direct writes /
$3.846020 including 30% contingency**. Fractional units reflect extrapolation, not
an actual billed request. Monthly word/calendar sharing matters: this is lower
than the 80-row sparse-month sample, but the same exclusions, source-text changes,
full 60-month distribution and ordinary monthly allocation still need accounting.
Neither scenario supports the combined $6.50 setup-month gate. Do not silently
subtract the setup from retention or increase the approved ceiling. The sparse
and dense results are both retained; choosing only the cheaper artifact is not
acceptance. Run with `--sources=480 --months=2` after the documented local bundle.

November 7 source-authorization overhead: generic Finance delivery now performs
canonical source/dependency point reads and repeats the touched scope, membership
and task checks before releasing a response. Reconciliation provenance adds only
private account-ID metadata beside its canonical row; there is no duplicate feed
witness or new paid metric. Legacy HTTP also rechecks canonical memberships and
loaded scope META revisions. These operations must be allocated/measured inside the
existing conditional read/write/request/compute model; they are not free operations
or evidence of headroom. Household/global stress artifacts remain conditional,
T018 is unchecked, and the combined $6.50 ceiling/30% contingency remain unchanged.

November 7 initial-import clarification: **transaction records only; no receipt
photos/PDFs are to be imported**. Naaseh currently contains no Finance data; the
five-year history will be new transaction ingestion via imports/SimpleFIN. Use
zero initial receipt objects/bytes and receipt-specific upload, scanning and
thumbnail calls for this setup scenario. Transaction import files and their
validation/staging/storage remain included where the importer needs them. Do not subtract canonical transaction ingest, source
publication, indexing, request/compute, backup/PITR or normal monthly activity.
The original receipt-heavy workload remains a separate conservative stress model,
not this household's initial import. Future manual receipt use has not been sized;
this answer does not remove the planned receipt feature. Combined AWS ceiling
$6.50/month with 30% contingency unchanged; T018 remains unaccepted, real DynamoDB
and hosted acceptance deferred, migration unrun. No receipt-volume question is
pending for initial import.

November 7 opt-in cached-source proof: stateless, user-bound encrypted dependency
metadata reuses the existing cursor secret, with no added DynamoDB rows, paid
metrics, AWS resources or permissions. Fixed 15-minute proof expiry governs only
proof freshness, never transaction retention. Canonical scope authorization
counters plus current memberships/task ACLs are checked in independent rounds and
session/PIN authorization is repeated; issuance also validates accumulated prior
page dependencies. These reads, bytes, request and compute costs are not included
as free work in the existing fixtures. Current bounds are 64 scopes, 64 groups,
128 tasks, strict 32-KiB plaintext ceiling, with fail-closed refresh on overflow.
Actual consumed capacity, batch/concurrency performance and all-household allocation
remain T018 evidence gaps; $6.50/month/30% reserve is unchanged, no cost PASS.
The web transport does not yet opt into or claim cache freshness from this proof.
Initial import remains transaction records only, zero receipt files; staging and
transaction publication still counted. No cloud operation or migration executed.

November 7 receipt assumption resolved: user expects **50 new receipts/month,
approximately2MB each**, all kept in **S3 Standard for now**, with no automated tier
transition. Model2MB as2,000,000bytes, about100MB new originals/month,600 files/
1.2GB/year,3000files/6GB afterfiveyears (a forecast horizon, not deletion policy).
Initial five-year transaction import still contains zero receipts; no existing
Finance data. Existing media bucket has no lifecycle storage-class transitions or
Intelligent-Tiering, and default uploads use Standard. Existing malware rejection,
noncurrent-version cleanup and required warm backup protections are unchanged.
No AWS change/deployment/migration ran. Ongoing receipt count/size/tier is no longer
a pending question; don't ask it again. Combined $6.50 ceiling/30% reserve stays.

### Household receipt retention sensitivity — November 7

Reproduce with Node24: `node tools/measure-finance-receipts.ts`. Offline output is
`docs/testing/finance-receipt-storage-sizing.json`; no SDK or AWS account request.
S3 uses binary billing GB (2^30bytes); the user supplied approximate decimalMB.
Use the end-of-month retained run-rate, conservatively above average monthly
billing while receipts arrive. Preserve the research reserve of one extra full
original set in versions and one in warm backups. This is not measured version
churn or35 full duplicate backups, nor a new retention deadline.

| End of month | Original files | Original decimal GB | S3 originals/month | Originals + version/backup reserves/month |
| ------------ | -------------: | ------------------: | -----------------: | ----------------------------------------: |
| 1            |             50 |                 0.1 |          $0.002142 |                                 $0.008941 |
| 12           |            600 |                 1.2 |          $0.025705 |                                 $0.107288 |
| 24           |           1200 |                 2.4 |          $0.051409 |                                 $0.214577 |
| 60           |           3000 |                 6.0 |          $0.128523 |                                 $0.536442 |
| 120          |           6000 |                12.0 |          $0.257045 |                                 $1.072884 |

Verified paid Oregon prices November7: S3Standard$0.023/billingGB-month, ordinary
warm S3backup$0.05/GB-month, GuardDuty scans$0.09/GB+$0.000215/object. At50objects/
0.1GB scans, reserve$0.01975 direct/month without free-tier credits. Current S3
tag rate is$0.0065/10000tag-months ($0.00000065/tag-month), updated from the old
$0.000001 allowance; no other original quantity is silently reduced. Public offer
sources/SKUs/publication dates are in the artifact. Python's local certificate
store initially rejected the public fetch; macOS curl with certificate verification
successfully fetched all three regional lists. No insecure TLS workaround used.

Sources: [Oregon S3 price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-west-2/index.json),
[Oregon Backup price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSBackup/current/us-west-2/index.json),
[Oregon GuardDuty price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonGuardDuty/current/us-west-2/index.json),
[S3 billing units](https://aws.amazon.com/s3/pricing/),
[Standard default](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html).

Substituting only receipt storage/scanned-object/tag quantities into the old
conditional$6.468801 stress forecast yields$6.440641 atmonth12 and$6.999385 atmonth60.
Those are incomplete sensitivities, **not accepted household totals**:1000 receipt
views/month remains an inherited stress assumption, not user input. With that
view count and2MB originals, conservatively reserve2.5GB total transfer instead of
1GB; sensitivities become$6.616141 atmonth12/$7.174885 atmonth60. Other original
compute/read/write/log/request/KMS quantities remain unchanged and newer source-
proof overhead and initial transaction ingestion still need full allocation.
The artifact keeps both cases so size-driven downloads are not silently ignored.
Reforecast/optimize actual household work within$6.50; do not approve a higher
ceiling, introduce cold tiers, expire originals or claim T018 from these figures.

November 7 receipt-view answer: user said “Say twice” to the question about total
monthly receipt views, including repeats. Use **two views total per month** as the
stated interpretation (about4MB of original-file delivery), subject to correction.
Keep **100 views/month** as the alternate “each of50receipts twice” sensitivity,
and1000/month as inherited stress. This is not an additional user requirement.
Do not silently treat1000 as household activity or change the50uploads/month,
2MB average,S3Standard/no automatic tiering,zero initial receipt import or retained
originals. The two literal interpretations differ by about$0.022932/month including
the existing30% reserve at the fixed inherited transfer price; neither establishes
overall cost acceptance.

Updated offline receipt artifact/calculator reads the household view count and
retains all three scenarios. Atmonth12, the old conditional combined quantities
with two views give$6.382609; atmonth60,$6.941353 (100views:$6.964285;1000views:
$7.174885). These are substitutions into the original stress allowances, **not a
new accepted household total or actual billing**. Canonical initial transaction
import and full current compute/read/permission-check allocation remain unfinished.
Keep the$6.50 ceiling,30% contingency and T018 unchecked; optimize/reforecast rather
than raising approval, changing tiers or deleting retained data. No account or
production change/import/migration was made. Receipt-view input is no longer
pending under the explicitly stated two-total-views interpretation.

Local read-cost correction (November 7): the new budget-update replay path no
longer loads all Finance scope rows. The existing durable fixture asserts zero
history Query commands across initial commit, identical retry and changed intent;
missing locators never scan, and foreign scope metadata/body is not fetched.
Only current membership discovery, canonical security snapshots, budget/locator,
revision/receipt and publication dependencies remain. Ordinary legacy HTTP paths
retain their existing behavior. Cache-only proof checks now perform zero feed
queries and zero membership-discovery queries; prior proof members/scopes/tasks
are still checked directly. These are generated-command assertions, not consumed
capacity or an accepted complete household forecast. Retain T018's open gate.

Protected delivery request allocation (November 7): the existing foreground
scheduler checks visible tabs every60seconds and on focus/pageshow. The new
Finance lane reuses that scheduler; it adds no timer or background AWS service.
One continuously visible authorized client can therefore make43,200 additional
protected page requests per30days; two continuously visible clients make86,400,
before focus/manual-sync actions. These are conservative activity sensitivities,
not user-reported open hours or a request cap. Locked/offline visits make none.
Each bounded page reuses its Finance cursor for the server's ordinary read so
the two server lanes can reuse one feed page per audience; ordinary payloads and
ordinary cursor from that response are ignored locally. Cache-only checks read
no feeds. Canonical security snapshots, membership discovery for delivery,
current source proofs, encryption/decryption, feed rows and response/log bytes
remain billable work. Do not fold these counts into the old20,000 incremental
request allowance without reallocation and measured execution. T018 stays open.

Source locator completeness: current supported link/snapshot/reconciliation/
review/match/reusable/transfer writes now persist their private locator atomically
like existing account/transaction/budget sources. Include these extra items in
metadata/task/receipt workflow WRUs and retained bytes. Conditions protect global
source-ID ownership; they do not add an extra successful write per existing
locator, but failed attempts/retries are not free. Account/transaction initial
ingestion already included their locators, so do not double count those. No real
backfill or billing run occurred; source-key collisions fail rather than repair
foreign pointers automatically. Cost acceptance remains open.

Retained transaction API memory: source proof headers add canonical permission
checks to the existing GET fan-out; a combined cache-only validation and before/
after memory-read checks add requests. These checks never advance feed cursors
or write server proof rows. Query typing is debounced150ms and superseded results
are discarded; debounce is not a monthly usage cap. Include proof/read/security
work and legacy whole-scope REST loading in reforecast; do not claim the bounded
query-read NFR or accepted cost from these privacy checks. Pending-only bootstrap
uses local encrypted-record keys/outbox IDs, never an AWS scan or data import.

Manual account creation now includes account-parent and opening-balance feed rows
plus their existing audience counter in its atomic setup write. Include that
work in the eight-account initial setup (still excluded from the transaction-only
ingestion calibration). Saved-result replay creates no duplicate feed or commit.
No separate feed service/index/resources were added and no AWS writes occurred.
Other legacy route feed omissions are under review; T018 remains unaccepted.

November8 local foundation follow-up: catalogue dependency metadata reads and
canonical missing-feed publication are now implemented, and account list reads/
opens/refresh-after-write use the existing snapshot proof protocol. These add
request/point-read/feed-write quantities that the earlier synthetic ingestion/
publication artifacts do not allocate as an end-to-end household bill. The CSV
visit fix adds no persistent row/resource format. No revised cost acceptance,
AWS write or permission to exceed $6.50 is claimed; T018 remains deferred.

Open workload question (November8): average visible app hours per device/day and
whether the couple normally uses two visible clients concurrently. Existing
60-second foreground synchronization makes this distinct from the answered one
broad search/day and250new transactions/100corrections monthly. The continuous
43,200/86,400 request sensitivities remain upper activity examples, not confirmed
household usage. Asked the user while completing independent local validation;
no response or revised accepted forecast has been assumed.

November 8 household usage answer: approximately ten hours/day of Na'aseh use,
including two hours for Finance/budget use. No need to re-ask these hours. The
answer did not establish concurrent device count; retain two clients as a
sensitivity rather than assume ten hours for each partner. The current controller
is installed for the authenticated session, and protected pull runs with ordinary
sync whenever it remains unlocked; it is not confined to the Finance screen.
Hence use 18,000 scheduled protected pulls per30days for one10-hour-equivalent
visible client,36,000 for two such clients. The 3,600 count based on2Finance hours
is a counterfactual unless Finance is locked outside those hours. Focus/pageshow/
manual requests are additional, and locking/offline states suppress protected
requests. No scheduler interval or automatic-lock behavior was changed.

[Foreground sizing](../testing/finance-foreground-sync-sizing.json) records the
assumptions and the actual injected SDK idle-route command counts. With an owner
proof and empty global/owner/access feeds, the handler performs3transactional
security snapshots/9items,3bounded empty feed queries, and now4rather than5strong
metadata gets, with no writes or history hydration. The redundant catalogue seed
read was removed by merging authenticated prior proof dependencies before seeding
an empty cache. Both fresh authority-check rounds, original source evidence,
contradictory-proof rejection and all canonical security snapshots remain.

For fixture items <=4KiB, paid read-unit arithmetic is23.5RRUs/protected idle page
versus24.5before, or423,000/846,000RRUs for the18k/36k scenarios. Three additional
grant items when Require PIN is on imply29.5RRUs, a code-inspection sensitivity
rather than a separately measured PIN fixture. These exclude membership discovery,
authorizer, other ordinary refreshes, active UI/cache requests, actual item sizes,
retries/compute/logs. They are not consumed capacity or an accepted total bill.
Do not add them to historical allowances without allocation or double-count
ordinary/protected requests. T018 stays open with the $6.50 ceiling unchanged.

Capacity rules verified against official AWS documentation November8:
[read-unit calculation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html)
and [Query consumption](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Other.html).
The23.5/29.5figures use minimum empty-query charges, not a live upper bound;
empty/sparse partitions can incur extra read charges. Projection expressions
do not reduce charged full-item sizes. No dollar-price or accepted bill was
recalculated from this incomplete idle-path measurement.

November8 source/cache follow-up: post-save transaction refresh uses a targeted
canonical row and parent graph (two rows for a transfer), not another legacy
whole-history graph load. Actual injected SDK fixture asserts0Query/0write
commands on that read and no scope fallback for missing/foreign locators. New
API-memory derivation merges current proof dependencies and verifies both
ingredients without persisting plaintext. Merchant-detail and task-link opt-in
proofs add scope/task checks only to requested reads, without a new timer. Pending
staging preservation and trust checkpoint invalidation are local IndexedDB work
and add no AWS resources. Complete active-view/targeted-parent/task proof request
and byte/compute allocation remains unaccepted; none of the earlier stress
artifacts becomes an end-to-end household bill. Keep $6.50/30% and T018 open.

Known ordinary-task revocation fence (November8): local invalidation occurs after
ordinary cursor commit, preserves queued staging/intent/bytes, and adds no server
request or timer. It is deliberately coarse while proof dependencies are opaque:
a task tombstone can require a Finance refresh even when unrelated. The later
fresh Finance visit and its existing GET/proof work still need request allocation.
No cost gate, ceiling increase or resource deployment is accepted by this change.

## November 9: bounded protected catch-up quantities

The PWA can now read up to five protected feed pages in one existing foreground
cycle, only while server continuation is indicated. Idle polling remains one
protected request per cycle; the ten-hour assumptions are unchanged. A dense,
synthetic one-audience 15,000-event backlog still requires about 75–76 HTTP pages,
but can use 15–16 foreground cycles instead of 75–76. This is request-count
arithmetic, not an import/latency or complete-history guarantee. Logical
transactions can create multiple events across audiences.

[The catch-up sizing record](../testing/finance-catchup-sizing.json) distinguishes
idle quantities from continuously full backlog sensitivity. For one ten-hour
visible/online/unlocked equivalent client, 18,000 scheduled cycles remain 18,000
idle protected calls. If every cycle had five full continuation pages, the stress
upper scenario is 90,000 protected calls (72,000 additional); two clients double
these quantities. This is not the expected household forecast. Each extra request
runs existing authorization, per-audience queries/proof checks and local encrypted
checkpoint work; extra dependency reads and compute remain unallocated until
measured. No new AWS resource, scheduler, price assumption or cost acceptance is
added. The $6.50 combined ceiling including 30% contingency remains unchanged;
migration, live capacity and hosted acceptance stay deferred.

## November 9: reusable creation replay quantities

The protected sync adapter now creates a queued reusable source using its stable
ID and targeted parent graph. The source loader uses a code-derived bound of
`6 + 2*A + 2*R` point Gets, where A≤50 related group accounts and R is one category
plus an optional merchant. This is 8 Gets with no accounts/one category, 10 with
one account, 24 with eight accounts and one category, and 110 at the contract stress
maximum with 50 accounts/two references. These are source-graph operations, not
billed read units or the entire HTTP request. Existing receipt reads/authorization,
canonical session/PIN checks, membership discovery/rechecks, transactional writes,
proof checks and subsequent feed delivery remain additional work.

[The reusable replay sizing record](../testing/finance-reusable-replay-sizing.json)
retains those exclusions. Injected SDK tests verify zero Finance history queries,
no foreign-scope body reads, preserved target/unrelated catalogue counters, stable
idempotent creation and protected feed delivery; they do not meter real DynamoDB.
No new household reusable-creation frequency or lower price is assumed. Existing
Lambda, gateway proxy, table, IAM and feed are reused; no resource was deployed.
The $6.50 monthly combined ceiling including 30% contingency remains unchanged.
Extra source/proof/compute work is not accepted as covered by an old allowance;
T018, actual capacity/runtime/cost and migration remain deferred/open.

For a replay into a scope with missing metadata, a known canonical row holds the
operation pending for trusted repair. Otherwise one strongly consistent key-only
Query (`PK = :pk`, `Limit:1`, projection `PK, SK`) checks the namespace. Any row,
surviving publication state or continuation also keeps replay retryable without
writes. Only an empty namespace may initialize metadata, fenced by conditional
META creation. This is not a history fallback or automatic metadata repair.
Legacy state remains unchanged and the migration remains unrun. The conditional
query is additional to the point-Get formula and must be included in metered cost
acceptance. Existing-metadata replay fixtures use zero Finance history queries.

Client-selected reusable IDs are also fenced against the other supported Finance
source-locator namespaces in the canonical transaction. At this checkpoint these
are 13 additional negative condition checks for a new creation; their transactional
read cost is separate from the point-Get formula. A known cross-type ID conflicts
without foreign body reads or any partial canonical/counter/feed writes. Exact
saved retries do not create or charge those checks again. No new registry table,
namespace migration or IAM permission was introduced.

## Administrator parity and protected budget snapshots — 2026-11-09

Administrator access uses the same owner/member graph and PIN/session checks as
ordinary access. It introduces no administrator Finance shard, extra table, IAM
permission, migration or scheduled job. Eligible administrators contribute ordinary
user workload; their access must not be treated as a zero-request exception.

Budget snapshots add current-source verification to existing legacy reads. A single
successful initial directory refresh makes three Finance GETs, one proof merge and
a complete retained read (two proof-only requests): six Finance HTTP calls. A
refresh including a selected detail adds one GET: seven. Opening a retained budget
first verifies its prior token (two proof-only requests), then refreshes directory
and detail: nine. Successful creation with N successful account links ordinarily
makes two pre-save proof checks, one create, N link writes and a seven-call canonical
refresh: 10+N. These are source-path request quantities, excluding authentication
freshness traffic, unrelated sync, retries and failed/racing requests; concurrent
read leases can coalesce checks. An item callback can currently request refresh
for both its optimistic and saved state, up to two seven-call refreshes. This is
an outstanding optimization opportunity, not evidence of zero extra work.

Each proof request still reads current permissions and source lineage; do not count
these checks as feed cursor advances or reuse the old cost acceptance. Legacy
budget/account directory reads still hydrate their authorized scopes. No real
DynamoDB/hosted latency, capacity or combined-cost acceptance is claimed. Retain the
$6.50/month combined ceiling including 30% contingency, the existing 10-hour overall
(including two Finance-hour) daily assumption and separate one/two-client sensitivity.
The number of simultaneously visible clients remains unconfirmed. Migration is
unrun, transactions have no automatic retention expiry, and original receipts stay
in S3 Standard.

### Household concurrency answer — November 9, 2026

Steve confirmed usually two visible devices simultaneously. Use that as the
primary household scenario during the already confirmed ten-hour daily Na'aseh
window, including two Finance hours. The one-client case is now a sensitivity.
At the unchanged 60-second visible/online/unlocked scheduler and 30-day month,
this means36,000 scheduled protected pulls and72,000 ordinary-plus-protected
core requests, excluding focus/manual calls and other sync/API traffic. The
existing injected idle fixture's small-item arithmetic is846,000 protected RRU
without PIN or1,062,000 with PIN, before active-group/source work; these are
planning quantities, not AWS metering, an upper bound or a combined accepted bill.
No new traffic allowance or $6.50 ceiling increase is implied. Authentication,
groups, proof reads, active operations, compute and other costs remain accountable;
do not add traffic twice against existing allowances. Real DynamoDB/hosted
acceptance remains deferred; no migration or production operation is authorized.
Do not re-ask the device count or the already confirmed household inputs.

### Match review and concurrency accounting correction — November 9

Match review now retains verified source snapshots. A successful load makes one
canonical GET, one proof merge and two retained-read checks: four Finance HTTP
calls. A decision uses two prior checks, one POST and that four-call canonical
reload: seven. Removal preview uses two prior checks, one preview GET, one proof
merge and two retained-read checks: six. Authentication, group/source reads,
ordinary sync, compute, failed/racing/retried requests and coalescing are separate.
See finance-match-snapshot-sizing.json in docs/testing; no new timer/resource.

The two-device answer confirms client count. The36,000 protected-pull scenario
still assumes both clients stay online, visible and Finance-unlocked for ten
hours. PIN grants expire after at most30minutes; the ten-hour PIN-on quantity
would require repeated explicit unlocks. Do not present it as observed activity.
If both instead keep Finance unlocked only for the two included Finance hours,
protected pulls are7,200 but ordinary pulls still span ten app hours:36,000,
for43,200 ordinary-plus-protected core requests. One equivalent client gives
18,000 ordinary plus3,600 protected =21,600. The earlier counterfactual artifact
incorrectly limited ordinary sync to two hours too; its7,200 core total is
corrected to21,600. No scheduling or PIN-expiry behavior was changed. Group
membership/source work remains outside the owner-only fixture. Shared versus
private account layout is the next requested forecast input. No new dollar
forecast, cost acceptance, migration or ceiling increase is claimed.

November 9 follow-up: Steve confirmed a mix of private personal and shared
accounts. Do not model all eight as exclusively private or exclusively one shared
group, or infer a numerical split. Device count remains two simultaneously visible
clients. He also requested models per budget with a dashboard overview; the meaning
of models (in-app financial planning versus AWS cost estimation) is being clarified
before changing specification or implementation scope. No new story is claimed
implemented from this ambiguous wording. Current validation proceeds independently.

### Reusable source snapshots — November 9

Current client paths add existing source-proof checks: item refresh4 Finance HTTP
calls; opening its form2; online create plus canonical refresh7; offer loading7
(two prior checks, budget/offer GETs, merge and two final read checks); copy plus
canonical reload10; removal preview6; returning to budgets2. These are online
source-path quantities, excluding auth freshness, other sync, retries/failures,
coalescing and the capacity/compute behind each request. Legacy GET hydration is
still accountable. Valid offline leases do not make online proof calls; the
existing encrypted reusable queue is preserved. See the reusable-snapshot sizing
artifact in docs/testing. No new timer, resource, accepted dollar forecast or
permission to exceed $6.50 including30% contingency. Both budget forecast methods
are now selected but not implemented; these security-path quantities do not price
the future forecast algorithms. No migration or AWS operation was run.

### Forecast input scope kernel — November 9

User permits non-budgeted history only by explicit request; budget-only actuals and
reports stay budget-assigned. The new shared selection policy does no I/O, adds no
runtime route/poller/resource or persistent field, and currently has no model/UI
consumer. Zero direct AWS operations from this selector is not a free forecast
service estimate. Model algorithms, bounded input reads and dashboard work are
tracked additively in T160–T166 and still need workload/capacity/compute pricing
under the existing $6.50 including30% ceiling. No new model API/service or migration
is authorized by the pure kernel. Historical budgets/transactions remain retained
unless explicitly deleted under existing rules; training never reassigns them.

The proof-backed transaction removal preview uses four application requests
when verification calls run separately. It checks the parent snapshot, fetches
the preview, combines its evidence through cache-only pull, then verifies the
combined snapshot before displaying the impact. It previously used one GET.
The GET retains its existing deletion-preview persistence and scope-loading
behavior. Budget and match routes use the same scope-loading path when issuing
proofs. Neither change adds a timer or AWS resource. Include the additional
verification work in the open cost estimate under the $6.50 combined ceiling.

The account removal preview now has the same four application request steps
when checks run separately. The existing preview GET still uses scope loading
and persists the short-lived confirmation. Match source checks reuse the
already loaded account and budget rows. They add no network calls on their own.

November 10 CSV queue changes add no AWS resource or new request path. The
generic sync loop now holds unsupported CSV chunks locally and makes no push
request for them. The later recovery review and dispatch need their own
request and storage measurements before cost acceptance.

Saved CSV inspection uses the existing account snapshot verification and
account-indexed local reads. The inspection itself creates no cloud rows or
new API endpoint. Canonical duplicate checking and reviewed dispatch remain
unmeasured.

The saved CSV comparison uses one bounded account-index Query and at most two
fact BatchGet requests, plus current membership and account coverage checks
before and after the read. The displayed request holds at most 100 input rows.
A comparison that would require a continuation reports an error. It adds no
scheduled work or AWS resources. Real DynamoDB cost and latency remain
unmeasured.

Saved CSV pagination adds no new endpoint or AWS resource. Each explicit
duplicate check still uses the existing bounded comparison for one displayed
page. Paging itself verifies the encrypted local batch and uses the existing
account access check.

Reviewed saved CSV submission reuses the existing import endpoint and its
100-row chunk limit. For a successful batch of N included rows, the browser
sends ceil(N / 100) import requests, plus existing account verification and
refresh. A retry may repeat those requests with the same batch and chunk
identity. Local encryption and queue acknowledgement require no AWS
resource. The existing import handler's hydration, storage and publication
costs remain part of the open measurement.

Category and merchant removal previews now request the existing Finance
source proof and use cache-only checks before display and confirmation.
The preview still uses the existing catalog scope reads and preview
persistence. Account these checks per explicit preview or confirmation.
Real DynamoDB cost and hosted latency remain unmeasured.

Provider reconciliation adds a protected comparison check before the existing
mutation. A successful decision reloads the existing transaction graph,
including the review-issue list and one transaction request per accessible
account. It adds no scheduled work or infrastructure resource. Include the
full graph refresh in cost measurement before accepting the combined ceiling.

Allocation and transfer confirmation refresh only the affected transactions
through the existing point-read route. The allocation view requests one
transaction and the transfer view requests its two legs. The SDK integration
fixture verifies that the route uses no scope query or write. Include the
pre-dispatch, point-read and post-refresh proof checks in the action cost.
Real DynamoDB read cost remains unmeasured.

Account name and manual balance edits now verify the retained account
before dispatch. The existing post-write account-list refresh remains
the source of the displayed result. Include the pre-dispatch proof check
when measuring these edits. The budget retry checks use records in the
existing repository load.

Budget/account link replay adds no AWS resource, index, timer or background request.
Each active link has one small deterministic singleton in the existing table and its
normal link transaction includes one additional transactional write. The one-time
trusted preparation reads bounded link pages and writes only missing or stale singleton
evidence. As a scale illustration, 1,000 sub-1-KB active-link singleton writes are at
most 2,000 transactional write request units, about $0.00125 at the rate already used
in this estimate, and consume well under 0.001 GB. These operations fit within the
existing 1,000,000 combined WCU, 3,000,000 reads and 1 GB storage allowances; they do
not change the conditional $6.466201 monthly total or the approved $6.50 ceiling with
30% contingency. This is arithmetic, not measured billing or T018 acceptance. The
migration remains unrun.

Budget-item replay adds no storage row beyond the item and mutation receipt already
required by an ordinary idempotent item write. It replaces whole-scope hydration with
strongly consistent point reads for the budget, item/receipt, category and optional
merchant/reusable source, each related account, and each related account's existing pair
singleton/link. Browser queueing is local. Include those point reads in the eventual
measured action cost; the current arithmetic remains within the existing read allowance
and does not change the conditional $6.466201 monthly estimate or $6.50 ceiling.
