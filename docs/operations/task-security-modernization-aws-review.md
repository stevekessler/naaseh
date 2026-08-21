# Task security modernization AWS review

Date: 2026-08-14

## Topology and synthesis scope

Feature 009 retains the existing request-driven topology: CloudFront/S3, regional WAF/API Gateway, bounded Lambda, on-demand DynamoDB, KMS, private S3 export results, Step Functions, CloudWatch/SNS, PITR, AWS Backup, and CloudTrail. The only new dedicated compute role is a low-concurrency, IAM-invoked administrator-factor recovery Lambda. There is no scheduler, WebSocket, Redis, RDS, Cognito, or passive timer compute.

CDK assertions review:

- factor encryption/decryption is restricted by key policy and user encryption context;
- the recovery operator may invoke recovery but cannot decrypt factor ciphertext;
- application roles cannot invoke the operator path;
- export objects remain private, KMS encrypted, owner-authorized, integrity-gated, and lifecycle bounded;
- DynamoDB remains on-demand with PITR and Backup coverage;
- WAF/rate-limit scope includes authentication/reset surfaces;
- CloudTrail captures attributable recovery invocation and relevant KMS/Secrets policy events;
- log retention separates ordinary application data from authentication/recovery evidence.

## Scale and cost assumptions

The initial deployment is approximately 50 users. DynamoDB and Lambda scale per request. Timer ticks and repeat boundaries generate zero AWS traffic; only timer commands/sync do. Completion exports scale with selected rows and temporary S3 retention. Incremental cost drivers are login-time KMS decrypts, sync requests, export Lambda/Step Functions/S3/KMS work, recovery CloudTrail data events, WAF evaluations, and bounded logs/metrics/alarms.

The implementation uses bounded pagination (100 admin users), capped local combobox rendering, a single timer aggregate per owner, and asynchronous 10,000-row export processing. No high-cardinality task/user identifiers are metric dimensions.

## Deployment gates

`npm run cdk:synth` and infrastructure tests are the local gate. Production deployment must additionally verify the synthesized account/Region values, real IAM denial paths, WAF sampling without protected request data, CloudTrail recovery attribution, export lifecycle, PITR/Backup selection, dashboards/alarms, and cost alarms. Total `us-west-2` Region loss remains outside v1 recovery scope.
