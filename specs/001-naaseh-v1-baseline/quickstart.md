# Quickstart Validation: Na'aseh v1 Baseline

This guide defines runnable validation scenarios for the completed v1 implementation. It is
not an implementation script. Commands are finalized when the repository scaffolding exists.

## Prerequisites

- Node.js 24 and npm
- Python 3.12+ with the dependencies in `scripts/requirements.txt`
- Current stable Chrome and Safari on macOS
- Xcode/Safari tooling for iPhone and iPad simulator or physical-device validation
- AWS CLI credentials for a non-production sandbox
- Bootstrapped AWS CDK environments in `us-east-1` and `us-west-2`
- GitHub OIDC roles for staging validation

## Local Setup

```bash
npm ci
npm run build
npm run test
npm test -- tests/contract
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=webkit
python3 -m unittest discover -s scripts/tests
```

Expected: type checking, unit/property tests, OpenAPI validation, contract tests, and both
browser projects pass with no network calls to production resources.

## Sandbox Deployment

Build the PWA, synthesize both stacks, then run **Deploy staging** in GitHub Actions with a
delegated staging DNS name and hosted-zone variables configured as described in
`docs/operations/first-aws-deployment.md`.

```bash
npm run build -w '@naaseh/web'
npm run cdk:synth
```

Expected: CDK creates only reviewed resources; the private S3 origin is inaccessible
directly; CloudFront serves the PWA over HTTPS and redirects HTTP; API responses use safe cache headers, correlation
IDs, and no secret-bearing logs. GitHub Actions uses OIDC rather than stored AWS access keys.

## Scenario 1: Authentication and Provisioning

1. With an IAM principal permitted only to invoke the provisioning function, run
   `python3 scripts/create_user.py --function-name "$NAASEH_PROVISION_USER_FUNCTION" --username steve --display-name Steve --role admin`; enter and
   confirm the password and PIN at the hidden prompts.
2. Repeat for a standard user with `--role user`, then verify a duplicate canonical username
   fails without creating a partial record.
3. Verify password/PIN values do not appear in the process list, shell history, stdout,
   stderr, CloudWatch, or the returned user view.
4. Verify an admin can add/list/disable/reactivate users and create/update/archive categories;
   verify a regular user receives `403` for every mutation while retaining category read access.
5. Verify the admin cannot view or mutate another user's private tasks, hidden-memo plaintext,
   revisions, or group settings solely because of the admin role.
6. Attempt login with valid, wrong-password, and unknown-user inputs.
7. Verify generic failures, rate limits, and comparable unknown/wrong-password work.
8. Inspect DynamoDB and CloudWatch: only PHC verifier/token digests and safe event context exist.
9. Verify logout and user disablement revoke the session and clear/lock browser data.

Expected: valid login completes within two seconds p95; Argon2id verification uses at least
100 MiB, parallelism 1, and at most one second p95 on the deployed auth Lambda.

## Scenario 2: Tasks, Subtasks, Revisions, and Views

1. Create categories with default assignees and logo-derived colors.
2. Create a fully populated task and nested subtask; edit, complete, reopen, and archive them.
3. Confirm each accepted mutation has one logical immutable revision after replay.
4. Switch between list and post-it views while filters/search remain active.
5. Complete a post-it with normal and reduced-motion preferences.
6. Run axe checks and keyboard/touch viewport tests on desktop, iPhone, and iPad profiles.

Expected: category defaults and color apply, revisions are complete, no cycles are accepted,
and crumple/non-motion treatments preserve state and accessibility.

## Scenario 3: Visibility, Groups, and Private Tasks

1. Create three users and a six-digit-PIN group; join with correct/incorrect PINs.
2. Create a public group-associated task and verify all active users can see it.
3. Create a private task and verify only its owner receives it from bootstrap/pull/direct GET.
4. Change public to private while another client is offline, then reconnect that client.
5. Verify the public tombstone purges the cached task and no label/memo/revision leaks in logs/search.

Expected: groups never hide public tasks; private tasks are owner-only in live data,
sync feeds, direct access, revisions, local indexes, counts, and logs.

## Scenario 4: Offline Mutation and Conflict

1. Bootstrap, request persistent storage, then emulate offline mode.
2. Create/edit/complete tasks and reload the browser.
3. Verify local entity and outbox records remain atomic and visibly pending.
4. In a second browser, edit the same and different fields online.
5. Reconnect the first browser and drain the outbox twice.

Expected: duplicate replays create no duplicate revisions; non-overlapping changes may merge;
same-field and update/archive conflicts require resolution; no local text is silently lost.

## Scenario 5: Search and Hidden Memos

1. Search public/private authorized labels and ordinary memos online and offline.
2. Create a hidden memo and verify ciphertext plus all required wraps are stored.
3. Lock it and confirm memo tokens/results disappear from the in-memory index.
4. Disconnect, unlock with the correct PIN, and search it locally.
5. Copy persisted browser records without the usable key and confirm plaintext is absent.
6. Test wrong PIN attempts and the documented residual offline brute-force limitation.

Expected: hidden memo plaintext and tokens never persist; offline unlock works; package AAD
tampering fails; the active `us-west-2` recovery wrap is present before sync is acknowledged.

## Scenario 6: Reminders and Browser Limits

1. Grant permission from a user gesture and schedule a due task.
2. Keep the PWA open, disconnect, and verify the local reminder fires from IndexedDB.
3. Close the app while connected and verify generic Web Push delivery.
4. Close and disconnect the app; reconnect after due time and verify overdue display on open.
5. Repeat on installed iPhone/iPad Home Screen mode and ordinary Safari tab.

Expected: the UI clearly distinguishes supported local, Web Push, and overdue fallback
behavior. It never promises closed-and-offline delivery or exposes private task text in push.

## Scenario 7: Logging and Verbose Mode

Run representative success, validation, conflict, retry, authentication, crypto, and recovery
paths with `VERBOSE_LOGGING` absent, false, malformed, and literal `true`.

Expected: only literal `true` enables additional safe detail; every mode uses the same
allowlist/redaction. Correlation IDs connect API/Lambda events. Passwords, PINs, sessions,
CSRF tokens, memo text, search tokens, DEKs, peppers, and push private keys appear zero times.

## Scenario 8: Backup and Cryptographic Restore

1. Assert the synthesized production template creates resources only in `us-west-2` and has
   no DynamoDB replica, cross-Region copy, replicated secret/key, or passive application stack.
2. Seed every entity and at least one hidden memo under every retained recovery key version.
3. Record a signed backup manifest and force PITR/AWS Backup recovery points into the locked
   same-Region vault.
4. Simulate loss of the active table while retaining the referenced recovery keys/secrets.
5. Run the isolated restore workflow in temporary `us-west-2` resources.
6. Validate entity counts/hashes, authorization, key registry, private-task exclusion, and
   owner-mediated memo recovery through the retained recovery wrap.
7. Record achieved recovery point/time, evidence, and cleanup of isolated resources.

Expected: no more than five minutes of acknowledged server data is absent, full service is
recoverable within four hours, 100% of sampled hidden memos decrypt for their authorized
owners, routine operators see no plaintext, and missing key material fails the restore.
The report must also state that total Region loss is not covered by the v1 design.

## Scenario 9: Release Gate

GitHub Actions must pass lint, typecheck, dependency/security scanning, unit/property,
integration, contract, CDK, Chromium/WebKit, accessibility, and staging smoke checks. A human
then completes the real Safari/iPhone/iPad matrix and records evidence before production
environment approval.
