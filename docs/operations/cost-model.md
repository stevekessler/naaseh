# Archive and Reporting Cost Model

The feature remains serverless: on-demand DynamoDB, request-driven Lambda/API Gateway, scheduled
reconciliation, and Step Functions only for multi-stage Task/List deletion. Direct empty
Category/Project deletion does not start a workflow. Step Functions is retained because attachment
and dependent-record purge needs durable checkpoints and retries; replacing it with synchronous
Lambda would weaken recovery while saving little at the expected low delete volume.

Workload projections add bounded transactional counter/pointer writes on lifecycle or assignment
changes. Completion reporting initially uses bounded reads and no new GSI, avoiding permanent index
storage while volume is modest. Monitor consumed capacity, report p95, scan pages, reconciliation
drift, and deletion transitions monthly. Add a user/time CompletionEvent GSI only after measured
read cost or latency justifies its ongoing write/storage cost. Cheaper alternatives are client-only
reports, fewer reconciliation runs, and DynamoDB export analytics; each sacrifices freshness or
authorization-safe server parity.
