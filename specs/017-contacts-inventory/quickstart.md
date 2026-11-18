# Validation Quickstart — Contacts and Inventory

Run from the repository root with Node 24 and the lockfile’s Playwright version. Use synthetic contacts, medicines, images, and two workspace members, an outsider and a catalog administrator. Do not use actual medication or contact data in test fixtures.

## Existing repository gates

```sh
npm ci
npm run check:runtime
npm run validate
npm run apple:contracts
npx playwright install chromium webkit
npm run validate:pre-aws:browsers
```

Use `npm run dev` for the existing local shell. Implementation must add a local feature host fixture that serves a real built manifest/assets and a test API on the same origin as the shell. It must be able to switch a release off, stage a version and switch the manifest independently of the shell. The feature-specific validation commands below are targets for implementation and become runnable as the feature suites are added.

```sh
npm test -- -t 'Contacts and Inventory'
npm run test:e2e -- --list --grep 'Contacts and Inventory'
npm run test:e2e -- --grep 'Contacts and Inventory'
```

For the front-to-back AWS check, synthesize the host and feature stacks with the existing repository CDK setup and scope the diff to the intended stacks. The code and release runbook must provide the isolated AWS fixture configuration and protected feature workflow inputs. There is no standing staging environment. Use an approved isolated AWS environment for real service evidence. Completing this guide is separate from authorizing production deployment.

## End-to-end scenarios

| Scenario | Procedure and expected result |
| --- | --- |
| Contacts and admin catalogs | Add a location with a multiline memo and a new strength unit as admin. Sign in as a standard user. Create a Prescriber under Lists → Contacts with default state CO, a preferred callable number and a zip with a leading zero. Edit that number and check the effective default changes. Filter by name/number and type, clear, and reopen the same UUID. Confirm a standard user cannot change catalogs. |
| Base Inventory and images | Create a base item with a location. Attach a valid JPEG or PNG. Try oversized, non-image, quarantined, failed, duplicate and concurrent replacements, including a stale clean scan after removal. The original remains until a valid replacement succeeds. An item has at most one active image. Rename the location and verify the same item shows the new label. |
| Medicine | Select Medicine and save all required fields plus a decimal strength, unit, optional annotated dose/date, and accessible Prescriber. Confirm the picker excludes non-Prescribers and contacts outside the workspace. Race an attempted type change with linking that contact to Medicine. Verify the two writes cannot orphan the link. Rename the unit and preserve the reference. Check Medicine-only filters, switching to Base or All, and independent medication-list and Status changes. |
| Search | Seed the same name fragment in all three feature scopes and an existing host/Finance result where available. Test all eight scope combinations and legacy preferences with missing keys. Check labels, links, counts, outsider denial and account-switch clearing. Compare the existing combined Search results before and after activation. |
| Offline and conflict | Open the feature online to warm assets and encrypted records, disconnect, reload, edit and add a Prescriber plus a Medicine, and save a non-image edit with an image deferred. Reconnect in the foreground, replay in dependency order, and retry a lost acknowledgment. Force another device’s edit and verify conflict resolution preserves the draft. Inspect the worker cache for immutable code only and verify protected drafts do not leak after another account signs in. Test Safari foreground return, reload and explicit sign-out confirmation with pending work. |
| Authorization and durability | Exercise cookie/session revocation, CSRF failure, forged workspace and outsider access, and admin catalog-only permissions. Inspect CloudWatch for safe request correlation and redaction. Restore paired table and S3 data into isolated targets and verify workspace isolation, retained tombstones, medication links and exact clean active image versions. Restore points from before a deletion and image removal, replay the retained ledger, and verify neither becomes visible. Confirm an old cursor forces a fresh snapshot and a stale scan event cannot activate the image. |
| Shared records and deletion | Create Contacts, base items and Medicine as one member and edit the same UUIDs as the other. Delete an inventory item with an image and confirm both accounts lose detail, Search and image access. Reconnect a device with a stale edit and verify the cached record disappears and the edit cannot revive it. Replay an old mutation receipt and request a feed page from before deletion. Expect tombstone metadata without deleted record fields. Confirm a linked Prescriber is protected until its links are cleared. Fetch an image in multiple ranges, delete or replace it before the next range, and verify the stale request cannot finish rendering the old image. |
| Performance and responsive behavior | Load 500 contacts and 500 items, including Medicine, on a representative throttled mobile viewport. Capture input-to-updated-results timing for at least 40 representative queries and filter changes, and require at least 95% within 2 seconds once data is loaded. Check core forms and results on Chromium, WebKit, and iPhone/iPad touch layouts. Run the first-use Prescriber-to-Medicine workflow with five representative testers and check the threshold in SC-001. |

## Release verification

Use the workflow and [release contract](contracts/host-release.md) to capture release IDs, artifact and stack fingerprints, canary output, expected active manifest and tested recovery points. Validate both target configurations.

1. On the prepared main web baseline with pending Finance and Mac/iOS changes absent, verify the pre-install shell. Install feature version A independently and run Contacts, Inventory, Admin and Search canaries. Withdraw the first release and confirm host route fallback, no feature controls, and retained data.
2. On a compatible host with Finance present, activate version A, save synthetic records and an image, install version B, and roll back to A. Verify stale B tabs handle withdrawal, A reads active data written by B and honors B’s deletions, a Finance workflow passes, and existing native contract probes and authenticated endpoint smoke tests succeed before and after each transition. Redeploy B and reopen the preserved records. Record that Finance artifacts and native contracts were outside the deployment and rollback targets.
3. Confirm CloudFront route/cache separation, private asset and upload boundary configuration, API-stage and scan behavior, backup coverage, and log/alert coverage using the actual AWS resources. Attach the evidence to the release review.
4. Keep this full matrix outside the required PR gate. Any later change to required tests must record the resulting counts and local before/after runtime. Browser changes use `/usr/bin/time -p npm run test:e2e:quick`. Confirm hosted PR validation stays within ten minutes before merging any expansion.
