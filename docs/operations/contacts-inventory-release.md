# Contacts and Inventory release and recovery

Use the protected production host for release acceptance with synthetic records. Run the paired recovery drill using disconnected destinations in the same AWS account. The prepared web host supplies the same-origin routing, authorizer, and browser vault. Provision the retained feature data stack once per environment. It owns the records table, deletion ledger, private versioned media bucket, and backup plan. Each release has its own API stack and immutable web assets. Keep the preceding runnable release and its artifacts available through the rollback window.

## Install, upgrade and rollback

1. Record the host deployment, Finance artifact fingerprint if present, Apple contract probe result, current feature manifest and target AWS account. Run the feature checks and synthesize the two feature stacks. Confirm the deployment targets in the diff against the [release contract](../../specs/017-contacts-inventory/contracts/host-release.md).
2. Provision `NaasehContactsInventoryData` with the production HTTPS origin. Set the `production` environment variable `NAASEH_CONTACTS_INVENTORY_MEDIA_ORIGIN` from its `MediaUploadOrigin` output, then deploy the one-time web host bridge through the existing production workflow. Capture the known-good host SHA before deployment.
3. Configure the protected `contacts-inventory-release` GitHub environment with `FEATURE_WEB_ORIGIN`, `FEATURE_ARTIFACT_BUCKET`, `HOST_API_ID`, `HOST_AUTHORIZER_ID`, and the same `NAASEH_CONTACTS_INVENTORY_MEDIA_ORIGIN`. Read the bucket, API and authorizer identifiers from the host stack outputs. Provide a feature release role, workspace ID, two distinct member identities, and a current member canary cookie using the workflow's secrets. Provision the retained data stack before publishing. The workflow currently targets `us-west-2`.
4. Dispatch `deploy-contacts-inventory.yml` from the reviewed release ref with operation `publish`. Enter `inactive` for the first installation, or the current manifest's release ID for an upgrade. The job publishes the release, probes assets and authorization, and updates the manifest only if the expected ID still matches. Capture the run, manifest, API stack ID, and access probe results as release evidence.
5. Roll back an upgrade with `activate`. Set `expected_release` to the active ID and `retained_release` to the preceding runnable ID. Use `withdraw` to undo a first installation. Confirm a stale tab stops calling its withdrawn release. Verify the prior release can read retained data and still honors records and images deleted by the newer release. Confirm that the Finance and native probes in the [quickstart](../../specs/017-contacts-inventory/quickstart.md) match their saved baseline.

## Monitoring and cost

Application logs have 30-day retention and the audit projection has 90-day retention. Use a correlation ID to inspect request outcomes and latency. Keep record field values, credentials, signed URLs, object keys, and query strings out of operational evidence.

| Alarm                        | Trigger                                                               | First check                                                                                      |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Feature request failures     | At least three failures in two of three five-minute periods           | Check the active manifest and correlate recent request failures with the deployed release        |
| Image scan age               | At least 900 seconds in two of three five-minute periods              | Check GuardDuty scan plan health and delivery of matching S3 object-version events               |
| Image reconciliation backlog | At least 20 timed-out scan events in two of three five-minute periods | Review pending candidates, timeout behavior and the scan event handler                           |
| Backup failure               | One matching failed, aborted or expired backup event                  | Review the job in the retained vault and check the last usable recovery points for each resource |

The planning estimate is $1–$5 per month in Oregon for 20,000 monthly requests, 100,000 billed read units, 20,000 billed write units, 0.1 GB of database data, 2 GB of retained images, and 250 uploads totaling 0.5 GB per month. Search matches authorized records in the browser. Track daily backups and retained image versions alongside request volume, scan fees, transfer, logging and KMS usage. The [cost model](../../specs/017-contacts-inventory/research.md) records the assumptions. Record measured figures during production acceptance.

## Paired recovery drill

1. Use a synthetic workspace. Save recovery points for the records table and media bucket from before deleting a record and removing a different item's image. Retain the current authoritative deletion ledger and record the recovery point times, known clean versions, and the current workspace generation.
2. Restore the table and bucket into isolated targets. Keep clients and scan processing disconnected from the recovered copy while reconciling it. Reapply current authoritative record and image deletion entries in sequence. Remove deleted record payloads and stale projections from the recovered copy. Preserve ledger metadata and apply the recorded image generation even if the earlier bucket recovery point includes the bytes.
3. Rebuild Prescriber reference counts from active Medicine and validate that every remaining link is to an active eligible Prescriber in that workspace. Check surviving image pointers against the exact clean object versions in the recovered bucket. Keep an image unavailable if its version or clean status cannot be verified.
4. Set a new workspace sync generation before allowing requests. Check that an old checkpoint requires a fresh snapshot and an old write, mutation replay, image validator or scan event cannot restore deleted content. Verify both authorized accounts can read remaining data and the outsider cannot read workspace records or image bytes. Run the browser conflict and reconciliation paths using a stale encrypted snapshot from before recovery.
5. Record the read/write and scan results, paired recovery IDs, reference counts, redaction and alarm evidence, and cost in [validation evidence](../testing/contacts-inventory-validation.md). Keep recovery resources until the evidence is reviewed.

The paired restore and reconciliation steps require an operator and have yet to be run against AWS.
