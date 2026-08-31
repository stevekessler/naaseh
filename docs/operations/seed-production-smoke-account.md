# Seed the production smoke account

Last reviewed: 2026-08-30

Use this runbook to prepare the dedicated `naaseh-smoke` account for the non-destructive production
canary. The account and all of its content are synthetic. Never substitute a personal account, a
real Journal, or real Crisis Plan content.

The finished account must have two durable, application-created records:

- a Journal key envelope containing an owner PIN wrap and recovery-key wrap; and
- one encrypted Crisis Plan containing only non-sensitive test text.

The canary reads both records twice through the production API. It never creates, updates, shares,
revokes, or deletes them.

## First Journal rollout sequencing

The Journal UI and API must already be running before the account can create these records. If the
current production release does not yet contain Journal, use two reviewed production releases:

1. Deploy the Journal/Crisis Plan runtime and infrastructure while retaining the previously passing
   production canary. Do not add the Journal/Crisis Plan record assertions in this first release.
2. Seed and verify `naaseh-smoke` using this runbook.
3. In a second reviewed pull request, enable the expanded non-destructive canary and complete the
   normal production release procedure.

Do not combine the first Journal deployment with a canary that requires pre-existing Journal data.
Do not bypass a failing canary, temporarily make its assertions optional, race the workflow by
editing data while it runs, or inject handcrafted ciphertext directly into DynamoDB.

If Journal is already deployed and the smoke account already has the required durable records, the
two-release bootstrap is unnecessary. Re-seeding is not part of routine releases.

## Prerequisites

- Production is `https://gsd.thepandas.link`; stop if the browser is on another hostname.
- The deployed release includes the Journal and Crisis Plan routes.
- `naaseh-smoke` is an active ordinary user, not an administrator. Create it through
  [User provisioning](user-provisioning.md) if needed.
- The account password, account PIN, and separate Journal PIN are unique synthetic credentials held
  in the approved operator password vault.
- The browser is online and not shared with a real user's signed-in session.
- The operator has the authority to update secrets in the protected GitHub `production`
  environment.

The Journal PIN is not used by GitHub Actions. Do not put it in a GitHub secret, command, shell
history, ticket, pull request, screenshot, or log.

## 1. Confirm account scope

Sign in manually at `https://gsd.thepandas.link` as `naaseh-smoke`.

Confirm that:

- the account can open ordinary user navigation;
- administration is unavailable;
- the page reports an online, synchronized session; and
- no real user data is visible.

Stop and correct provisioning if any check fails.

## 2. Create the encrypted Journal envelope

1. Open **Journal**.
2. If **Create your private Journal** appears, enter the dedicated Journal PIN and choose
   **Create Journal**. Store the PIN in the operator vault.
3. If **Unlock Journal** appears instead, the browser already has an enrollment. Unlock it with the
   stored Journal PIN; do not create a replacement envelope merely to refresh the canary.
4. Keep the page online until the global synchronization status is **Synced** with no conflict or
   pending count.

The browser must generate the Journal master key, owner wrap, and recovery wrap. Only the encrypted
key envelope may leave the browser. Never generate a replacement envelope in an AWS console,
Lambda console, shell script, or DynamoDB editor.

Enrollment fails closed unless the browser verifies the signed, same-account recovery-key registry,
creates both wraps, writes the complete envelope through the authenticated API, and reads the same
envelope back from durable storage. Do not treat a locally displayed unlock screen as proof that
server enrollment completed.

## 3. Create the non-sensitive Crisis Plan

1. In Journal, open **Crisis Plans**, then **My Crisis Plan**.
2. Enter a short synthetic value such as:

   > Synthetic production canary plan. This contains no personal, clinical, or emergency
   > information. Contact the designated test operator if manual verification is required.

3. Choose **Save Crisis Plan** and wait for **Crisis Plan saved**.
4. Keep the page online until the global synchronization status returns to **Synced** with no
   conflict or pending count.
5. Do not share this plan. Sharing and revocation are verified separately with temporary synthetic
   owner/recipient accounts during the approved post-deployment checks.

## 4. Verify owner access without changing data

1. Choose **Lock** in Journal, then unlock with the stored Journal PIN.
2. Open **Crisis Plans** and confirm the exact synthetic plan renders.
3. Sign out normally, which removes the browser's authorized local Journal data.
4. Sign in again as `naaseh-smoke`, open **Journal**, and wait for the server enrollment to restore.
5. Unlock with the same Journal PIN and confirm the exact synthetic Crisis Plan renders.
6. Refresh once and confirm the encrypted plan still renders after unlocking if prompted.

This sign-out/sign-in check proves the supported application path can restore the owner wrap from
the durable server envelope rather than relying on the original browser enrollment state. It does
not expose or recreate the Journal master key.

## 5. Configure protected smoke credentials

Store only the ordinary account username and password in the protected GitHub environment. The
commands prompt for values and do not require putting secrets on the command line:

```console
gh secret set PRODUCTION_SMOKE_USERNAME --env production
gh secret set PRODUCTION_SMOKE_PASSWORD --env production
gh secret list --env production --json name,updatedAt \
  --jq '.[] | {name, updatedAt}'
```

The expected names must appear with current timestamps. GitHub does not reveal their values.

## 6. Run and record the canary

Run the normal reviewed production workflow as described in
[Complete routine production release with AWS](release-with-aws.md). Its `smoke` job must prove:

- authenticated sync bootstrap succeeds;
- Journal key-envelope and Crisis Plan routes return `200` and `Cache-Control: no-store`;
- two separate reads return identical durable DynamoDB-backed records;
- the sharing-key registry signature verifies; and
- an unauthorized broker request returns the concealed denial without being cached.

Record the workflow URL, release SHA, smoke-job result, and change ticket. Do not record response
bodies, ciphertext, cookies, credentials, user IDs, plan IDs, or request IDs.

## Failure handling

- `401` or login failure: rotate or correct only the protected smoke-account credentials; do not
  weaken authentication.
- Journal key-envelope `404`: stop. Enrollment did not reach durable server storage. Do not insert a
  record manually or mark the account seeded.
- Crisis Plan `404`: stop. Confirm the save completed and synchronization is **Synced**; do not
  handcraft a DynamoDB item.
- `409` or a visible conflict: preserve both encrypted versions and resolve through the application
  workflow before retrying.
- Registry-signature failure: stop the release and investigate KMS/registry configuration.
- Broker `403` with `CRISIS_PLAN_ACCESS_DENIED`: expected only for the canary's deliberately
  unauthorized broker request.
- Any response without `Cache-Control: no-store`: stop the release.

Repeated failure is a release blocker. Preserve the previous known-good release and follow the
rollback procedure; do not delete the synthetic account or its encrypted records while diagnosing
the issue.

## Maintenance

- Keep the smoke account active, ordinary, and excluded from real work.
- Review its synthetic content and credential ownership at least quarterly and after operator
  turnover.
- Rotate the account password through the normal application flow. Update the protected GitHub
  secret immediately afterward.
- Rotate the Journal PIN only through Journal settings and verify lock/unlock afterward. GitHub does
  not need the Journal PIN.
- Do not routinely recreate the Journal envelope or Crisis Plan; stable records are what make the
  persistence canary useful.
