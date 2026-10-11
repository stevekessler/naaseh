# Native production readiness and deployment confirmation

TestFlight builds use the existing production origin, `https://gsd.thepandas.link`. Complete this
procedure after the native/API pull request is merged and before signing in from a production-backed
Apple build. It does not create a staging stack or any always-on AWS service.

## 1. Review what the deployment will change

1. Start from the merged `main` branch and an unchanged working tree.
2. Run the repository's pre-AWS validation, including the full browser release gate.
3. Synthesize `NaasehProd` using the command in `docs/operations/release-with-aws.md`.
4. Review the CDK diff. Expected native additions are routes for compatibility and telemetry,
   native installation records in the existing table, APNs delivery in the existing notification
   Lambda, and bounded metrics in existing log groups/dashboards.
5. Confirm the diff creates no additional table, queue, topic for mobile push, always-on compute,
   standalone native environment, or second APNs secret.
6. Because Google Tasks is retired, confirm the diff removes its API routes, Lambdas, schedule,
   stream mapping, dashboard widget, and OAuth secret resource from the template. The old secret was
   configured with a retain policy, so CloudFormation removal does not prove the retained secret was
   deleted.

Stop if the diff contains any unexplained replacement of the production DynamoDB table, KMS keys,
CloudFront distribution, or user-data store.

## 2. Deploy through the protected production workflow

1. Create a release ticket/reference for the merged commit.
2. Preview the release with `npm run release:production -- --ticket RELEASE_ID`.
3. Verify the preview names the intended `main` commit and rollback commit.
4. Dispatch with `npm run release:production -- --ticket RELEASE_ID --execute`.
5. Open the production deployment workflow in GitHub Actions and wait for validation, CDK deploy,
   web publication, invalidation, and authenticated canary jobs to finish.
6. Record the workflow URL, commit SHA, start/end time, and successful conclusion. A dispatched run
   is not evidence of a successful deployment.

## 3. Prove the native compatibility route is live

From a trusted terminal, send a read-only request with the same headers as build 1:

```sh
curl --fail-with-body --silent --show-error \
  -H 'x-naaseh-client-platform: ios' \
  -H 'x-naaseh-client-build: 1' \
  -H 'x-naaseh-contract-version: 4' \
  https://gsd.thepandas.link/api/client/compatibility
```

Repeat with `ipados` and `macos`. Each response must be HTTP 200, contain one of the documented
compatibility modes, report contract version 4, and contain no user data. A 404 proves the native
API deployment is missing. A 5xx or unexpected upgrade block must be resolved before TestFlight.

## 4. Prove authenticated telemetry and installation registration

Use only the production smoke account in a signed TestFlight-configured build:

1. Sign in and open the app once on each platform.
2. Confirm the compatibility gate permits the build.
3. Submit the built-in privacy-safe diagnostic test event. In CloudWatch, find the bounded native
   event/metric by platform, build, operation class, outcome, and correlation ID. Confirm there is no
   task label, project name, transcript, device token, session value, or ciphertext.
4. Grant notifications. Confirm `POST /api/v1/push-subscriptions` returns success and creates an
   `APPLE#...` record under the smoke user's existing push partition. Inspect only keys and bounded
   metadata; do not copy the APNs token into evidence.
5. Deny or revoke permission and sign out. Confirm the unregister path removes or invalidates the
   installation for that client.

## 5. Prove APNs delivery without exposing content

1. Schedule a synthetic smoke task alert two minutes ahead.
2. Put the app in the background and then terminate it for a separate run.
3. Confirm a generic notification arrives for iOS/iPadOS and macOS using the correct bundle topic.
4. Confirm CloudWatch increments `APNSDeliveries` and does not increment configuration/permanent
   failure metrics.
5. Tap the alert and verify authorized routing. Repeat after removing task access; the stale alert
   must show a safe unavailable state.

## 6. Finish the retired Google subsystem cleanup

After the successful deployment and after confirming no rollback will restore Google sync:

1. In Secrets Manager, locate the retained former Google OAuth secret by its CloudFormation tags or
   prior stack resource ID. Verify it is the Google credential, not the shared Web Push/APNs secret.
2. Revoke/delete the OAuth client in Google Cloud first so retained refresh tokens can no longer be
   used.
3. Schedule deletion of only the retired Google OAuth secret using the organization's normal
   recovery window. Record its ARN and scheduled deletion date privately.
4. Do not scan/delete arbitrary DynamoDB items during the native release. The removed code can no
   longer use old integration records; delete them later only through a separately reviewed,
   backup-aware migration.

## Release decision

Production-backed testing may begin only when the workflow is green, all three compatibility checks
return the expected decision, authenticated telemetry is visible and private, both APNs topics
deliver generic smoke alerts, and the deployment diff contains no unexpected AWS resource or cost.
