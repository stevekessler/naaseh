# Google Tasks synchronization operations

## Google Cloud setup

1. Create or select the non-production/production Google Cloud project and enable the Google Tasks
   API.
2. Configure the OAuth consent screen, authorized support/contact domains, privacy policy, and the
   exact test or production users required while the app remains in testing.
3. Create a Web application OAuth client. Register exactly the deployed
   `/api/v1/integrations/google/callback` HTTPS URL; do not use wildcard or alternate redirects.
4. Store this JSON in the provisioned Secrets Manager secret:

   ```json
   {
     "clientId": "...",
     "clientSecret": "...",
     "redirectUri": "https://HOST/api/v1/integrations/google/callback"
   }
   ```

5. Verify that consent requests only `https://www.googleapis.com/auth/tasks`. Complete Google's app
   verification before general production use if Google requires it.

Refresh tokens are KMS-encrypted with an encryption context containing purpose, user ID, and
connection ID. The reconciler can decrypt and read the OAuth secret; the stream-ingestion Lambda
cannot. OAuth state is one-time, session-bound, PKCE-protected, and expires after ten minutes.

## Runtime and quota

The DynamoDB stream creates deterministic outbound intents. A five-minute EventBridge rule polls
active connections in bounded batches; each Google Tasks page is limited to 100 items with a
five-minute checkpoint overlap. One conditional lease prevents overlapping runs per connection.
Provider retries use capped exponential backoff with jitter. Malformed or exhausted items are
quarantined without blocking the rest of a page, and checkpoints advance only after item boundaries.

Google Tasks has project/user quotas that may change. Review the current Google Cloud quota page
before each production rollout. Alarm on throttles rather than raising quotas blindly; cap Lambda
concurrency first, inspect request volume, and request a quota adjustment only after confirming
idempotency and cost bounds.

## Monitoring and alarms

The `Naaseh` CloudWatch namespace includes authorization failures, revocations, throttles, run
failures, lag seconds, checkpoint stalls, conflict growth, and quarantine growth. Logs are retained
for 30 days. Events permit only IDs, direction, outcome, latency, attempt count, HTTP status class,
safe error code, and checkpoint age. Titles, dates, notes, provider bodies, OAuth values, conflict
candidates, ciphertext, and key material are permanently redacted.

Respond as follows:

- **Authorization/revocation:** confirm the connection is `reauthRequired`; ask the owner to reconnect.
- **Throttle:** check Lambda concurrency and Google quota, then allow bounded retry to recover.
- **Checkpoint stall/run failures:** inspect safe correlation/run IDs and lease age; an expired lease
  is recoverable by the next run.
- **Quarantine growth:** use the owner retry control for isolated records. For systemic schema errors,
  pause rollout and deploy a compatible parser before retrying.
- **Conflict growth:** verify both stores remain reachable; conflicts are user decisions, not operator
  data to inspect.

## Rotation, revocation, recovery, and teardown

Rotate the OAuth client secret by writing a new Secrets Manager version and validating a disposable
connection. Existing refresh tokens remain encrypted under KMS. Rotate the KMS key through the
existing key policy/alias process and retain old key versions for the lifetime of backups.

For an incident, pause active connections when safe, preserve content-free correlation evidence,
revoke the OAuth client or affected refresh tokens in Google, and set affected connections to require
reauthorization. Never put provider response bodies in tickets or logs.

An isolated backup restore must report every credential to invalidate and every pending/retry/running
operation to cancel. Before restored data serves traffic, destroy restored refresh-token ciphertext,
set connections to `reauthRequired`, cancel pre-restore effects, and require fresh consent. See
[recovery.md](./recovery.md).

For teardown, pause the schedule, wait for active leases to expire, disconnect test accounts, revoke
tokens, remove only Na'aseh-origin disposable Google tasks if approved, then delete the OAuth secret,
client, Lambdas, alarms, and rules according to retention policy. Never delete user-owned Google
lists or Google-origin tasks as part of automated teardown.
