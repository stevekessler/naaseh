# Native Apple AWS cost review

Reviewed 2026-10-08. Architecture result: **no new AWS service or fixed monthly resource**.

Native compatibility and telemetry reuse the request-driven sync Lambda, HTTP API, DynamoDB table, existing CloudWatch log group/alarms, existing notification Lambda, EventBridge Scheduler, Secrets Manager/APNs secret, and current transfer path. CDK assertions reject any telemetry-specific data store, queue, topic, or log group. No beta environment is created.

## Incremental planning workloads

| Native workload                                            | Current evaluation (about 50 users) |       1,000 users | Cost-sensitive service               |
| ---------------------------------------------------------- | ----------------------------------: | ----------------: | ------------------------------------ |
| Compatibility checks, 4/user/day                           |                         6,000/month |     120,000/month | HTTP API + Lambda                    |
| Telemetry batches, 1/user/day                              |                         1,500/month |      30,000/month | HTTP API + Lambda + logs/metrics     |
| Native reminder deliveries, 5/user/day                     |                         7,500/month |     150,000/month | Existing Lambda/Scheduler + transfer |
| Installation rows, 3/user                                  |                                 150 |             3,000 | Existing DynamoDB on-demand table    |
| Content-free telemetry, 1 KiB/batch upper planning average |                  about 1.5 MB/month | about 30 MB/month | Existing CloudWatch log group        |

At 1,000 users this adds roughly 300,000 API/Lambda invocations per month before retries, well below one million. At published reference rates, HTTP APIs start around $1 per million requests and Lambda requests at $0.20 per million; execution duration, DynamoDB, metrics, and transfer add usage charges. Thirty MB of custom logs is roughly $0.02 at a $0.50/GB reference rate. Scheduler’s published free tier includes 14 million invocations/month, though account-wide usage and eligibility must be checked. These figures imply a native-only increment of approximately **$0.50–$5/month at 1,000 users** under the stated workload, with no fixed-cost addition; APNs itself has no repository-modeled AWS service fee.

This is a planning estimate, not a quote. The existing application baseline remains the broader `$16–$32` ordinary-month estimate (and `$21–$57` restore-test month) documented in `docs/operations/aws-cost-review.md`. Before expanding TestFlight, compare Cost Explorer/API Gateway, Lambda GB-seconds, DynamoDB, Scheduler, transfer, Secrets Manager, and CloudWatch actuals against this workload. Explain any native increment above `$6/month` (20% above the high estimate) before rollout.

Pricing references checked on 2026-10-08: AWS HTTP API pricing (`https://aws.amazon.com/api-gateway/pricing/`), Lambda pricing (`https://aws.amazon.com/lambda/pricing/`), EventBridge pricing (`https://aws.amazon.com/eventbridge/pricing/`), and CloudWatch pricing (`https://aws.amazon.com/cloudwatch/pricing/`).
