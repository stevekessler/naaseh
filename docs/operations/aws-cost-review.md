# AWS cost review

Last reviewed: 2026-08-30

The application workload uses `us-west-2`: CloudFront/S3, HTTP API, Lambda, DynamoDB on-demand,
EventBridge Scheduler, KMS, Secrets Manager, CloudWatch, and AWS Backup. A small `NaasehEdge`
control stack in `us-east-1` holds the CloudFront certificate and WAF for
`https://gsd.thepandas.link`; it does not duplicate application data. Primary cost drivers are
requests and storage, CloudFront transfer, WAF requests, Argon2 Lambda GB-seconds, GuardDuty S3
malware scans, Step Functions/DynamoDB point-in-time exports, attachment transfer, same-Region
recovery-point retention, KMS/secret monthly charges, logs, and quarterly temporary restores. The
public ACM certificate and Route 53 alias records do not add a per-certificate or alias-query fee.

## Low-traffic monthly estimate

For a personal deployment with fewer than 10 users, under 100,000 CloudFront/API requests, under
5 GB of application and backup data, and modest logs, budget **$16–$32 in an ordinary month**.
A quarterly restore-test month may be **$21–$57**, depending on restored data size, object count,
runtime, and log volume. This is a planning range, not a quote, and excludes tax, support plans,
domain registration, unexpected attack traffic, and Free Tier or account-level credits.

| Cost area                                             | Expected monthly amount | Basis                                                                                                 |
| ----------------------------------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------- |
| WAF                                                   |              about `$8` | One `$5` web ACL plus three `$1` custom rules; request charges are negligible at assumed traffic      |
| Six KMS keys                                          |    about `$6` initially | Includes isolated export and Crisis Plan sharing keys; retained rotations can raise this over time    |
| Two Secrets Manager secrets                           |           about `$0.80` | `$0.40` per secret plus low request volume                                                            |
| Lambda, HTTP API, DynamoDB, S3, CloudFront, Scheduler |                 `$0–$3` | On-demand low traffic; often inside service free allowances, but the estimate does not depend on them |
| CloudWatch logs/metrics and notifications             |                 `$1–$6` | Forty synthesized Lambdas share 15 bounded log groups plus alarms; ingestion is usage-sensitive       |
| PITR, AWS Backup, versioned media, restore workflow   |                `$1–$10` | Highly dependent on stored data, object churn, and retained recovery points                           |
| GuardDuty attachment scans and CSV exports            |                 `$0–$5` | Driven by uploaded GB/object count and operator export frequency                                      |
| Quarterly restore-test increment                      |  `$5–$25` in test month | Temporary restored resources, requests, Lambda/Step Functions, and logs                               |

AWS currently publishes WAF pay-as-you-go prices of `$5` per ACL, `$1` per rule, and `$0.60` per
million requests. Secrets Manager lists `$0.40` per secret-month, and KMS examples use `$1` per
customer-managed key-month. CloudFront's standard monthly allowance can cover low-volume delivery,
but consolidated billing and pricing-plan choices can change what is free. Review current official
[WAF pricing](https://aws.amazon.com/waf/pricing/),
[KMS pricing](https://aws.amazon.com/kms/pricing/),
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/),
[CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/), and
[AWS Backup pricing](https://aws.amazon.com/backup/pricing/) before approving a budget.

The sixth KMS key is the RSA-3072 Crisis Plan sharing key. Asymmetric broker decrypt requests are
usage-metered and excluded from the general KMS request free tier; the design therefore uses one
shared-purpose key, two units of broker reserved concurrency, DynamoDB TTL replay receipts, and no
always-on compute or per-user key. Restore testing is also usage-based: AWS charges per evaluated
recovery point and, for applicable resource types, restored storage. Keep feature-release and
quarterly restore exercises isolated, short-lived, and fully cleaned up, but do not skip them.

The current scope deliberately removes global-table replica writes, a passive application stack,
cross-Region backup copies, replicated secrets/media, and recovery-account keys. That reduces cost
and operational complexity but accepts that total `us-west-2` loss is not recoverable in v1.
OpenSearch, containers, NAT gateways, and always-on databases remain excluded. The stack does not
currently create an AWS Budget; configure account-level actual and forecast alerts before the first
deployment. Retention and verbose logging stay bounded without weakening PITR, Vault Lock,
key-version retention, or restore testing.
